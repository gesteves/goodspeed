from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from goodspeed import catalog
from goodspeed.catalog import Cycle


def _utc(y, mo, d, h, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        # Right at 03:45 UTC, the 03z cycle is just ready.
        (_utc(2026, 5, 20, 3, 45), Cycle(date(2026, 5, 20), 3)),
        # 03:44 UTC: still on the 21z cycle of the previous day.
        (_utc(2026, 5, 20, 3, 44), Cycle(date(2026, 5, 19), 21)),
        # Mid-window after 09z.
        (_utc(2026, 5, 20, 12, 0), Cycle(date(2026, 5, 20), 9)),
        # Just after midnight UTC, 21z from previous day.
        (_utc(2026, 5, 20, 0, 30), Cycle(date(2026, 5, 19), 21)),
    ],
)
def test_latest_ready_cycle(now, expected):
    assert catalog.latest_ready_cycle(now) == expected


def test_latest_ready_cycle_requires_tz():
    with pytest.raises(ValueError):
        catalog.latest_ready_cycle(datetime(2026, 5, 20, 12, 0))  # noqa: DTZ001


@pytest.mark.parametrize(
    ("cycle", "expected"),
    [
        (Cycle(date(2026, 5, 20), 9), Cycle(date(2026, 5, 20), 3)),
        (Cycle(date(2026, 5, 20), 3), Cycle(date(2026, 5, 19), 21)),
        (Cycle(date(2026, 5, 20), 21), Cycle(date(2026, 5, 20), 15)),
    ],
)
def test_previous_cycle(cycle, expected):
    assert catalog.previous_cycle(cycle) == expected


def test_cycle_iso_and_filename():
    c = Cycle(date(2026, 5, 20), 9)
    assert c.iso() == "2026-05-20T09:00:00Z"
    assert c.filename("nowcast") == "sfbofs.t09z.20260520.stations.nowcast.nc"
    assert c.filename("forecast") == "sfbofs.t09z.20260520.stations.forecast.nc"


def test_url_construction():
    c = Cycle(date(2026, 5, 20), 9)
    assert catalog.dods_url(c, "nowcast") == (
        "https://opendap.co-ops.nos.noaa.gov/thredds/dodsC/NOAA/SFBOFS/MODELS/"
        "2026/05/20/sfbofs.t09z.20260520.stations.nowcast.nc"
    )
    assert catalog.fileserver_url(c, "forecast") == (
        "https://opendap.co-ops.nos.noaa.gov/thredds/fileServer/NOAA/SFBOFS/MODELS/"
        "2026/05/20/sfbofs.t09z.20260520.stations.forecast.nc"
    )
