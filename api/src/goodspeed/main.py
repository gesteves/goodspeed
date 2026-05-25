"""CLI entrypoint: one-off run, or long-running scheduler + HTTP server."""

from __future__ import annotations

import argparse
import logging
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from . import (
    catalog,
    extract,
    extract_field,
    fetcher,
    logging_config,
    notify,
    output,
    storage,
    web,
)

if TYPE_CHECKING:
    import xarray as xr

log = logging.getLogger(__name__)


def run_once(
    out_dir: Path,
    max_cycle_fallbacks: int = 2,
    force: bool = False,
) -> int:
    """Fetch the latest available cycle, build the feed, publish it. Returns 0 on success.

    The SFBOFS NetCDF files are large, so before fetching we compare the latest
    ready cycle against the cycle already in the published ``latest.json``. When
    they match there is nothing new to publish and we skip the download. Pass
    ``force=True`` to fetch and republish regardless.
    """
    fetched_at = datetime.now(UTC)
    cycle = catalog.latest_ready_cycle(fetched_at)

    if not force:
        published = storage.read_published_cycle(out_dir)
        if published == cycle.iso():
            log.info(
                "run.skipped",
                extra={"cycle": cycle.iso(), "reason": "latest cycle already published"},
            )
            return 0

    fetched = _fetch_with_fallback(cycle, max_cycle_fallbacks)
    if fetched is None:
        return 2
    nc_ds, nc_meta, fc_ds, fc_meta, resolved_cycle = fetched
    return _build_and_publish(
        resolved_cycle, fetched_at, nc_ds, nc_meta, fc_ds, fc_meta, out_dir
    )


def _fetch_with_fallback(
    starting_cycle: catalog.Cycle, max_attempts: int
) -> tuple[
    xr.Dataset,
    fetcher.FetchMeta,
    xr.Dataset,
    fetcher.FetchMeta,
    catalog.Cycle,
] | None:
    """Open the nowcast + forecast files for ``starting_cycle``, walking back to
    earlier cycles on ``FileNotAvailable``. Returns ``None`` when all attempts
    are exhausted (caller treats as rc=2). Releases any half-opened datasets
    before retrying so a tempfile from a partial download is not leaked.
    """
    cycle = starting_cycle
    nc_ds: xr.Dataset | None = None
    fc_ds: xr.Dataset | None = None
    nc_meta: fetcher.FetchMeta | None = None
    fc_meta: fetcher.FetchMeta | None = None
    tried: list[str] = []
    for attempt in range(max_attempts):
        tried.append(cycle.iso())
        log.info("cycle.attempt", extra={"cycle": cycle.iso(), "attempt": attempt + 1})
        try:
            nc_ds, nc_meta = fetcher.open_dataset(cycle, "nowcast")
            fc_ds, fc_meta = fetcher.open_dataset(cycle, "forecast")
            return nc_ds, nc_meta, fc_ds, fc_meta, cycle
        except fetcher.FileNotAvailable as exc:
            log.warning("cycle.missing", extra={"cycle": cycle.iso(), "error": str(exc)})
            fetcher.close_dataset(nc_ds, nc_meta)
            fetcher.close_dataset(fc_ds, fc_meta)
            nc_ds = fc_ds = nc_meta = fc_meta = None
            cycle = catalog.previous_cycle(cycle)
    log.error("cycle.exhausted", extra={"tried": tried})
    return None


def _build_and_publish(
    cycle: catalog.Cycle,
    fetched_at: datetime,
    nc_ds: xr.Dataset,
    nc_meta: fetcher.FetchMeta,
    fc_ds: xr.Dataset,
    fc_meta: fetcher.FetchMeta,
    out_dir: Path,
) -> int:
    """Extract series from already-opened datasets, validate, and publish both feeds.

    Datasets are closed (and any download tempfiles unlinked) before returning;
    callers do not need to close them.
    """
    try:
        station_idx = extract.find_station_index(nc_ds)
        surface_idx = extract.surface_layer_index(nc_ds, station_idx)
        log.info(
            "extract.indices",
            extra={"station_idx": station_idx, "surface_idx": surface_idx},
        )

        nc_series = extract.extract_station_series(nc_ds, station_idx, surface_idx)
        fc_series = extract.extract_station_series(fc_ds, station_idx, surface_idx)
    finally:
        fetcher.close_dataset(nc_ds, nc_meta)
        fetcher.close_dataset(fc_ds, fc_meta)

    # Truncated NetCDFs can open cleanly with empty/all-NaN arrays. Refuse to
    # publish in that case so a bad upstream file doesn't replace a good feed.
    if len(nc_series.times) == 0 or len(fc_series.times) == 0:
        raise ValueError(
            f"Extracted series have no timesteps "
            f"(nowcast={len(nc_series.times)}, forecast={len(fc_series.times)})"
        )
    if np.all(np.isnan(nc_series.temp_c)) or np.all(np.isnan(fc_series.temp_c)):
        raise ValueError("Extracted temperature is all-NaN; refusing to publish")

    log.info(
        "extract.summary",
        extra={
            "station_lat": nc_series.lat,
            "station_lon": nc_series.lon,
            "nowcast_steps": len(nc_series.times),
            "forecast_steps": len(fc_series.times),
            "nowcast_bytes": nc_series.nbytes_loaded,
            "forecast_bytes": fc_series.nbytes_loaded,
            "fetch_mode_nowcast": nc_meta.mode,
            "fetch_mode_forecast": fc_meta.mode,
        },
    )

    if nc_meta.mode == "download" or fc_meta.mode == "download":
        notify.slack_download_fallback(
            {
                "cycle": cycle.iso(),
                "nowcast_mode": nc_meta.mode,
                "forecast_mode": fc_meta.mode,
                "nowcast_url": nc_meta.url,
                "forecast_url": fc_meta.url,
            }
        )

    source_files = [cycle.filename("nowcast"), cycle.filename("forecast")]
    feed = output.build_feed(cycle, fetched_at, nc_series, fc_series, source_files)

    for warning in output.sanity_check(feed):
        log.warning("sanity.bounds", extra={"warning": warning})

    output.validate_against_schema(feed)
    body = output.serialize(feed)

    locations = storage.push_feed(body, out_dir)
    log.info(
        "run.complete",
        extra={
            "cycle": cycle.iso(),
            "points": len(feed["timeseries"]),
            "bytes": len(body),
            **locations,
        },
    )

    # Field (map) feed -- best-effort: a failure here must never block the
    # point feed publish. The fields file is the full FVCOM mesh and is
    # heavier; we crop to the swim corridor + decimate to 30-min before
    # publishing.
    try:
        _publish_field_feed(cycle, fetched_at, out_dir)
    except Exception as exc:  # noqa: BLE001 - intentional best-effort
        log.warning(
            "field.failed",
            extra={
                "error": f"{type(exc).__name__}: {exc}",
                "cycle": cycle.iso(),
            },
        )

    return 0


def _publish_field_feed(
    cycle: catalog.Cycle,
    fetched_at: datetime,
    out_dir: Path,
) -> None:
    """Build and publish the gridded field feed for the bay map.

    Iterates the NOAA SFBOFS per-hour regulargrid files (7 nowcast + 49
    forecast) for ``cycle``, crops each to the corridor bbox, and assembles
    a 56-frame field feed at 1-hour cadence.
    """
    nc_grid = extract_field.load_field_grid(
        cycle, "n", extract_field.NOWCAST_HOURS
    )
    fc_grid = extract_field.load_field_grid(
        cycle, "f", extract_field.FORECAST_HOURS
    )

    log.info(
        "field.extract",
        extra={
            "cycle": cycle.iso(),
            "grid_points": int(nc_grid.lat.size),
            "nowcast_frames": int(nc_grid.times.size),
            "forecast_frames": int(fc_grid.times.size),
        },
    )

    field_feed = output.build_field_feed(
        cycle,
        fetched_at,
        extract_field.FIELD_BBOX,
        (extract_field.FIELD_CENTER_LAT, extract_field.FIELD_CENTER_LON),
        nc_grid,
        fc_grid,
        extract_field.source_filenames(cycle),
    )
    for warning in output.sanity_check_field(field_feed):
        log.warning("field.sanity.bounds", extra={"warning": warning})
    output.validate_field_against_schema(field_feed)
    body = output.serialize(field_feed)
    locations = storage.push_field_feed(body, out_dir)
    log.info(
        "field.complete",
        extra={
            "cycle": cycle.iso(),
            "grid_points": len(field_feed["grid"]["lat"]),
            "frames": len(field_feed["frames"]),
            "bytes": len(body),
            **{f"field_{k}": v for k, v in locations.items()},
        },
    )


SCHEDULER_CRON = "0,30 5,11,17,23 * * * UTC"


def _build_fetch_trigger():
    """Trigger for the scheduled fetch: two fires per cycle, 8/day total.

    NOAA publishes SFBOFS four times a day (cycles at 03/09/15/21 UTC) with the
    last regulargrid file landing ~HH+1:23 after each cycle. We fire ~2 h after
    each cycle so all files are available, and again 30 min later as cheap
    insurance against a late publish (the second fire is a no-op skip when the
    first succeeded).
    """
    from apscheduler.triggers.cron import CronTrigger

    return CronTrigger(hour="5,11,17,23", minute="0,30", timezone="UTC")


def serve(out_dir: Path | None = None) -> int:
    """Long-running process: SFBOFS-cycle scheduler + Starlette HTTP server.

    The scheduler runs in a background thread (APScheduler ``BackgroundScheduler``);
    uvicorn owns the main asyncio loop. Both touch the same on-disk JSON files
    via :mod:`goodspeed.storage`; reads are concurrent-safe because writes are
    atomic (tmp file + rename).

    NOAA publishes SFBOFS on a tight cadence keyed to the 4 daily cycles
    (03/09/15/21 UTC), with the final files landing ~1 h 25 min after the
    cycle hour. We fire twice per cycle (8x/day) at the times in
    :data:`SCHEDULER_CRON`; ``run_once`` is idempotent so the second fire
    cheaply skips when the first already published the cycle.
    """
    import uvicorn
    from apscheduler.schedulers.background import BackgroundScheduler

    resolved = out_dir if out_dir is not None else web.out_dir()
    resolved.mkdir(parents=True, exist_ok=True)
    log.info("serve.out_dir", extra={"path": str(resolved)})

    # Warm the volume in a thread so a fresh deploy starts serving (with a
    # brief 404 window for /latest.json) without blocking the HTTP server.
    threading.Thread(
        target=_safe_run,
        args=(resolved,),
        name="goodspeed-warmup",
        daemon=True,
    ).start()

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        lambda: _safe_run(resolved),
        trigger=_build_fetch_trigger(),
        id="goodspeed-fetch",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=60 * 30,
    )
    scheduler.start()
    log.info("scheduler.started", extra={"cron": SCHEDULER_CRON})

    try:
        uvicorn.run(web.app, host="0.0.0.0", port=8080, log_config=None)
    except (KeyboardInterrupt, SystemExit):
        log.info("server.stopped")
    finally:
        scheduler.shutdown(wait=False)
    return 0


def _safe_run(out_dir: Path) -> None:
    try:
        rc = run_once(out_dir=out_dir)
        if rc != 0:
            log.error("scheduled_run.failed", extra={"rc": rc})
            notify.slack_failure("scheduled_run.failed", {"rc": rc})
    except Exception as exc:
        log.exception("scheduled_run.exception")
        notify.slack_failure(
            "scheduled_run.exception",
            {"error": f"{type(exc).__name__}: {exc}"},
        )


def cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="goodspeed")
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default INFO).",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    run_p = sub.add_parser("run", help="Fetch the latest cycle once and exit.")
    run_p.add_argument(
        "--out-dir",
        type=Path,
        required=True,
        help="Directory to write JSON to.",
    )
    run_p.add_argument(
        "--force",
        action="store_true",
        help="Fetch and republish even if the latest cycle is already published.",
    )

    serve_p = sub.add_parser(
        "serve", help="Long-running scheduler + HTTP server (Fly Machine entrypoint)."
    )
    serve_p.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help=(
            "Directory to read/write JSON. Defaults to $GOODSPEED_OUT_DIR or "
            f"{web.DEFAULT_OUT_DIR} (the Fly Volume in production)."
        ),
    )

    args = parser.parse_args(argv)
    logging_config.configure(level=args.log_level)

    if args.cmd == "run":
        return run_once(out_dir=args.out_dir, force=args.force)
    if args.cmd == "serve":
        return serve(out_dir=args.out_dir)
    parser.error(f"Unknown command {args.cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(cli())
