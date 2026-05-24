"""Derive bearings/speeds, convert units, build + validate the JSON feed."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from jsonschema import Draft202012Validator

from .catalog import Cycle
from .extract import STATION_ID, StationSeries
from .extract_field import FieldGrid

log = logging.getLogger(__name__)


POINT_SCHEMA_FILENAME = "sfbofs-sfb1204.schema.json"
FIELD_SCHEMA_FILENAME = "sfbofs-field.schema.json"


def _resolve_schema_path(filename: str = POINT_SCHEMA_FILENAME) -> Path:
    """Find the JSON Schema for ``filename``, honoring ``GOODSPEED_SCHEMA_PATH``.

    ``GOODSPEED_SCHEMA_PATH`` may be:
      * a directory containing schema files (preferred for multiple schemas), or
      * a file path (legacy; we look in its parent for siblings).

    Falls back to ``../../schema`` (repo checkout) and ``/app/schema`` (Docker).
    """
    env = os.environ.get("GOODSPEED_SCHEMA_PATH")
    if env:
        env_path = Path(env)
        if env_path.is_dir():
            return env_path / filename
        if env_path.name == filename:
            return env_path
        sibling = env_path.parent / filename
        if sibling.exists():
            return sibling
        # Legacy: the env var pointed at a single specific schema file; if
        # that's the one we're looking for it's already handled above; if
        # not, fall through to the standard candidates.
    here = Path(__file__).resolve()
    candidates = [
        here.parents[3] / "schema" / filename,  # repo checkout
        Path("/app/schema") / filename,         # Docker image
    ]
    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError(
        f"Could not locate {filename}. Set GOODSPEED_SCHEMA_PATH or place the "
        f"file at one of: {[str(c) for c in candidates]}"
    )


_SCHEMA_PATH = None  # lazy-loaded

STATION_NAME = "SW of Alcatraz Island"
MODEL_VERSION = "FVCOM_4.4.7"
MODEL_NOTES = (
    "Salinity may be inaccurate in the North Bay; SFB1204 is in the lower bay "
    "and not affected by the known boundary forcing issue, but consumers should be aware."
)


# ---- vector derivations -----------------------------------------------------


def current_speed_ms(u: np.ndarray, v: np.ndarray) -> np.ndarray:
    return np.sqrt(u * u + v * v)


def current_bearing_deg(u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Compass bearing of the direction the current is flowing TOWARD (0=N, 90=E)."""
    return (np.degrees(np.arctan2(u, v)) + 360.0) % 360.0


def wind_bearing_deg(uwind: np.ndarray, vwind: np.ndarray) -> np.ndarray:
    """Compass bearing the wind is coming FROM (meteorological convention)."""
    return (np.degrees(np.arctan2(uwind, vwind)) + 180.0) % 360.0


def c_to_f(c: float | np.ndarray) -> float | np.ndarray:
    return c * 9.0 / 5.0 + 32.0


def ms_to_kt(ms: float | np.ndarray) -> float | np.ndarray:
    return ms * 1.943844


def m_to_ft(m: float | np.ndarray) -> float | np.ndarray:
    return m * 3.28084


# ---- feed assembly ----------------------------------------------------------


def _round(x: float, n: int) -> float:
    """Round to ``n`` digits, returning a plain float (no numpy scalars)."""
    if x is None or (isinstance(x, float) and (np.isnan(x) or np.isinf(x))):
        raise ValueError(f"Non-finite value in output: {x!r}")
    return float(round(float(x), n))


def _series_to_points(series: StationSeries, source: str) -> list[dict[str, Any]]:
    u, v = series.u_ms, series.v_ms
    uw, vw = series.uwind_ms, series.vwind_ms
    cs = current_speed_ms(u, v)
    cb = current_bearing_deg(u, v)
    ws = current_speed_ms(uw, vw)  # same formula
    wb = wind_bearing_deg(uw, vw)

    points: list[dict[str, Any]] = []
    for i, t in enumerate(series.times):
        # t is a tz-aware datetime; ensure UTC and ISO-Z formatting.
        ts = t.astimezone(UTC) if t.tzinfo else t.replace(tzinfo=UTC)
        points.append(
            {
                "t": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "source": source,
                "water_temp_c": _round(series.temp_c[i], 3),
                "water_temp_f": _round(c_to_f(series.temp_c[i]), 2),
                "current_u_ms": _round(u[i], 4),
                "current_v_ms": _round(v[i], 4),
                "current_speed_ms": _round(cs[i], 4),
                "current_speed_kt": _round(ms_to_kt(cs[i]), 3),
                "current_bearing_deg": _round(cb[i], 2),
                "water_level_m": _round(series.zeta_m[i], 4),
                "water_level_ft": _round(m_to_ft(series.zeta_m[i]), 3),
                "salinity_psu": _round(series.salinity_psu[i], 3),
                "wind_u_ms": _round(uw[i], 3),
                "wind_v_ms": _round(vw[i], 3),
                "wind_speed_ms": _round(ws[i], 3),
                "wind_speed_kt": _round(ms_to_kt(ws[i]), 3),
                "wind_bearing_deg": _round(wb[i], 2),
            }
        )
    return points


def _dedupe_boundary(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort points by `t` and drop duplicates (same timestamp). Keep the forecast version."""
    # Sort with nowcast before forecast at equal t so dict-key dedupe keeps forecast.
    points.sort(key=lambda p: (p["t"], 0 if p["source"] == "nowcast" else 1))
    by_t: dict[str, dict[str, Any]] = {}
    for p in points:
        by_t[p["t"]] = p
    return sorted(by_t.values(), key=lambda p: p["t"])


def build_feed(
    cycle: Cycle,
    fetched_at_utc: datetime,
    nowcast: StationSeries,
    forecast: StationSeries,
    source_files: list[str],
) -> dict[str, Any]:
    """Assemble the full feed dict, ready for JSON serialization."""
    # Station lat/lon comes from either series — they're the same. Prefer nowcast.
    feed: dict[str, Any] = {
        "station": {
            "id": STATION_ID,
            "name": STATION_NAME,
            "lat": _round(nowcast.lat, 5),
            "lon": _round(nowcast.lon, 5),
        },
        "model": {
            "name": "SFBOFS",
            "cycle": cycle.iso(),
            "fetched_at": fetched_at_utc.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source_files": source_files,
            "model_version": MODEL_VERSION,
            "notes": MODEL_NOTES,
        },
        "timeseries": _dedupe_boundary(
            _series_to_points(nowcast, "nowcast") + _series_to_points(forecast, "forecast")
        ),
    }
    return feed


# ---- sanity + validation ----------------------------------------------------


SANITY_BOUNDS: dict[str, tuple[float, float]] = {
    "water_temp_c": (8.0, 20.0),
    "current_speed_ms": (0.0, 3.0),
    "water_level_m": (-2.0, 2.0),
    "wind_speed_ms": (0.0, 30.0),
}


def sanity_check(feed: dict[str, Any]) -> list[str]:
    """Return human-readable warnings for any timeseries values outside sanity bounds."""
    warnings: list[str] = []
    for field, (lo, hi) in SANITY_BOUNDS.items():
        offenders = [
            (p["t"], p[field])
            for p in feed["timeseries"]
            if not (lo <= p[field] <= hi)
        ]
        if offenders:
            sample = offenders[:3]
            warnings.append(
                f"{field}: {len(offenders)} value(s) outside [{lo}, {hi}]; "
                f"first: {sample}"
            )
    return warnings


def validate_against_schema(feed: dict[str, Any]) -> None:
    """Raise ``jsonschema.ValidationError`` if ``feed`` does not match the schema."""
    path = _resolve_schema_path(POINT_SCHEMA_FILENAME)
    with path.open("r", encoding="utf-8") as fh:
        schema = json.load(fh)
    Draft202012Validator(schema).validate(feed)


def serialize(feed: dict[str, Any]) -> bytes:
    return json.dumps(feed, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


# ---- field feed (interpolated grid for the map) -----------------------------


def build_field_feed(
    cycle: Cycle,
    fetched_at_utc: datetime,
    bbox: tuple[float, float, float, float],
    center: tuple[float, float],
    nowcast_grid: FieldGrid,
    forecast_grid: FieldGrid,
    source_files: list[str],
) -> dict[str, Any]:
    """Assemble the field (map) feed dict.

    Both grids must share the same in-water points. Since SFBOFS shares its
    FVCOM mesh across nowcast and forecast files and we use the same
    ``FIELD_BBOX`` for both, this holds by construction; we sanity-check it.

    Dedupes the nowcast/forecast boundary, preferring the forecast timestamp
    (matches the point feed's convention).
    """
    if nowcast_grid.lat.shape != forecast_grid.lat.shape or not (
        np.allclose(nowcast_grid.lat, forecast_grid.lat)
        and np.allclose(nowcast_grid.lon, forecast_grid.lon)
    ):
        raise ValueError(
            "Nowcast and forecast field grids do not share the same in-water "
            "points; this should not happen since SFBOFS shares its mesh."
        )

    lat_min, lat_max, lon_min, lon_max = bbox
    center_lat, center_lon = center

    def _frame(temp_c: np.ndarray, u: np.ndarray, v: np.ndarray) -> dict[str, Any]:
        speed_ms = current_speed_ms(u, v)
        bearing = current_bearing_deg(u, v)
        return {
            "current_speed_ms": [_round(float(x), 3) for x in speed_ms],
            "current_speed_kt": [_round(float(ms_to_kt(x)), 3) for x in speed_ms],
            "current_bearing_deg": [_round(float(x), 1) for x in bearing],
            "water_temp_c": [_round(float(x), 3) for x in temp_c],
            "water_temp_f": [_round(float(c_to_f(x)), 2) for x in temp_c],
        }

    def _iter(grid: FieldGrid, source: str) -> list[tuple[str, str, dict[str, Any]]]:
        entries: list[tuple[str, str, dict[str, Any]]] = []
        for i, t in enumerate(grid.times):
            ts = t.astimezone(UTC) if t.tzinfo else t.replace(tzinfo=UTC)
            t_iso = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
            entries.append(
                (t_iso, source, _frame(grid.temp_c[i], grid.u_ms[i], grid.v_ms[i]))
            )
        return entries

    raw = _iter(nowcast_grid, "nowcast") + _iter(forecast_grid, "forecast")
    # Sort so dict-key dedupe keeps the forecast version on a tie.
    raw.sort(key=lambda e: (e[0], 0 if e[1] == "nowcast" else 1))
    by_t: dict[str, tuple[str, str, dict[str, Any]]] = {}
    for entry in raw:
        by_t[entry[0]] = entry
    sorted_entries = sorted(by_t.values(), key=lambda e: e[0])

    return {
        "model": {
            "name": "SFBOFS",
            "cycle": cycle.iso(),
            "fetched_at": fetched_at_utc.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source_files": source_files,
            "model_version": MODEL_VERSION,
        },
        "bbox": {
            "lat_min": _round(lat_min, 4),
            "lat_max": _round(lat_max, 4),
            "lon_min": _round(lon_min, 4),
            "lon_max": _round(lon_max, 4),
        },
        "center": {
            "lat": _round(center_lat, 14),
            "lon": _round(center_lon, 14),
        },
        "grid": {
            "lat": [_round(float(x), 5) for x in nowcast_grid.lat],
            "lon": [_round(float(x), 5) for x in nowcast_grid.lon],
        },
        "t": [e[0] for e in sorted_entries],
        "source": [e[1] for e in sorted_entries],
        "frames": [e[2] for e in sorted_entries],
    }


def validate_field_against_schema(feed: dict[str, Any]) -> None:
    path = _resolve_schema_path(FIELD_SCHEMA_FILENAME)
    with path.open("r", encoding="utf-8") as fh:
        schema = json.load(fh)
    Draft202012Validator(schema).validate(feed)


def sanity_check_field(feed: dict[str, Any]) -> list[str]:
    """Same bounds as ``sanity_check`` but across every grid point in every frame."""
    warnings: list[str] = []
    for field in ("water_temp_c", "current_speed_ms"):
        if field not in SANITY_BOUNDS:
            continue
        lo, hi = SANITY_BOUNDS[field]
        count = 0
        first: tuple[str, float] | None = None
        for t, frame in zip(feed["t"], feed["frames"], strict=True):
            for v in frame[field]:
                if not (lo <= v <= hi):
                    count += 1
                    if first is None:
                        first = (t, v)
        if count:
            warnings.append(
                f"{field}: {count} value(s) outside [{lo}, {hi}]; first: {first}"
            )
    return warnings
