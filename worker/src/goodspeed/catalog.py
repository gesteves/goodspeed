"""Cycle resolution and URL construction for SFBOFS station files."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal

CYCLES: tuple[int, int, int, int] = (3, 9, 15, 21)
READY_BUFFER_MIN: int = 45

THREDDS_BASE = "https://opendap.co-ops.nos.noaa.gov/thredds"
DODS_PATH = "dodsC"
FILESERVER_PATH = "fileServer"
MODEL_PATH = "NOAA/SFBOFS/MODELS"

Kind = Literal["nowcast", "forecast"]


@dataclass(frozen=True, slots=True)
class Cycle:
    """A specific SFBOFS model cycle (UTC date + cycle hour)."""

    date: date
    hour: int

    def datetime_utc(self) -> datetime:
        return datetime.combine(self.date, time(self.hour), tzinfo=UTC)

    def iso(self) -> str:
        return f"{self.date.isoformat()}T{self.hour:02d}:00:00Z"

    def filename(self, kind: Kind) -> str:
        return f"sfbofs.t{self.hour:02d}z.{self.date.strftime('%Y%m%d')}.stations.{kind}.nc"


def latest_ready_cycle(now_utc: datetime, ready_buffer_min: int = READY_BUFFER_MIN) -> Cycle:
    """Return the most recent cycle that should be available now.

    NOAA publishes the forecast file 25-30 min after the cycle hour; the buffer
    is set conservatively to 45 min by default.
    """
    if now_utc.tzinfo is None:
        raise ValueError("now_utc must be timezone-aware")
    candidate = now_utc.astimezone(UTC) - timedelta(minutes=ready_buffer_min)
    for delta_days in range(0, 2):
        d = candidate.date() - timedelta(days=delta_days)
        for hour in reversed(CYCLES):
            cycle_dt = datetime.combine(d, time(hour), tzinfo=UTC)
            if cycle_dt <= candidate:
                return Cycle(date=d, hour=hour)
    raise RuntimeError(f"Could not resolve a cycle on or before {candidate.isoformat()}")


def previous_cycle(cycle: Cycle) -> Cycle:
    """Return the cycle immediately before ``cycle``, rolling back across midnight."""
    idx = CYCLES.index(cycle.hour)
    if idx == 0:
        return Cycle(date=cycle.date - timedelta(days=1), hour=CYCLES[-1])
    return Cycle(date=cycle.date, hour=CYCLES[idx - 1])


def _model_dir(cycle: Cycle, thredds_path: str) -> str:
    yyyy = f"{cycle.date.year:04d}"
    mm = f"{cycle.date.month:02d}"
    dd = f"{cycle.date.day:02d}"
    return f"{THREDDS_BASE}/{thredds_path}/{MODEL_PATH}/{yyyy}/{mm}/{dd}"


def dods_url(cycle: Cycle, kind: Kind) -> str:
    """OPeNDAP URL for slicing the file server-side."""
    return f"{_model_dir(cycle, DODS_PATH)}/{cycle.filename(kind)}"


def fileserver_url(cycle: Cycle, kind: Kind) -> str:
    """HTTPS URL for downloading the full file."""
    return f"{_model_dir(cycle, FILESERVER_PATH)}/{cycle.filename(kind)}"
