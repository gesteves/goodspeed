"""Tests for the Starlette HTTP server (`goodspeed.web`)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from goodspeed import storage, web


@pytest.fixture()
def client(tmp_path: Path, monkeypatch) -> TestClient:
    """Point the app at a fresh tmp out_dir for each test."""
    monkeypatch.setenv(web.OUT_DIR_ENV, str(tmp_path))
    return TestClient(web.app)


def _write_point_feed(tmp_path: Path, cycle: str = "2026-05-22T15:00:00Z") -> bytes:
    body = json.dumps({"model": {"cycle": cycle}, "timeseries": []}).encode()
    storage.push_feed(body, tmp_path)
    return body


def test_latest_returns_file_with_cache_header(client: TestClient, tmp_path: Path):
    body = _write_point_feed(tmp_path)
    r = client.get("/latest.json")
    assert r.status_code == 200
    assert r.content == body
    assert r.headers["cache-control"] == storage.LATEST_CACHE
    assert r.headers["content-type"].startswith(storage.CONTENT_TYPE)


def test_field_latest_returns_file_with_cache_header(client: TestClient, tmp_path: Path):
    body = b'{"frames":[]}'
    storage.push_field_feed(body, tmp_path)
    r = client.get("/field-latest.json")
    assert r.status_code == 200
    assert r.content == body
    assert r.headers["cache-control"] == storage.LATEST_CACHE


def test_latest_404_when_not_yet_published(client: TestClient):
    r = client.get("/latest.json")
    assert r.status_code == 404
    assert r.json() == {"error": "latest.json not published yet"}


def test_field_latest_404_when_not_yet_published(client: TestClient):
    r = client.get("/field-latest.json")
    assert r.status_code == 404


def test_healthz_503_when_no_feed_yet(client: TestClient):
    r = client.get("/healthz")
    assert r.status_code == 503
    assert r.json() == {"status": "warming"}
    assert r.headers["cache-control"] == "no-store"


def test_healthz_200_when_feed_published(client: TestClient, tmp_path: Path):
    _write_point_feed(tmp_path, cycle="2026-05-22T21:00:00Z")
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "cycle": "2026-05-22T21:00:00Z"}
    assert r.headers["cache-control"] == "no-store"
