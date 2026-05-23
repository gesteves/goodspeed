"""Tests for the field-feed storage path."""

from __future__ import annotations

from pathlib import Path

from goodspeed import storage


def test_push_field_feed_writes_field_latest_json(tmp_path: Path):
    body = b'{"hello":"field"}'
    locations = storage.push_field_feed(body, tmp_path)
    latest = tmp_path / "field-latest.json"
    assert latest.is_file()
    assert latest.read_bytes() == body
    assert locations == {"path": str(latest.resolve())}


def test_field_and_point_feeds_coexist_in_same_out_dir(tmp_path: Path):
    storage.push_feed(b'{"point":1}', tmp_path)
    storage.push_field_feed(b'{"field":1}', tmp_path)
    assert (tmp_path / "latest.json").read_bytes() == b'{"point":1}'
    assert (tmp_path / "field-latest.json").read_bytes() == b'{"field":1}'
