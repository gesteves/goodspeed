from __future__ import annotations

from datetime import UTC

import numpy as np
import pytest

from goodspeed import extract
from goodspeed.extract import StationNotFound


def test_find_station_index(nowcast_ds):
    idx = extract.find_station_index(nowcast_ds, "SFB1204")
    assert isinstance(idx, int)
    assert idx >= 0


def test_station_latlon_via_extract(nowcast_ds):
    """Spot-check that lat/lon land near SW of Alcatraz Island (after 0-360 normalization)."""
    idx = extract.find_station_index(nowcast_ds, "SFB1204")
    surface = extract.surface_layer_index(nowcast_ds, idx)
    series = extract.extract_station_series(nowcast_ds, idx, surface)
    assert 37.7 < series.lat < 37.9
    assert -122.5 < series.lon < -122.35


def test_find_station_index_missing_helpful_error(nowcast_ds):
    with pytest.raises(StationNotFound) as exc:
        extract.find_station_index(nowcast_ds, "SFB9999")
    msg = str(exc.value)
    assert "SFB9999" in msg
    # Should have tried both bare and x-prefixed forms.
    assert "xSFB9999" in msg


def test_surface_layer_index(nowcast_ds):
    idx = extract.find_station_index(nowcast_ds, "SFB1204")
    surface = extract.surface_layer_index(nowcast_ds, idx)
    siglay = nowcast_ds["siglay"].isel(station=idx).values
    # Surface layer's siglay should be closer to 0 than the other end.
    chosen = siglay[surface]
    other = siglay[-1 if surface == 0 else 0]
    assert abs(chosen) < abs(other)


def test_extract_station_series_shapes(nowcast_ds):
    idx = extract.find_station_index(nowcast_ds, "SFB1204")
    surface = extract.surface_layer_index(nowcast_ds, idx)
    series = extract.extract_station_series(nowcast_ds, idx, surface)

    n = len(series.times)
    assert n > 0
    # Each numpy array should be length n.
    for arr in (
        series.temp_c,
        series.salinity_psu,
        series.u_ms,
        series.v_ms,
        series.zeta_m,
        series.uwind_ms,
        series.vwind_ms,
    ):
        assert arr.shape == (n,)

    # Times are tz-aware and monotonically increasing.
    assert all(t.tzinfo is UTC for t in series.times)
    deltas = np.diff([t.timestamp() for t in series.times])
    assert (deltas > 0).all()


def test_decode_time_monotonic_utc(nowcast_ds):
    times = extract.decode_time(nowcast_ds["time"])
    assert times.dtype == object
    assert all(t.tzinfo is UTC for t in times)
    seconds = np.array([t.timestamp() for t in times])
    assert (np.diff(seconds) > 0).all()
    # Cadence is 6 minutes (360 s) — spec says nowcast covers 6 h.
    span = seconds[-1] - seconds[0]
    assert 5 * 3600 <= span <= 7 * 3600


# ---- error-path coverage on synthetic datasets ------------------------------
#
# The fixture is a real NOAA NetCDF, so it exercises the happy path. These
# tests pin down the *defensive* error paths in extract.py with in-memory
# datasets that intentionally violate the expected shape.


def _bare_station_ds(include_name_station: bool = True, include_siglay: bool = True):
    """A minimal xr.Dataset shaped like SFBOFS stations, with knobs to omit
    variables for error-path testing."""
    import xarray as xr

    n_stations = 3
    n_siglay = 5
    n_time = 4
    data_vars: dict = {}
    if include_name_station:
        names = np.array(
            [list("xSFB1204"), list("xSFB1205"), list("xSFB1206")],
            dtype="S1",
        )
        data_vars["name_station"] = (("station", "name_strlen"), names)
    if include_siglay:
        data_vars["siglay"] = (
            ("siglay", "station"),
            np.linspace(0, -1, n_siglay * n_stations).reshape(n_siglay, n_stations),
        )
    return xr.Dataset(
        data_vars,
        coords={
            "time": np.arange(n_time, dtype=np.int64),
        },
    )


def test_find_station_index_raises_when_name_station_missing():
    ds = _bare_station_ds(include_name_station=False)
    with pytest.raises(StationNotFound, match="no 'name_station' variable"):
        extract.find_station_index(ds, "SFB1204")


def test_surface_layer_index_raises_when_siglay_missing():
    ds = _bare_station_ds(include_siglay=False)
    with pytest.raises(ValueError, match="no 'siglay' variable"):
        extract.surface_layer_index(ds, station_idx=0)


def test_extract_station_series_raises_on_missing_variable(nowcast_ds):
    """Dropping a required variable surfaces a clear KeyError rather than a
    cryptic xarray error deep in the slice."""
    ds = nowcast_ds.drop_vars(["temp"])
    idx = extract.find_station_index(ds, "SFB1204")
    surface = extract.surface_layer_index(ds, idx)
    with pytest.raises(KeyError, match="temp"):
        extract.extract_station_series(ds, idx, surface)
