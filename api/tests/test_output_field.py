"""Tests for build_field_feed + field schema validation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from goodspeed import output
from goodspeed.catalog import Cycle
from goodspeed.extract_field import (
    FIELD_BBOX,
    FIELD_CENTER_LAT,
    FIELD_CENTER_LON,
    FieldGrid,
)

FIELD_CENTER: tuple[float, float] = (FIELD_CENTER_LAT, FIELD_CENTER_LON)


def _grid(times, lat, lon, temp_c, u_ms, v_ms) -> FieldGrid:
    return FieldGrid(
        times=np.asarray(times, dtype=object),
        lat=np.asarray(lat, dtype=np.float64),
        lon=np.asarray(lon, dtype=np.float64),
        temp_c=np.asarray(temp_c, dtype=np.float64),
        u_ms=np.asarray(u_ms, dtype=np.float64),
        v_ms=np.asarray(v_ms, dtype=np.float64),
    )


def _two_point_grid(start: datetime, frames: int, source_temp_c: float) -> FieldGrid:
    """Build a tiny 2-point FieldGrid with constant temp + 0.5 m/s eastward current."""
    times = [start + timedelta(minutes=30 * i) for i in range(frames)]
    return _grid(
        times=times,
        lat=[37.815, 37.825],
        lon=[-122.43, -122.42],
        temp_c=np.full((frames, 2), source_temp_c),
        u_ms=np.full((frames, 2), 0.5),
        v_ms=np.zeros((frames, 2)),
    )


def test_build_field_feed_shape_and_schema_validation():
    cycle = Cycle(date=datetime(2026, 5, 23, tzinfo=UTC).date(), hour=15)
    fetched_at = datetime(2026, 5, 23, 15, 35, tzinfo=UTC)
    start_nc = datetime(2026, 5, 23, 9, 0, tzinfo=UTC)
    start_fc = datetime(2026, 5, 23, 15, 0, tzinfo=UTC)
    nc = _two_point_grid(start_nc, frames=12, source_temp_c=14.5)
    fc = _two_point_grid(start_fc, frames=24, source_temp_c=15.0)

    feed = output.build_field_feed(
        cycle, fetched_at, FIELD_BBOX, FIELD_CENTER, nc, fc,
        source_files=["sfbofs.t15z.20260523.fields.nowcast.nc",
                      "sfbofs.t15z.20260523.fields.forecast.nc"],
    )

    # Top-level shape.
    assert feed["model"]["name"] == "SFBOFS"
    assert feed["model"]["cycle"] == "2026-05-23T15:00:00Z"
    assert feed["bbox"] == {
        "lat_min": pytest.approx(FIELD_BBOX[0]),
        "lat_max": pytest.approx(FIELD_BBOX[1]),
        "lon_min": pytest.approx(FIELD_BBOX[2]),
        "lon_max": pytest.approx(FIELD_BBOX[3]),
    }
    # Center must be the exact configured focal point (the dashboard reads
    # this verbatim to position the camera).
    assert feed["center"]["lat"] == FIELD_CENTER_LAT
    assert feed["center"]["lon"] == FIELD_CENTER_LON
    assert len(feed["grid"]["lat"]) == 2
    assert len(feed["grid"]["lon"]) == 2

    # Time grid + dedupe: nc has 12 frames at 09:00, 09:30, ..., 14:30 (last 14:30).
    # fc has 24 frames at 15:00, 15:30, ..., end at 26:30 (11:30 next day).
    # No overlap in this synthetic case so total = 36.
    assert len(feed["t"]) == len(feed["source"]) == len(feed["frames"])
    assert len(feed["t"]) == 36
    # Sorted ascending.
    assert feed["t"] == sorted(feed["t"])
    assert feed["source"][0] == "nowcast"
    assert feed["source"][-1] == "forecast"

    # Each frame has the five parallel arrays of length P=2.
    sample = feed["frames"][0]
    for key in ("current_speed_ms", "current_speed_kt",
                "current_bearing_deg", "water_temp_c", "water_temp_f"):
        assert key in sample
        assert len(sample[key]) == 2

    # Derived values: u=0.5, v=0 -> speed = 0.5 m/s, bearing = 90 (E).
    assert sample["current_speed_ms"][0] == pytest.approx(0.5, abs=1e-3)
    assert sample["current_bearing_deg"][0] == pytest.approx(90.0, abs=0.1)
    # 14.5 C -> 58.1 F.
    assert sample["water_temp_f"][0] == pytest.approx(58.1, abs=0.1)

    # Schema validation (real schema, no mocks).
    output.validate_field_against_schema(feed)


def test_build_field_feed_dedupes_boundary_preferring_forecast():
    cycle = Cycle(date=datetime(2026, 5, 23, tzinfo=UTC).date(), hour=15)
    fetched_at = datetime(2026, 5, 23, 15, 35, tzinfo=UTC)
    # Both grids share the timestamp 15:00 -- forecast should win.
    t_shared = datetime(2026, 5, 23, 15, 0, tzinfo=UTC)
    nc = _grid(
        times=[t_shared], lat=[37.815, 37.825], lon=[-122.43, -122.42],
        temp_c=[[14.0, 14.0]], u_ms=[[0.0, 0.0]], v_ms=[[0.0, 0.0]],
    )
    fc = _grid(
        times=[t_shared], lat=[37.815, 37.825], lon=[-122.43, -122.42],
        temp_c=[[16.0, 16.0]], u_ms=[[0.0, 0.0]], v_ms=[[0.0, 0.0]],
    )
    feed = output.build_field_feed(
        cycle, fetched_at, FIELD_BBOX, FIELD_CENTER, nc, fc,
        source_files=["a.nc", "b.nc"],
    )
    assert len(feed["t"]) == 1
    assert feed["source"] == ["forecast"]
    # Forecast value (16 C) wins over nowcast value (14 C).
    assert feed["frames"][0]["water_temp_c"][0] == pytest.approx(16.0)


def test_build_field_feed_rejects_mismatched_grids():
    cycle = Cycle(date=datetime(2026, 5, 23, tzinfo=UTC).date(), hour=15)
    fetched_at = datetime(2026, 5, 23, 15, 35, tzinfo=UTC)
    nc = _grid(
        times=[datetime(2026, 5, 23, 9, 0, tzinfo=UTC)],
        lat=[37.815, 37.825], lon=[-122.43, -122.42],
        temp_c=[[14.0, 14.0]], u_ms=[[0.0, 0.0]], v_ms=[[0.0, 0.0]],
    )
    fc = _grid(
        times=[datetime(2026, 5, 23, 15, 0, tzinfo=UTC)],
        lat=[37.815, 37.830],  # different lat in second slot
        lon=[-122.43, -122.42],
        temp_c=[[14.0, 14.0]], u_ms=[[0.0, 0.0]], v_ms=[[0.0, 0.0]],
    )
    with pytest.raises(ValueError):
        output.build_field_feed(
            cycle, fetched_at, FIELD_BBOX, FIELD_CENTER, nc, fc,
            source_files=["a.nc", "b.nc"],
        )


def test_sanity_check_field_flags_out_of_bounds():
    cycle = Cycle(date=datetime(2026, 5, 23, tzinfo=UTC).date(), hour=15)
    fetched_at = datetime(2026, 5, 23, 15, 35, tzinfo=UTC)
    # Temperature far above the sanity ceiling (20 C).
    nc = _grid(
        times=[datetime(2026, 5, 23, 9, 0, tzinfo=UTC)],
        lat=[37.815], lon=[-122.43],
        temp_c=[[30.0]], u_ms=[[0.0]], v_ms=[[0.0]],
    )
    fc = _grid(
        times=[datetime(2026, 5, 23, 15, 0, tzinfo=UTC)],
        lat=[37.815], lon=[-122.43],
        temp_c=[[30.0]], u_ms=[[0.0]], v_ms=[[0.0]],
    )
    feed = output.build_field_feed(
        cycle, fetched_at, FIELD_BBOX, FIELD_CENTER, nc, fc,
        source_files=["a.nc", "b.nc"],
    )
    warnings = output.sanity_check_field(feed)
    assert warnings, "Expected a sanity warning for out-of-bounds temperature"
    assert any("water_temp_c" in w for w in warnings)
