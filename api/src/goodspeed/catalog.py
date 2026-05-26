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
Product = Literal["stations", "fields"]


@dataclass(frozen=True, slots=True)
class Cycle:
    """A specific SFBOFS model cycle (UTC date + cycle hour).

    NOAA runs SFBOFS four times per UTC day at the cycle hours listed in
    :data:`CYCLES`. A ``Cycle`` is the (date, hour) pair that uniquely names
    one model run — every published file (nowcast/forecast, stations/fields,
    per-hour regulargrid) embeds it in its filename.
    """

    date: date
    hour: int

    def datetime_utc(self) -> datetime:
        """Return the cycle start time as a tz-aware UTC ``datetime``."""
        return datetime.combine(self.date, time(self.hour), tzinfo=UTC)

    def iso(self) -> str:
        """Format the cycle as ``YYYY-MM-DDTHH:00:00Z`` for logs and the JSON feed."""
        return f"{self.date.isoformat()}T{self.hour:02d}:00:00Z"

    def filename(self, kind: Kind, product: Product = "stations") -> str:
        """Build the NOAA filename for this cycle's ``kind`` (nowcast/forecast) file.

        ``product`` selects between the per-station file (default, ~250 named
        locations, small) and the full FVCOM mesh fields file (much larger;
        always slice server-side via OPeNDAP before loading).
        """
        return (
            f"sfbofs.t{self.hour:02d}z.{self.date.strftime('%Y%m%d')}"
            f".{product}.{kind}.nc"
        )


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


def dods_url(cycle: Cycle, kind: Kind, product: Product = "stations") -> str:
    """OPeNDAP URL for slicing the file server-side."""
    return f"{_model_dir(cycle, DODS_PATH)}/{cycle.filename(kind, product)}"


def fileserver_url(cycle: Cycle, kind: Kind, product: Product = "stations") -> str:
    """HTTPS URL for downloading the full file."""
    return f"{_model_dir(cycle, FILESERVER_PATH)}/{cycle.filename(kind, product)}"


# ---- regulargrid (pre-gridded per-hour) files -------------------------------

Phase = Literal["n", "f"]  # n = nowcast hour, f = forecast hour


def regulargrid_filename(cycle: Cycle, phase: Phase, hour: int) -> str:
    """Per-hour regulargrid filename, e.g. ``sfbofs.t15z.20260523.regulargrid.f001.nc``.

    SFBOFS publishes 7 nowcast hours (n000..n006) and 49 forecast hours
    (f000..f048) per cycle, each as a single-timestep NetCDF on a regular
    lat/lon grid.
    """
    return (
        f"sfbofs.t{cycle.hour:02d}z.{cycle.date.strftime('%Y%m%d')}"
        f".regulargrid.{phase}{hour:03d}.nc"
    )


def regulargrid_dods_url(cycle: Cycle, phase: Phase, hour: int) -> str:
    """OPeNDAP URL for a single per-hour regulargrid file (used by the field feed)."""
    return f"{_model_dir(cycle, DODS_PATH)}/{regulargrid_filename(cycle, phase, hour)}"
