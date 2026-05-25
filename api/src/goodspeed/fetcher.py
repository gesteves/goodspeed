"""Open a SFBOFS station NetCDF file, preferring OPeNDAP, with a download fallback."""

from __future__ import annotations

import contextlib
import logging
import socket
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import requests
import xarray as xr

from .catalog import Cycle, Kind, Product, dods_url, fileserver_url

log = logging.getLogger(__name__)

OPENDAP_RETRIES: tuple[float, float, float] = (5.0, 15.0, 45.0)
DOWNLOAD_TIMEOUT_S = 120
HEAD_TIMEOUT_S = 30
# Per-attempt cap for OPeNDAP socket reads. netCDF4's HDF5/curl backend does
# not expose a timeout knob, so we use the process-wide socket default to
# bound a hung TCP read at xr.open_dataset(). The retry loop above amortizes
# transient failures.
OPENDAP_SOCKET_TIMEOUT_S = 90

FetchMode = Literal["opendap", "download"]


@dataclass(slots=True)
class FetchMeta:
    cycle: Cycle
    kind: Kind
    url: str
    mode: FetchMode
    elapsed_s: float
    local_path: Path | None = None  # set when mode == "download"


class FileNotAvailable(Exception):
    """Raised when both OPeNDAP and HTTPS report the file is missing (404 / catalog miss)."""


def open_dataset(
    cycle: Cycle,
    kind: Kind,
    tmp_root: Path | None = None,
    product: Product = "stations",
) -> tuple[xr.Dataset, FetchMeta]:
    """Open the SFBOFS ``product`` file for ``cycle`` and ``kind``.

    ``product`` is "stations" (default; 250 named locations, small file) or
    "fields" (full FVCOM mesh, much larger -- always slice server-side via
    OPeNDAP before ``.load()``).

    Tries OPeNDAP first (with retries), then falls back to a full HTTPS download.
    Caller is responsible for ``isel`` + ``load()`` to push slicing server-side
    when ``meta.mode == "opendap"``.
    """
    opendap = dods_url(cycle, kind, product)
    last_exc: Exception | None = None
    t0 = time.monotonic()
    for attempt, wait in enumerate(OPENDAP_RETRIES, start=1):
        try:
            log.info(
                "opendap.attempt",
                extra={
                    "url": opendap,
                    "attempt": attempt,
                    "cycle": cycle.iso(),
                    "kind": kind,
                    "product": product,
                },
            )
            with _bounded_socket_timeout(OPENDAP_SOCKET_TIMEOUT_S):
                ds = xr.open_dataset(opendap, engine="netcdf4", decode_times=True)
            log.info(
                "opendap.opened",
                extra={"url": opendap, "elapsed_s": round(time.monotonic() - t0, 2)},
            )
            return ds, FetchMeta(
                cycle=cycle,
                kind=kind,
                url=opendap,
                mode="opendap",
                elapsed_s=round(time.monotonic() - t0, 2),
            )
        except Exception as exc:  # noqa: BLE001 - we classify below
            last_exc = exc
            log.warning(
                "opendap.failed",
                extra={
                    "url": opendap,
                    "attempt": attempt,
                    "error": f"{type(exc).__name__}: {exc}",
                },
            )
            if attempt < len(OPENDAP_RETRIES):
                time.sleep(wait)

    # Fallback to HTTPS download.
    download = fileserver_url(cycle, kind, product)
    log.info(
        "download.start",
        extra={"url": download, "cycle": cycle.iso(), "kind": kind, "product": product},
    )

    # Pre-flight HEAD so a 404 is distinguishable from transient issues — main.py uses
    # FileNotAvailable to decide whether to fall back to the previous cycle.
    try:
        head = requests.head(download, timeout=HEAD_TIMEOUT_S, allow_redirects=True)
    except requests.RequestException as exc:
        log.error("download.head_failed", extra={"url": download, "error": str(exc)})
        raise RuntimeError(f"OPeNDAP failed and HEAD failed for {download}: {exc}") from last_exc

    if head.status_code == 404:
        raise FileNotAvailable(f"{download} not found (404)")
    if 500 <= head.status_code < 600:
        # Server-side trouble (NOAA outage / overload). Caller may fall back
        # to the previous cycle; the distinct log event makes that path easy
        # to spot vs. a client-side misconfig.
        log.warning(
            "download.head_server_error",
            extra={"url": download, "status": head.status_code},
        )
        raise RuntimeError(
            f"NOAA server error: HEAD {download} returned {head.status_code}"
        )
    if head.status_code >= 400:
        raise RuntimeError(f"HEAD {download} returned {head.status_code}")

    tmp_dir = tmp_root if tmp_root is not None else Path(tempfile.gettempdir())
    tmp_dir.mkdir(parents=True, exist_ok=True)
    local = tmp_dir / cycle.filename(kind, product)

    with requests.get(download, stream=True, timeout=DOWNLOAD_TIMEOUT_S) as resp:
        resp.raise_for_status()
        bytes_written = 0
        with local.open("wb") as fh:
            for chunk in resp.iter_content(chunk_size=1024 * 256):
                if chunk:
                    fh.write(chunk)
                    bytes_written += len(chunk)

    log.info(
        "download.done",
        extra={
            "url": download,
            "path": str(local),
            "bytes": bytes_written,
            "elapsed_s": round(time.monotonic() - t0, 2),
        },
    )

    ds = xr.open_dataset(local, engine="netcdf4", decode_times=True)
    return ds, FetchMeta(
        cycle=cycle,
        kind=kind,
        url=download,
        mode="download",
        elapsed_s=round(time.monotonic() - t0, 2),
        local_path=local,
    )


def close_dataset(ds: xr.Dataset | None, meta: FetchMeta | None) -> None:
    """Close ``ds`` and, in download mode, unlink the on-disk tempfile.

    Safe to call with ``None`` arguments. Errors are logged and swallowed so
    cleanup never masks the original failure that triggered it.
    """
    if ds is not None:
        try:
            ds.close()
        except Exception as exc:  # noqa: BLE001 - cleanup must never raise
            log.warning(
                "dataset.close_failed",
                extra={"error": f"{type(exc).__name__}: {exc}"},
            )
    if meta is not None and meta.local_path is not None:
        try:
            meta.local_path.unlink(missing_ok=True)
        except OSError as exc:
            log.warning(
                "dataset.unlink_failed",
                extra={"path": str(meta.local_path), "error": str(exc)},
            )


@contextlib.contextmanager
def _bounded_socket_timeout(seconds: float):
    """Set the process-wide socket default timeout for the duration of the block.

    netCDF4's libcurl-backed HTTP client honors ``socket.getdefaulttimeout()``
    for connect/read; without this, a stalled OPeNDAP TCP read could hang
    well past the scheduler's next fire window.
    """
    previous = socket.getdefaulttimeout()
    socket.setdefaulttimeout(seconds)
    try:
        yield
    finally:
        socket.setdefaulttimeout(previous)
