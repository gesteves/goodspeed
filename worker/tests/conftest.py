from __future__ import annotations

from pathlib import Path

import pytest
import xarray as xr

FIXTURE = Path(__file__).parent / "fixtures" / "sfbofs_stations_nowcast.nc"


@pytest.fixture(scope="session")
def fixture_path() -> Path:
    if not FIXTURE.exists():
        pytest.skip(f"fixture {FIXTURE} not present — see tests/fixtures/README.md")
    return FIXTURE


@pytest.fixture()
def nowcast_ds(fixture_path: Path):
    ds = xr.open_dataset(fixture_path, engine="netcdf4", decode_times=True)
    try:
        yield ds
    finally:
        ds.close()
