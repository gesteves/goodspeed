"""Publish JSON feeds to local files, served by :mod:`goodspeed.web`.

The scheduler writes ``latest.json`` and ``field-latest.json`` to a directory
(in production: the Fly Volume at ``/data``) and the Starlette app reads from
the same directory. Writes are atomic so the HTTP server never sees a partial
file under a concurrent read.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import uuid
from pathlib import Path

log = logging.getLogger(__name__)

CONTENT_TYPE = "application/json"
LATEST_CACHE = "public, max-age=300"

LATEST_KEY = "latest.json"
FIELD_LATEST_KEY = "field-latest.json"


# ---- public API -------------------------------------------------------------


def push_feed(body: bytes, out_dir: Path) -> dict[str, str]:
    """Publish the per-station point feed atomically as ``latest.json``."""
    return _write_atomic(body, out_dir, LATEST_KEY)


def push_field_feed(body: bytes, out_dir: Path) -> dict[str, str]:
    """Publish the gridded field (map) feed atomically as ``field-latest.json``."""
    return _write_atomic(body, out_dir, FIELD_LATEST_KEY)


# ---- internals --------------------------------------------------------------


def _write_atomic(body: bytes, out_dir: Path, name: str) -> dict[str, str]:
    """Write ``body`` to ``out_dir/name`` via a tmp file + rename.

    The rename is atomic on POSIX, so an HTTP read for ``name`` always observes
    either the previous version or the new one, never a half-written file.
    """
    out_dir = out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    target = out_dir / name
    tmp = out_dir / f".{name}.{uuid.uuid4().hex}.tmp"
    try:
        tmp.write_bytes(body)
        os.replace(tmp, target)
    finally:
        # On any error the tmp file may linger; remove it best-effort.
        if tmp.exists():
            with contextlib.suppress(OSError):
                tmp.unlink()

    log.info(
        "storage.written",
        extra={"path": str(target), "bytes": len(body)},
    )
    return {"path": str(target)}


# ---- skip-check (point feed only) -------------------------------------------


def read_published_cycle(out_dir: Path) -> str | None:
    """Return the ``model.cycle`` of the currently published ``latest.json``.

    Used to skip the heavy NetCDF fetch when the latest cycle has already been
    published. Returns ``None`` when nothing is published yet or the feed can't
    be read/parsed — callers treat ``None`` as "go fetch". This must never
    raise: a failure here should only ever cost an unnecessary fetch, never a
    run.
    """
    try:
        path = out_dir.expanduser().resolve() / LATEST_KEY
        if not path.is_file():
            return None
        cycle = json.loads(path.read_bytes()).get("model", {}).get("cycle")
        return cycle if isinstance(cycle, str) else None
    except Exception as exc:  # noqa: BLE001 - this optimization must never break a run
        log.warning(
            "storage.cycle_probe_failed",
            extra={"error": f"{type(exc).__name__}: {exc}"},
        )
        return None
