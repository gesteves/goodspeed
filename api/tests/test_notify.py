from __future__ import annotations

import bugsnag
import pytest

from goodspeed import notify


@pytest.fixture(autouse=True)
def _reset_notify_state(monkeypatch):
    """Each test starts with a fresh notify module state.

    The Bugsnag global config and the notify module's own latched flags
    persist across tests by design (configure-once, dedupe-forever); reset
    them so test order doesn't matter.
    """
    monkeypatch.setattr(notify, "_configured", False)
    monkeypatch.setattr(notify, "_download_fallback_notified", False)
    # Bugsnag's `configuration` is a module-level singleton; drop the API key
    # so each test reconfigures from scratch.
    monkeypatch.setattr(bugsnag.configuration, "api_key", None)


def test_configure_noop_without_api_key(monkeypatch):
    """No BUGSNAG_API_KEY → configure() leaves the SDK unconfigured."""
    monkeypatch.delenv(notify.API_KEY_ENV, raising=False)

    notify.configure()

    assert bugsnag.configuration.api_key is None


def test_configure_sets_api_key_and_release_stage(monkeypatch):
    """With the env vars set, configure() populates the global Bugsnag client."""
    monkeypatch.setenv(notify.API_KEY_ENV, "test-key-123")
    monkeypatch.setenv(notify.RELEASE_STAGE_ENV, "staging")

    notify.configure()

    assert bugsnag.configuration.api_key == "test-key-123"
    assert bugsnag.configuration.release_stage == "staging"


def test_configure_is_idempotent(monkeypatch):
    """A second configure() call doesn't re-read env or re-call bugsnag.configure."""
    monkeypatch.setenv(notify.API_KEY_ENV, "first-key")
    notify.configure()

    # Change the env after the first configure — the second call must be a no-op.
    monkeypatch.setenv(notify.API_KEY_ENV, "second-key")
    notify.configure()

    assert bugsnag.configuration.api_key == "first-key"


def test_report_failure_noop_without_api_key(monkeypatch):
    """No API key → report_failure never calls bugsnag.notify."""
    monkeypatch.delenv(notify.API_KEY_ENV, raising=False)
    notify.configure()

    def _no_notify(*a, **k):
        raise AssertionError("must not call bugsnag.notify when unconfigured")

    monkeypatch.setattr(bugsnag, "notify", _no_notify)
    notify.report_failure("scheduled_run.failed", {"rc": 2})


def test_report_failure_posts_to_bugsnag(monkeypatch):
    """With Bugsnag configured, report_failure passes the event + detail through."""
    monkeypatch.setenv(notify.API_KEY_ENV, "k")
    notify.configure()

    calls: list[dict] = []
    monkeypatch.setattr(
        bugsnag,
        "notify",
        lambda exc, **kw: calls.append({"exc": exc, **kw}),
    )

    notify.report_failure("scheduled_run.exception", {"error": "RuntimeError: boom"})

    assert len(calls) == 1
    call = calls[0]
    assert isinstance(call["exc"], RuntimeError)
    assert str(call["exc"]) == "scheduled_run.exception"
    assert call["severity"] == "error"
    assert call["context"] == "scheduled_run.exception"
    assert call["metadata"] == {"goodspeed": {"error": "RuntimeError: boom"}}


def test_report_failure_swallows_bugsnag_errors(monkeypatch):
    """A failing bugsnag.notify is logged, never raised — alerting can't break the run."""
    monkeypatch.setenv(notify.API_KEY_ENV, "k")
    notify.configure()

    def _boom(*a, **k):
        raise ConnectionError("bugsnag unreachable")

    monkeypatch.setattr(bugsnag, "notify", _boom)
    notify.report_failure("scheduled_run.failed", {"rc": 2})  # must not raise


def test_report_download_fallback_posts_once_per_process(monkeypatch):
    """First call notifies; subsequent calls in the same process are silent."""
    monkeypatch.setenv(notify.API_KEY_ENV, "k")
    notify.configure()

    calls: list[dict] = []
    monkeypatch.setattr(
        bugsnag,
        "notify",
        lambda exc, **kw: calls.append({"exc": exc, **kw}),
    )

    notify.report_download_fallback({"cycle": "2026-05-22T21:00:00Z"})
    notify.report_download_fallback({"cycle": "2026-05-22T21:00:00Z"})
    notify.report_download_fallback({"cycle": "2026-05-23T03:00:00Z"})

    assert len(calls) == 1
    call = calls[0]
    assert str(call["exc"]) == "opendap.download_fallback"
    assert call["severity"] == "warning"
    assert call["metadata"] == {"goodspeed": {"cycle": "2026-05-22T21:00:00Z"}}


def test_report_download_fallback_noop_without_api_key(monkeypatch):
    """No API key → no bugsnag.notify call (but the dedup flag still latches)."""
    monkeypatch.delenv(notify.API_KEY_ENV, raising=False)
    notify.configure()

    def _no_notify(*a, **k):
        raise AssertionError("must not call bugsnag.notify when unconfigured")

    monkeypatch.setattr(bugsnag, "notify", _no_notify)
    notify.report_download_fallback({"cycle": "X"})


@pytest.mark.parametrize(
    "rc, raises, expected_event",
    [(2, None, "scheduled_run.failed"), (0, RuntimeError("boom"), "scheduled_run.exception")],
)
def test_safe_run_alerts_on_failure(monkeypatch, rc, raises, expected_event):
    """_safe_run forwards both rc-nonzero and exceptions to report_failure."""
    from goodspeed import main

    def _run_once(*a, **k):
        if raises is not None:
            raise raises
        return rc

    sent: list[str] = []
    monkeypatch.setattr(main, "run_once", _run_once)
    monkeypatch.setattr(
        main.notify, "report_failure", lambda event, detail: sent.append(event)
    )

    main._safe_run(None)
    assert sent == [expected_event]


def test_safe_run_silent_on_success(monkeypatch):
    """A clean run (rc 0) sends nothing."""
    from goodspeed import main

    sent: list[str] = []
    monkeypatch.setattr(main, "run_once", lambda *a, **k: 0)
    monkeypatch.setattr(
        main.notify, "report_failure", lambda event, detail: sent.append(event)
    )

    main._safe_run(None)
    assert sent == []
