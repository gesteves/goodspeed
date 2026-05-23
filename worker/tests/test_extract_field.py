"""Tests for the regulargrid field extraction."""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pytest
import xarray as xr

from goodspeed import extract_field
from goodspeed.catalog import Cycle


def _synthetic_regulargrid_ds(
    *,
    t: datetime,
    ny: int = 6,
    nx: int = 8,
    n_depth: int = 4,
    bbox: tuple[float, float, float, float] = (37.804, 37.832, -122.450, -122.405),
    temp_value: float = 14.0,
    u_value: float = 0.5,
    v_value: float = 0.0,
    land_top_row: bool = True,
) -> xr.Dataset:
    """Build a minimal SFBOFS-regulargrid-like dataset entirely in memory.

    Latitude / Longitude are 2D arrays on a regular grid spanning ``bbox``.
    ``mask`` marks the top row as land (0) if ``land_top_row`` so tests can
    verify the in-water filter; the rest is water (1). The surface (Depth=0)
    carries the constant values; deeper layers are zero so any "surface" bug
    surfaces.
    """
    lat_min, lat_max, lon_min, lon_max = bbox
    lat1d = np.linspace(lat_min, lat_max, ny)
    lon1d = np.linspace(lon_min, lon_max, nx)
    lon2d, lat2d = np.meshgrid(lon1d, lat1d)

    mask = np.ones((ny, nx), dtype=np.float64)
    if land_top_row:
        mask[-1, :] = 0.0  # mark the top row as land

    depth = np.linspace(0.0, -10.0, n_depth)

    u = np.zeros((1, n_depth, ny, nx), dtype=np.float64)
    u[0, 0, :, :] = u_value
    v = np.zeros((1, n_depth, ny, nx), dtype=np.float64)
    v[0, 0, :, :] = v_value
    temp = np.zeros((1, n_depth, ny, nx), dtype=np.float64)
    temp[0, 0, :, :] = temp_value

    return xr.Dataset(
        {
            "Latitude": (("ny", "nx"), lat2d),
            "Longitude": (("ny", "nx"), lon2d),
            "mask": (("ny", "nx"), mask),
            "Depth": ("Depth", depth),
            "u_eastward": (("time", "Depth", "ny", "nx"), u),
            "v_northward": (("time", "Depth", "ny", "nx"), v),
            "temp": (("time", "Depth", "ny", "nx"), temp),
        },
        coords={"time": np.array([np.datetime64(t.replace(tzinfo=None))])},
    )


def test_find_grid_indices_filters_bbox_and_mask():
    ds = _synthetic_regulargrid_ds(t=datetime(2026, 5, 23, 15, tzinfo=UTC))
    # Sub-bbox covering only the middle of the grid.
    sub = (37.810, 37.825, -122.440, -122.410)
    ii, jj, lat, lon = extract_field.find_grid_indices(ds, sub)
    assert ii.size > 0
    # All returned cells must be inside the sub-bbox and not on the land row.
    assert (lat >= sub[0]).all() and (lat <= sub[1]).all()
    assert (lon >= sub[2]).all() and (lon <= sub[3]).all()
    # Top row was masked land -- none of the cells should be at lat_max.
    assert (lat < ds["Latitude"].values.max()).all()


def test_find_grid_indices_normalizes_0_to_360_lon():
    ds = _synthetic_regulargrid_ds(t=datetime(2026, 5, 23, 15, tzinfo=UTC))
    ds["Longitude"].values[:] = ds["Longitude"].values + 360.0
    ii, jj, lat, lon = extract_field.find_grid_indices(ds)
    assert ii.size > 0
    assert (lon < 0).all()


def test_find_grid_indices_empty_raises():
    ds = _synthetic_regulargrid_ds(t=datetime(2026, 5, 23, 15, tzinfo=UTC))
    with pytest.raises(ValueError):
        extract_field.find_grid_indices(ds, bbox=(40.0, 41.0, -100.0, -99.0))


def test_extract_frame_from_dataset_returns_surface_values():
    t = datetime(2026, 5, 23, 15, tzinfo=UTC)
    ds = _synthetic_regulargrid_ds(t=t, temp_value=14.5, u_value=0.7, v_value=-0.1)
    frame = extract_field.extract_frame_from_dataset(ds)
    assert frame["t"] == t
    assert frame["temp_c"].size > 0
    # All cells share the constant surface values seeded above.
    assert np.allclose(frame["temp_c"], 14.5)
    assert np.allclose(frame["u_ms"], 0.7)
    assert np.allclose(frame["v_ms"], -0.1)
    # No NaNs in the in-water region.
    assert np.isfinite(frame["temp_c"]).all()


def test_load_field_grid_concatenates_hours(monkeypatch):
    """A patched ``load_field_frame`` returns one frame per hour; verify the
    FieldGrid stacks them correctly and shares a single grid coordinate."""
    cycle = Cycle(date=datetime(2026, 5, 23, tzinfo=UTC).date(), hour=15)

    base_lat = np.array([37.815, 37.820], dtype=np.float64)
    base_lon = np.array([-122.43, -122.42], dtype=np.float64)

    def fake_load_field_frame(url, bbox=extract_field.FIELD_BBOX, surface_idx=0):
        # URL ends in .{phase}{hour:03d}.nc -- parse the hour from it.
        hour = int(url.split(".")[-2][1:])
        phase = url.split(".")[-2][0]
        t = datetime(2026, 5, 23, 15 + hour if phase == "f" else 15 - 6 + hour, tzinfo=UTC)
        return {
            "t": t,
            "lat": base_lat.copy(),
            "lon": base_lon.copy(),
            "temp_c": np.array([14.0, 15.0]) + hour * 0.1,
            "u_ms": np.array([0.5, 0.5]),
            "v_ms": np.array([0.0, 0.0]),
        }

    monkeypatch.setattr(extract_field, "load_field_frame", fake_load_field_frame)

    grid = extract_field.load_field_grid(cycle, "f", (0, 1, 2))
    assert grid.lat.shape == (2,)
    assert grid.temp_c.shape == (3, 2)
    # Hour ordering preserved.
    assert grid.temp_c[0, 0] == pytest.approx(14.0)
    assert grid.temp_c[1, 0] == pytest.approx(14.1)
    assert grid.temp_c[2, 0] == pytest.approx(14.2)
    # All hours share the same grid coords.
    assert np.array_equal(grid.lat, base_lat)


def test_load_field_grid_skips_failures(monkeypatch):
    """Single missing hour is tolerated; the surviving frames make the grid."""
    cycle = Cycle(date=datetime(2026, 5, 23, tzinfo=UTC).date(), hour=15)

    base_lat = np.array([37.815], dtype=np.float64)
    base_lon = np.array([-122.43], dtype=np.float64)

    def flaky(url, bbox=extract_field.FIELD_BBOX, surface_idx=0):
        hour = int(url.split(".")[-2][1:])
        if hour == 2:
            raise OSError("404")
        return {
            "t": datetime(2026, 5, 23, 15 + hour, tzinfo=UTC),
            "lat": base_lat.copy(),
            "lon": base_lon.copy(),
            "temp_c": np.array([14.0]),
            "u_ms": np.array([0.5]),
            "v_ms": np.array([0.0]),
        }

    monkeypatch.setattr(extract_field, "load_field_frame", flaky)

    grid = extract_field.load_field_grid(cycle, "f", (0, 1, 2, 3))
    assert grid.times.size == 3  # hour 2 skipped


def test_load_field_grid_raises_when_too_many_failures(monkeypatch):
    cycle = Cycle(date=datetime(2026, 5, 23, tzinfo=UTC).date(), hour=15)

    def always_fail(url, bbox=extract_field.FIELD_BBOX, surface_idx=0):
        raise OSError("404")

    monkeypatch.setattr(extract_field, "load_field_frame", always_fail)
    with pytest.raises(ValueError):
        extract_field.load_field_grid(cycle, "f", (0, 1, 2, 3))


def test_source_filenames_emits_first_and_last():
    cycle = Cycle(date=datetime(2026, 5, 23, tzinfo=UTC).date(), hour=15)
    files = extract_field.source_filenames(cycle)
    assert files[0] == "sfbofs.t15z.20260523.regulargrid.n000.nc"
    assert files[1] == (
        f"sfbofs.t15z.20260523.regulargrid.f{extract_field.FORECAST_HOURS[-1]:03d}.nc"
    )
