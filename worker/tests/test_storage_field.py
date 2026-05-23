"""Tests for the field-feed storage paths (and the _push_keyed refactor regression)."""

from __future__ import annotations

from pathlib import Path

from goodspeed import storage


def test_push_field_feed_writes_two_files_locally(tmp_path: Path):
    body = b'{"hello":"field"}'
    locations = storage.push_field_feed(body, "2026-05-23T15:00:00Z", out_dir=tmp_path)

    latest = tmp_path / "field-latest.json"
    run = tmp_path / "runs" / "sfbofs-field-2026-05-23T15:00:00Z.json"
    assert latest.is_file()
    assert run.is_file()
    assert latest.read_bytes() == body
    assert run.read_bytes() == body

    assert locations == {"latest": str(latest), "run": str(run)}


def test_push_feed_still_uses_original_paths(tmp_path: Path):
    """Regression: the _push_keyed refactor must keep the point-feed paths."""
    body = b'{"hello":"point"}'
    locations = storage.push_feed(body, "2026-05-23T15:00:00Z", out_dir=tmp_path)
    latest = tmp_path / "latest.json"
    run = tmp_path / "runs" / "sfbofs-sfb1204-2026-05-23T15:00:00Z.json"
    assert latest.is_file()
    assert run.is_file()
    assert locations == {"latest": str(latest), "run": str(run)}


def test_field_run_key_format():
    assert storage.field_run_key("2026-05-23T15:00:00Z") == (
        "runs/sfbofs-field-2026-05-23T15:00:00Z.json"
    )


def test_field_and_point_feeds_coexist_in_same_out_dir(tmp_path: Path):
    storage.push_feed(b'{"point":1}', "2026-05-23T15:00:00Z", out_dir=tmp_path)
    storage.push_field_feed(b'{"field":1}', "2026-05-23T15:00:00Z", out_dir=tmp_path)
    assert (tmp_path / "latest.json").is_file()
    assert (tmp_path / "field-latest.json").is_file()
    assert (tmp_path / "runs" / "sfbofs-sfb1204-2026-05-23T15:00:00Z.json").is_file()
    assert (tmp_path / "runs" / "sfbofs-field-2026-05-23T15:00:00Z.json").is_file()
