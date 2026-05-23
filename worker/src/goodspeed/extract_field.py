"""Extract a surface-layer current/temperature grid for the bay map.

NOAA SFBOFS publishes pre-gridded fields at ~250 m resolution as one file per
hour: ``sfbofs.tNNz.YYYYMMDD.regulargrid.{n|f}NNN.nc``. Each file carries
``Latitude(ny, nx)``, ``Longitude(ny, nx)``, ``mask(ny, nx)`` (0=land, 1=water),
and per-variable arrays of shape ``(time=1, Depth, ny, nx)`` -- ``Depth[0] == 0``
is the surface.

This module:

1. Iterates the requested nowcast/forecast hours.
2. For each file: opens via OPeNDAP, crops to the bbox + water mask, takes the
   surface depth layer, extracts u/v/temp at that one timestep.
3. Merges the per-hour frames into a :class:`FieldGrid` with the shared
   in-water grid coordinates (P points) and a time series of length T.

A file that 404s or fails to open is skipped with a warning -- a single
missing hour is acceptable for the map. The caller can decide what to do if
the resulting frame count is too low.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
import xarray as xr

from .catalog import Cycle, Phase, regulargrid_dods_url

log = logging.getLogger(__name__)


# Tight corridor around Alcatraz -> Marina Green.
FIELD_BBOX: tuple[float, float, float, float] = (37.804, 37.836, -122.455, -122.400)

# SFBOFS publishes 7 nowcast hours (n000..n006) and 49 forecast hours
# (f000..f048) per cycle.
NOWCAST_HOURS: tuple[int, ...] = tuple(range(7))
FORECAST_HOURS: tuple[int, ...] = tuple(range(49))

# Variable names in the regulargrid file.
_VAR_U = "u_eastward"
_VAR_V = "v_northward"
_VAR_TEMP = "temp"

# Maximum acceptable share of failing hours before we treat the field feed as
# broken and let the caller decide. Single hour misses are tolerated.
MAX_FAILED_FRACTION: float = 0.5


@dataclass(slots=True)
class FieldGrid:
    """Surface-layer regulargrid data over the bbox + a time series.

    Arrays:
      * ``times`` shape ``(T,)`` of tz-aware ``datetime``.
      * ``lat``, ``lon`` shape ``(P,)`` -- the shared in-water grid points.
      * ``temp_c``, ``u_ms``, ``v_ms`` shape ``(T, P)``.
    """

    times: np.ndarray            # object[datetime], shape (T,)
    lat: np.ndarray              # shape (P,)
    lon: np.ndarray
    temp_c: np.ndarray           # shape (T, P)
    u_ms: np.ndarray
    v_ms: np.ndarray


def _normalize_lon(lon: np.ndarray) -> np.ndarray:
    """Convert 0..360 longitudes to -180..180."""
    return np.where(lon > 180.0, lon - 360.0, lon)


def find_grid_indices(
    ds: xr.Dataset,
    bbox: tuple[float, float, float, float] = FIELD_BBOX,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return ``(i_idx, j_idx, lat[P], lon[P])`` for in-water grid cells in ``bbox``.

    ``i_idx`` and ``j_idx`` are flat 1D arrays of length P giving the
    ``(ny, nx)`` coordinates of each in-water cell inside the bbox.
    """
    lat = np.asarray(ds["Latitude"].load().values, dtype=np.float64)
    lon = _normalize_lon(np.asarray(ds["Longitude"].load().values, dtype=np.float64))
    mask = np.asarray(ds["mask"].load().values)
    lat_min, lat_max, lon_min, lon_max = bbox
    cond = (
        (lat >= lat_min)
        & (lat <= lat_max)
        & (lon >= lon_min)
        & (lon <= lon_max)
        & (mask == 1)
    )
    ii, jj = np.where(cond)
    if len(ii) == 0:
        raise ValueError(f"No in-water grid cells in bbox {bbox}")
    return ii, jj, lat[ii, jj], lon[ii, jj]


def _decode_time(ds: xr.Dataset) -> datetime:
    """Extract the file's single timestamp as a tz-aware UTC ``datetime``."""
    raw = ds["time"].values[0]
    if isinstance(raw, np.datetime64):
        ns = raw.astype("datetime64[ns]").astype("int64")
        return datetime.fromtimestamp(ns / 1e9, tz=UTC)
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=UTC)
    raise TypeError(f"Unexpected time type: {type(raw)!r}")


def extract_frame_from_dataset(
    ds: xr.Dataset,
    bbox: tuple[float, float, float, float] = FIELD_BBOX,
    surface_idx: int = 0,
) -> dict[str, np.ndarray | datetime]:
    """Extract one timestep's surface u/v/temp at in-water bbox cells.

    Returns a dict with ``t`` (datetime), ``lat[P]``, ``lon[P]``,
    ``temp_c[P]``, ``u_ms[P]``, ``v_ms[P]``.
    """
    ii, jj, lat, lon = find_grid_indices(ds, bbox)
    u = np.asarray(
        ds[_VAR_U].isel(time=0, Depth=surface_idx).load().values, dtype=np.float64
    )
    v = np.asarray(
        ds[_VAR_V].isel(time=0, Depth=surface_idx).load().values, dtype=np.float64
    )
    temp = np.asarray(
        ds[_VAR_TEMP].isel(time=0, Depth=surface_idx).load().values, dtype=np.float64
    )
    return {
        "t": _decode_time(ds),
        "lat": lat,
        "lon": lon,
        "temp_c": temp[ii, jj],
        "u_ms": u[ii, jj],
        "v_ms": v[ii, jj],
    }


def load_field_frame(
    url: str,
    bbox: tuple[float, float, float, float] = FIELD_BBOX,
    surface_idx: int = 0,
) -> dict[str, np.ndarray | datetime]:
    """Open a single regulargrid file via OPeNDAP and extract one bbox frame."""
    ds = xr.open_dataset(url, engine="netcdf4", decode_times=True)
    try:
        return extract_frame_from_dataset(ds, bbox, surface_idx)
    finally:
        ds.close()


def load_field_grid(
    cycle: Cycle,
    phase: Phase,
    hours: tuple[int, ...],
    bbox: tuple[float, float, float, float] = FIELD_BBOX,
) -> FieldGrid:
    """Load the requested hour files of one phase and concatenate into a FieldGrid.

    Files that fail to open are skipped with a warning. If more than
    ``MAX_FAILED_FRACTION`` of the requested hours fail, raises ``ValueError``
    so the caller can fall back / surface the issue.
    """
    times: list[datetime] = []
    temp_rows: list[np.ndarray] = []
    u_rows: list[np.ndarray] = []
    v_rows: list[np.ndarray] = []
    shared_lat: np.ndarray | None = None
    shared_lon: np.ndarray | None = None
    failures = 0

    for hour in hours:
        url = regulargrid_dods_url(cycle, phase, hour)
        try:
            frame = load_field_frame(url, bbox)
        except Exception as exc:  # noqa: BLE001 - per-hour skip
            failures += 1
            log.warning(
                "field.hour.failed",
                extra={
                    "url": url,
                    "phase": phase,
                    "hour": hour,
                    "error": f"{type(exc).__name__}: {exc}",
                },
            )
            continue

        if shared_lat is None:
            shared_lat = np.asarray(frame["lat"])
            shared_lon = np.asarray(frame["lon"])
        elif not (
            np.array_equal(shared_lat, frame["lat"])
            and np.array_equal(shared_lon, frame["lon"])
        ):
            failures += 1
            log.warning(
                "field.hour.grid_mismatch",
                extra={"url": url, "phase": phase, "hour": hour},
            )
            continue

        times.append(frame["t"])  # type: ignore[arg-type]
        temp_rows.append(np.asarray(frame["temp_c"]))
        u_rows.append(np.asarray(frame["u_ms"]))
        v_rows.append(np.asarray(frame["v_ms"]))

    if not times:
        raise ValueError(
            f"No usable regulargrid files loaded for phase={phase!r} hours={hours}"
        )
    if failures / len(hours) > MAX_FAILED_FRACTION:
        raise ValueError(
            f"Too many failed hours for phase={phase!r}: {failures}/{len(hours)}"
        )

    assert shared_lat is not None and shared_lon is not None
    return FieldGrid(
        times=np.array(times, dtype=object),
        lat=shared_lat,
        lon=shared_lon,
        temp_c=np.stack(temp_rows, axis=0),
        u_ms=np.stack(u_rows, axis=0),
        v_ms=np.stack(v_rows, axis=0),
    )


def source_filenames(cycle: Cycle) -> list[str]:
    """The first nowcast and first forecast filenames -- the field feed's
    ``source_files`` provenance for the model section (representative of the
    set; the full 56-file list would bloat the JSON)."""
    from .catalog import regulargrid_filename

    return [
        regulargrid_filename(cycle, "n", NOWCAST_HOURS[0]),
        regulargrid_filename(cycle, "f", FORECAST_HOURS[-1]),
    ]
