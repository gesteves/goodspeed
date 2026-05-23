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
    """200 once the point feed exists and parses, 503 otherwise.

    Used by Fly's HTTP health check. The field feed is best-effort in the
    pipeline (see ``main._publish_field_feed``) so it's not a hard requirement.
    """
    cycle = storage.read_published_cycle(out_dir())
    if cycle is None:
        return JSONResponse({"status": "warming"}, status_code=503)
    return JSONResponse({"status": "ok", "cycle": cycle})


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
