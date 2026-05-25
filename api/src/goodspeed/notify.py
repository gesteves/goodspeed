"""Forward scheduled-run failures + the OPeNDAP→download fallback to Bugsnag.

Configured once at process start via :func:`configure`. With no
``BUGSNAG_API_KEY`` set (local runs, tests), every public function is a silent
no-op — alerting must never turn a recoverable run failure into a crash.
"""

from __future__ import annotations

import logging
import os
import threading
from importlib import metadata
from pathlib import Path

import bugsnag

log = logging.getLogger(__name__)

API_KEY_ENV = "BUGSNAG_API_KEY"
RELEASE_STAGE_ENV = "BUGSNAG_RELEASE_STAGE"
DEFAULT_RELEASE_STAGE = "production"

# One-shot guard for the OPeNDAP→download-fallback notification: alert once per
# process so a sustained NOAA OPeNDAP outage doesn't fire on every cycle. A
# process restart (Fly deploy / machine bounce) resets this. The lock protects
# the test-and-set: APScheduler's worker and the warm-up thread can race here.
_download_fallback_notified = False
_download_fallback_lock = threading.Lock()

_configured = False
_configure_lock = threading.Lock()


def configure() -> None:
    """Idempotently configure the global Bugsnag client.

    No-op when ``BUGSNAG_API_KEY`` is unset, so local runs / tests keep the
    silent-no-op semantics that the old Slack code had. Safe to call from
    multiple entrypoints; only the first call wins.
    """
    global _configured
    with _configure_lock:
        if _configured:
            return
        api_key = os.environ.get(API_KEY_ENV)
        if not api_key:
            _configured = True  # remember we already checked
            return

        release_stage = os.environ.get(RELEASE_STAGE_ENV, DEFAULT_RELEASE_STAGE)

        # project_root is the directory containing the `goodspeed/` package;
        # Bugsnag uses it to render repo-relative paths in stack traces.
        project_root = str(Path(__file__).resolve().parent.parent)

        # `goodspeed` only has a version when installed (i.e. via uv); a bare
        # checkout running with PYTHONPATH won't. Soft-fail to None.
        try:
            app_version: str | None = metadata.version("goodspeed")
        except metadata.PackageNotFoundError:
            app_version = None

        bugsnag.configure(
            api_key=api_key,
            project_root=project_root,
            release_stage=release_stage,
            app_version=app_version,
            # CLI / scheduler — sessions add noise without any "request" to
            # bound them.
            auto_capture_sessions=False,
        )
        _configured = True
        log.info(
            "notify.bugsnag_configured",
            extra={"release_stage": release_stage, "app_version": app_version},
        )


def _bugsnag_ready() -> bool:
    """True when Bugsnag has a usable api_key.

    Cheap enough to call on every report; means callers don't need to gate.
    """
    return bool(bugsnag.configuration.api_key)


def report_failure(event: str, detail: dict[str, object]) -> None:
    """Bugsnag-notify a scheduled-run failure.

    Best-effort by design:
      * unset / unconfigured Bugsnag is a silent no-op;
      * any error posting is logged and swallowed.

    Alerting must never turn a recoverable run failure into a crash, so this
    function never raises.
    """
    if not _bugsnag_ready():
        return
    try:
        bugsnag.notify(
            RuntimeError(event),
            context=event,
            severity="error",
            metadata={"goodspeed": dict(detail)},
        )
    except Exception as exc:  # noqa: BLE001 - alerting must never break the run
        log.warning(
            "notify.bugsnag_failed",
            extra={"event": event, "error": f"{type(exc).__name__}: {exc}"},
        )


def report_download_fallback(detail: dict[str, object]) -> None:
    """Notify once per process when OPeNDAP fails and we fall back to HTTPS download.

    Download mode pulls the full NetCDF instead of slicing server-side, so it's
    much slower and more bandwidth-hungry; sustained use suggests a NOAA
    OPeNDAP outage worth investigating. We dedupe to one notification per
    process lifetime to keep the Bugsnag project quiet during multi-hour
    outages.

    Like :func:`report_failure`, missing config / network errors are silent.
    """
    global _download_fallback_notified
    with _download_fallback_lock:
        if _download_fallback_notified:
            return
        _download_fallback_notified = True

    if not _bugsnag_ready():
        return
    try:
        bugsnag.notify(
            RuntimeError("opendap.download_fallback"),
            context="opendap.download_fallback",
            severity="warning",
            metadata={"goodspeed": dict(detail)},
        )
    except Exception as exc:  # noqa: BLE001 - alerting must never break the run
        log.warning(
            "notify.bugsnag_failed",
            extra={
                "event": "opendap.download_fallback",
                "error": f"{type(exc).__name__}: {exc}",
            },
        )
