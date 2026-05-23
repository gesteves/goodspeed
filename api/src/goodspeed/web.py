"""HTTP server that serves the published JSON feeds from disk.

Designed to run inside the same process as the scheduler (see
:func:`goodspeed.main.serve`). All routes serve files written by
:mod:`goodspeed.storage` to :data:`OUT_DIR_ENV` (default ``/data`` in
production, overridable for local dev).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Route

from . import storage

log = logging.getLogger(__name__)

OUT_DIR_ENV = "GOODSPEED_OUT_DIR"
DEFAULT_OUT_DIR = Path("/data")


def out_dir() -> Path:
    """Resolve the directory where the scheduler writes JSON feeds.

    The same env var is read by :func:`goodspeed.main.serve` so the HTTP server
    and the scheduler always look at the same place.
    """
    raw = os.environ.get(OUT_DIR_ENV)
    return Path(raw).expanduser().resolve() if raw else DEFAULT_OUT_DIR


def _serve_file(name: str) -> Response:
    path = out_dir() / name
    if not path.is_file():
        # Brief window after a fresh deploy before the first run_once finishes.
        raise HTTPException(
            status_code=404,
            detail=f"{name} not published yet",
        )
    return FileResponse(
        path,
        media_type=storage.CONTENT_TYPE,
        headers={"Cache-Control": storage.LATEST_CACHE},
    )


async def latest(_: Request) -> Response:
    return _serve_file(storage.LATEST_KEY)


async def field_latest(_: Request) -> Response:
    return _serve_file(storage.FIELD_LATEST_KEY)


async def healthz(_: Request) -> Response:
    """Health check for the point feed; surfaces the field feed state too.

    Status semantics for the *point* feed (drives the HTTP code Fly sees):

    * ``ok``       (200) — file present and parsed.
    * ``warming``  (503) — file not yet published (fresh deploy, brief window).
    * ``broken``   (500) — file present but unreadable/unparseable; on-disk
      corruption or a publish bug.

    The field feed is best-effort in the pipeline (see
    ``main._publish_field_feed``) so it never gates the response code; its
    state is reported in ``field_status`` / ``field_cycle`` for external
    monitoring. ``no-store`` so no intermediary can serve a stale 200 once the
    API has actually started failing.
    """
    out = out_dir()
    point = storage.probe_feed(out, storage.LATEST_KEY)
    field = storage.probe_feed(out, storage.FIELD_LATEST_KEY)
    headers = {"Cache-Control": "no-store"}

    if point.state == "missing":
        return JSONResponse(
            {"status": "warming", "field_status": field.state, "field_cycle": field.cycle},
            status_code=503,
            headers=headers,
        )
    if point.state == "broken":
        return JSONResponse(
            {
                "status": "broken",
                "error": point.error,
                "field_status": field.state,
                "field_cycle": field.cycle,
            },
            status_code=500,
            headers=headers,
        )
    return JSONResponse(
        {
            "status": "ok",
            "cycle": point.cycle,
            "field_status": field.state,
            "field_cycle": field.cycle,
        },
        headers=headers,
    )


async def _http_exception(_: Request, exc: HTTPException) -> Response:
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


app = Starlette(
    routes=[
        Route("/latest.json", latest),
        Route("/field-latest.json", field_latest),
        Route("/healthz", healthz),
    ],
    exception_handlers={HTTPException: _http_exception},
)
