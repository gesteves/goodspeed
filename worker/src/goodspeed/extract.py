"""Extract surface-layer timeseries for a single station from a SFBOFS dataset."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
import xarray as xr

log = logging.getLogger(__name__)

STATION_ID = "SFB1204"


class StationNotFound(LookupError):
    pass


@dataclass(frozen=True, slots=True)
class StationSeries:
    """Surface-layer timeseries for one station. All arrays share length N (timesteps)."""

    lat: float
    lon: float
    station_idx: int
    surface_idx: int
    times: np.ndarray            # dtype object[datetime] tz-aware UTC, shape (N,)
    temp_c: np.ndarray           # shape (N,)
    salinity_psu: np.ndarray
    u_ms: np.ndarray
    v_ms: np.ndarray
    zeta_m: np.ndarray
    uwind_ms: np.ndarray
    vwind_ms: np.ndarray
    nbytes_loaded: int           # approximate transferred bytes


def _decode_char_names(arr: np.ndarray) -> list[str]:
    """Decode `name_station` to a list of stripped ASCII strings.

    netCDF char(station, clen) arrays may surface as:
      * 1D ``|S<clen>`` (one bytes per row — netCDF4 default behavior)
      * 2D ``|S1`` (one char per cell)
      * 2D ``<U1`` (unicode chars, if xarray decoded)
      * 2D integer (raw byte values)
    """
    def _clean(s: str) -> str:
        return s.replace("\x00", "").strip()

    if arr.dtype.kind == "S":
        if arr.ndim == 1:
            return [_clean(row.decode("ascii", errors="ignore")) for row in arr]
        if arr.ndim == 2:
            return [_clean(b"".join(row).decode("ascii", errors="ignore")) for row in arr]
    elif arr.dtype.kind == "U":
        if arr.ndim == 1:
            return [_clean(str(row)) for row in arr]
        if arr.ndim == 2:
            return [_clean("".join(row.tolist())) for row in arr]
    elif arr.dtype.kind in ("i", "u"):
        return [_clean(bytes(row.tolist()).decode("ascii", errors="ignore")) for row in arr]
    raise ValueError(f"Unsupported name_station dtype/shape: {arr.dtype} {arr.shape}")


def find_station_index(ds: xr.Dataset, station_id: str = STATION_ID) -> int:
    """Find the index of ``station_id`` in ``name_station``.

    SFBOFS prefixes station names with a literal ``x`` (e.g. ``xSFB1204``); this
    matcher tries the bare ID, then the ``x``-prefixed form. Raises
    :class:`StationNotFound` with close matches in the message if neither hits.
    """
    if "name_station" not in ds.variables:
        raise StationNotFound("Dataset has no 'name_station' variable")
    names_da = ds["name_station"].load()
    names = _decode_char_names(names_da.values)
    candidates = (station_id, f"x{station_id}")
    for i, name in enumerate(names):
        if name in candidates:
            log.info(
                "station.found",
                extra={"station_id": station_id, "index": i, "raw_name": name},
            )
            return i
    # Help debugging by reporting close matches (substring on the numeric tail).
    tail = station_id.lstrip("xX")[-4:]
    close = [n for n in names if tail in n][:5]
    raise StationNotFound(
        f"Station {station_id!r} not found in {len(names)} stations. "
        f"Tried {candidates}. Close matches containing {tail!r}: {close}"
    )


def surface_layer_index(ds: xr.Dataset, station_idx: int) -> int:
    """Return 0 or -1 — whichever sigma layer is closest to the surface (siglay ≈ 0)."""
    if "siglay" not in ds.variables:
        raise ValueError("Dataset has no 'siglay' variable")
    siglay = ds["siglay"].isel(station=station_idx).load().values
    # Resolve to a positive integer index in the canonical [0, n) range.
    if abs(siglay[0]) < abs(siglay[-1]):
        return 0
    return int(siglay.shape[0] - 1)


_TIME_UNITS_RE = re.compile(r"seconds since (\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})")


def decode_time(da: xr.DataArray) -> np.ndarray:
    """Return an array of tz-aware UTC datetimes, regardless of how xarray decoded ``time``."""
    values = da.values
    if np.issubdtype(values.dtype, np.datetime64):
        # xarray-decoded: assume UTC (FVCOM file convention).
        return np.array(
            [
                _np_dt_to_py(t).replace(tzinfo=UTC)
                for t in values
            ],
            dtype=object,
        )
    # Fallback: raw floats — parse units string.
    units = da.attrs.get("units", "")
    m = _TIME_UNITS_RE.search(units)
    if not m:
        raise ValueError(f"Cannot parse time units {units!r}")
    epoch = datetime.fromisoformat(m.group(1).replace(" ", "T")).replace(tzinfo=UTC)
    return np.array(
        [epoch + _seconds_to_timedelta(float(s)) for s in values],
        dtype=object,
    )


def _np_dt_to_py(t: np.datetime64) -> datetime:
    # np.datetime64 -> python datetime via int nanoseconds since epoch.
    ns = t.astype("datetime64[ns]").astype("int64")
    return datetime.fromtimestamp(ns / 1e9, tz=UTC).replace(tzinfo=None)


def _seconds_to_timedelta(s: float):
    from datetime import timedelta
    return timedelta(seconds=s)


_VARS = ("temp", "salinity", "u", "v", "zeta", "uwind_speed", "vwind_speed")


def extract_station_series(
    ds: xr.Dataset, station_idx: int, surface_idx: int
) -> StationSeries:
    """Slice ``ds`` to ``(station=station_idx, siglay=surface_idx)`` and load all needed vars."""
    # Read lat/lon as scalars (1D over station). SFBOFS files store lon in
    # 0..360; normalize to -180..180 for downstream consumers.
    lat = float(ds["lat"].isel(station=station_idx).load().values)
    lon = float(ds["lon"].isel(station=station_idx).load().values)
    if lon > 180.0:
        lon -= 360.0

    # Some FVCOM station files put zeta and wind on (time, station) — no siglay dim.
    # Build the isel dict carefully per-variable.
    selected: dict[str, np.ndarray] = {}
    nbytes = 0
    for name in _VARS:
        if name not in ds.variables:
            raise KeyError(f"Variable {name!r} missing from dataset")
        da = ds[name]
        isel: dict[str, int] = {}
        if "station" in da.dims:
            isel["station"] = station_idx
        if "siglay" in da.dims:
            isel["siglay"] = surface_idx
        sliced = da.isel(**isel).load()
        selected[name] = np.asarray(sliced.values)
        nbytes += int(sliced.nbytes)

    times = decode_time(ds["time"])
    nbytes += int(ds["time"].nbytes)

    return StationSeries(
        lat=lat,
        lon=lon,
        station_idx=station_idx,
        surface_idx=surface_idx,
        times=times,
        temp_c=selected["temp"],
        salinity_psu=selected["salinity"],
        u_ms=selected["u"],
        v_ms=selected["v"],
        zeta_m=selected["zeta"],
        uwind_ms=selected["uwind_speed"],
        vwind_ms=selected["vwind_speed"],
        nbytes_loaded=nbytes,
    )
