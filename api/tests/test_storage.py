from __future__ import annotations

import json
from pathlib import Path

from goodspeed import storage


def test_push_feed_writes_latest_json(tmp_path: Path):
    body = b'{"hello":"point"}'
    locations = storage.push_feed(body, tmp_path)
    latest = tmp_path / "latest.json"
    assert latest.is_file()
    assert latest.read_bytes() == body
    assert locations == {"path": str(latest.resolve())}


def test_push_feed_overwrite_is_atomic(tmp_path: Path):
    """A republish replaces the file in place; no .tmp leftovers."""
    storage.push_feed(b'{"v":1}', tmp_path)
    storage.push_feed(b'{"v":2}', tmp_path)
    assert (tmp_path / "latest.json").read_bytes() == b'{"v":2}'
    # No stragglers left in the directory after a write.
    assert [p.name for p in tmp_path.iterdir()] == ["latest.json"]


def test_read_published_cycle_roundtrip(tmp_path: Path):
    """A feed written by push_feed reports its cycle back via read_published_cycle."""
    cycle_iso = "2026-05-22T15:00:00Z"
    body = json.dumps({"model": {"cycle": cycle_iso}}).encode("utf-8")
    storage.push_feed(body, tmp_path)
    assert storage.read_published_cycle(tmp_path) == cycle_iso


def test_read_published_cycle_missing(tmp_path: Path):
    """No latest.json yet → None, so the caller fetches."""
    assert storage.read_published_cycle(tmp_path) is None


def test_read_published_cycle_corrupt(tmp_path: Path):
    """Unparseable latest.json → None (never raises); the run just fetches."""
    (tmp_path / storage.LATEST_KEY).write_bytes(b"not json{")
    assert storage.read_published_cycle(tmp_path) is None


def test_read_published_cycle_no_cycle_field(tmp_path: Path):
    """Valid JSON but missing model.cycle → None."""
    (tmp_path / storage.LATEST_KEY).write_bytes(b'{"model":{}}')
    assert storage.read_published_cycle(tmp_path) is None
