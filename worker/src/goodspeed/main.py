"""CLI entrypoint: one-off run or long-running scheduler."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import catalog, extract, fetcher, logging_config, output, storage

log = logging.getLogger(__name__)


def run_once(out_dir: Path | None = None, max_cycle_fallbacks: int = 2) -> int:
    """Fetch the latest available cycle, build the feed, publish it. Returns 0 on success."""
    fetched_at = datetime.now(timezone.utc)
    cycle = catalog.latest_ready_cycle(fetched_at)

    nc_ds = fc_ds = None
    nc_meta = fc_meta = None
    tried: list[str] = []
    for attempt in range(max_cycle_fallbacks):
        tried.append(cycle.iso())
        log.info("cycle.attempt", extra={"cycle": cycle.iso(), "attempt": attempt + 1})
        try:
            nc_ds, nc_meta = fetcher.open_dataset(cycle, "nowcast")
            fc_ds, fc_meta = fetcher.open_dataset(cycle, "forecast")
            break
        except fetcher.FileNotAvailable as exc:
            log.warning("cycle.missing", extra={"cycle": cycle.iso(), "error": str(exc)})
            cycle = catalog.previous_cycle(cycle)
    else:
        log.error("cycle.exhausted", extra={"tried": tried})
        return 2

    assert nc_ds is not None and fc_ds is not None
    assert nc_meta is not None and fc_meta is not None

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
        nc_ds.close()
        fc_ds.close()

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

    source_files = [cycle.filename("nowcast"), cycle.filename("forecast")]
    feed = output.build_feed(cycle, fetched_at, nc_series, fc_series, source_files)

    for warning in output.sanity_check(feed):
        log.warning("sanity.bounds", extra={"warning": warning})

    output.validate_against_schema(feed)
    body = output.serialize(feed)

    locations = storage.push_feed(body, cycle.iso(), out_dir=out_dir)
    log.info(
        "run.complete",
        extra={
            "cycle": cycle.iso(),
            "points": len(feed["timeseries"]),
            "bytes": len(body),
            **locations,
        },
    )
    return 0


def serve(out_dir: Path | None = None) -> int:
    """Long-running scheduler: fire run_once at 03:45, 09:45, 15:45, 21:45 UTC."""
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = BlockingScheduler(timezone="UTC")
    trigger = CronTrigger(hour="3,9,15,21", minute=45, timezone="UTC")
    scheduler.add_job(
        lambda: _safe_run(out_dir),
        trigger=trigger,
        id="goodspeed-fetch",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=60 * 30,
    )
    log.info("scheduler.starting", extra={"cron": "45 3,9,15,21 * * * UTC"})
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("scheduler.stopped")
    return 0


def _safe_run(out_dir: Path | None) -> None:
    try:
        rc = run_once(out_dir=out_dir)
        if rc != 0:
            log.error("scheduled_run.failed", extra={"rc": rc})
    except Exception:
        log.exception("scheduled_run.exception")


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
        default=None,
        help="Write JSON to this local directory instead of S3.",
    )

    serve_p = sub.add_parser("serve", help="Long-running scheduler (Fly Machine entrypoint).")
    serve_p.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="If set, scheduled runs write to this local directory instead of S3.",
    )

    args = parser.parse_args(argv)
    logging_config.configure(level=args.log_level)

    if args.cmd == "run":
        return run_once(out_dir=args.out_dir)
    if args.cmd == "serve":
        return serve(out_dir=args.out_dir)
    parser.error(f"Unknown command {args.cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(cli())
