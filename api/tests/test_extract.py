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
