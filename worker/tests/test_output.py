from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone

import jsonschema
import numpy as np
import pytest

from goodspeed import catalog, output
from goodspeed.extract import StationSeries


# ---- direction conventions --------------------------------------------------


def test_current_bearing_to_east():
    """A current flowing purely east (u=1, v=0) → bearing 90° (to the east)."""
    b = output.current_bearing_deg(np.array([1.0]), np.array([0.0]))
    assert b[0] == pytest.approx(90.0)


def test_current_bearing_to_north():
    """v=1, u=0 → bearing 0° (to the north)."""
    b = output.current_bearing_deg(np.array([0.0]), np.array([1.0]))
    assert b[0] == pytest.approx(0.0)


def test_wind_bearing_from_west():
    """A wind blowing eastward (u=1, v=0) is coming FROM the west → 270°."""
    b = output.wind_bearing_deg(np.array([1.0]), np.array([0.0]))
    assert b[0] == pytest.approx(270.0)


def test_wind_bearing_from_south():
    """A wind blowing northward (u=0, v=1) is coming FROM the south → 180°."""
    b = output.wind_bearing_deg(np.array([0.0]), np.array([1.0]))
    assert b[0] == pytest.approx(180.0)


def test_unit_conversions():
    assert output.c_to_f(0.0) == pytest.approx(32.0)
    assert output.c_to_f(100.0) == pytest.approx(212.0)
    assert output.ms_to_kt(1.0) == pytest.approx(1.943844)
    assert output.m_to_ft(1.0) == pytest.approx(3.28084, rel=1e-5)


# ---- feed assembly ---------------------------------------------------------


def _make_series(start_iso: str, n: int, lat=37.82, lon=-122.43) -> StationSeries:
    start = datetime.fromisoformat(start_iso).replace(tzinfo=timezone.utc)
    times = np.array([start + timedelta(minutes=6 * i) for i in range(n)], dtype=object)
    zeros = np.zeros(n)
    return StationSeries(
        lat=lat,
        lon=lon,
        station_idx=0,
        surface_idx=0,
        times=times,
        temp_c=np.full(n, 12.5),
        salinity_psu=np.full(n, 32.0),
        u_ms=np.full(n, 0.3),
        v_ms=np.full(n, -0.1),
        zeta_m=np.full(n, 0.5),
        uwind_ms=np.full(n, 2.0),
        vwind_ms=np.full(n, -1.0),
        nbytes_loaded=n * 8 * 7,
    )


def test_build_feed_dedupes_boundary():
    """Nowcast last point and forecast first point share a timestamp → dedupe."""
    nowcast = _make_series("2026-05-20T03:00:00", n=61)  # ends at 09:00
    forecast = _make_series("2026-05-20T09:00:00", n=481)  # starts at 09:00

    cycle = catalog.Cycle(date(2026, 5, 20), 9)
    feed = output.build_feed(
        cycle=cycle,
        fetched_at_utc=datetime(2026, 5, 20, 9, 45, tzinfo=timezone.utc),
        nowcast=nowcast,
        forecast=forecast,
        source_files=["nc", "fc"],
    )

    timestamps = [p["t"] for p in feed["timeseries"]]
    # Total = 61 + 481 - 1 = 541
    assert len(timestamps) == 541
    # No duplicate timestamps.
    assert len(set(timestamps)) == len(timestamps)
    # Strictly increasing.
    assert timestamps == sorted(timestamps)
    # Boundary point (09:00) prefers forecast (per dedupe rule).
    boundary = next(p for p in feed["timeseries"] if p["t"] == "2026-05-20T09:00:00Z")
    assert boundary["source"] == "forecast"


def test_build_feed_source_tagging():
    nowcast = _make_series("2026-05-20T03:00:00", n=3)
    forecast = _make_series("2026-05-20T03:18:00", n=3)  # no overlap
    cycle = catalog.Cycle(date(2026, 5, 20), 9)
    feed = output.build_feed(
        cycle=cycle,
        fetched_at_utc=datetime(2026, 5, 20, 9, 45, tzinfo=timezone.utc),
        nowcast=nowcast,
        forecast=forecast,
        source_files=["nc", "fc"],
    )
    sources = [p["source"] for p in feed["timeseries"]]
    assert sources.count("nowcast") == 3
    assert sources.count("forecast") == 3


# ---- schema validation -----------------------------------------------------


def _valid_feed():
    nowcast = _make_series("2026-05-20T03:00:00", n=61)
    forecast = _make_series("2026-05-20T09:00:00", n=10)
    cycle = catalog.Cycle(date(2026, 5, 20), 9)
    return output.build_feed(
        cycle=cycle,
        fetched_at_utc=datetime(2026, 5, 20, 9, 45, tzinfo=timezone.utc),
        nowcast=nowcast,
        forecast=forecast,
        source_files=["nc", "fc"],
    )


def test_valid_feed_round_trips_through_schema():
    feed = _valid_feed()
    output.validate_against_schema(feed)
    # Also round-trip JSON serialization.
    serialized = output.serialize(feed)
    parsed = json.loads(serialized)
    assert parsed["station"]["id"] == "SFB1204"
    assert parsed["model"]["name"] == "SFBOFS"


def test_missing_required_field_fails_schema():
    feed = _valid_feed()
    del feed["timeseries"][0]["water_temp_c"]
    with pytest.raises(jsonschema.ValidationError):
        output.validate_against_schema(feed)


def test_bad_source_enum_fails_schema():
    feed = _valid_feed()
    feed["timeseries"][0]["source"] = "observed"
    with pytest.raises(jsonschema.ValidationError):
        output.validate_against_schema(feed)
