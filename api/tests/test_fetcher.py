"""Tests for the OPeNDAP retry + download fallback paths in :mod:`goodspeed.fetcher`.

We don't have network access in tests, so each test monkeypatches
``xr.open_dataset`` (and, for the download path, ``requests.head`` /
``requests.get``) to simulate the failure mode under test. ``time.sleep`` is
patched out so the retry waits don't slow the suite.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
import xarray as xr

from goodspeed import catalog, fetcher


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(fetcher.time, "sleep", lambda *_a, **_k: None)


class _FakeDs:
    """Stand-in for an xarray Dataset. close() flips a flag."""

    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


def _cycle() -> catalog.Cycle:
    return catalog.Cycle(date=date(2026, 5, 22), hour=15)


def test_opendap_retries_then_succeeds(monkeypatch):
    """First OPeNDAP attempt raises; second succeeds → meta.mode == 'opendap'."""
    cycle = _cycle()
    calls: list[str] = []
    fake = _FakeDs()

    def _open(url, *args, **kwargs):
        calls.append(str(url))
        if len(calls) == 1:
            raise OSError("simulated transient OPeNDAP error")
        return fake

    monkeypatch.setattr(xr, "open_dataset", _open)

    ds, meta = fetcher.open_dataset(cycle, "nowcast")
    assert ds is fake
    assert meta.mode == "opendap"
    assert len(calls) == 2, "second attempt must run after the first failure"
    assert all("dodsC" in c for c in calls), "both attempts hit the OPeNDAP URL"


def test_opendap_exhausts_then_downloads(monkeypatch, tmp_path: Path):
    """All OPeNDAP attempts fail → HTTPS HEAD ok → file downloaded → opened locally."""
    cycle = _cycle()
    opendap_calls: list[str] = []
    local_open: list[Path] = []

    def _open(url, *args, **kwargs):
        if isinstance(url, Path):
            local_open.append(url)
            return _FakeDs()
        opendap_calls.append(str(url))
        raise OSError("simulated OPeNDAP outage")

    monkeypatch.setattr(xr, "open_dataset", _open)

    class _Resp:
        def __init__(self, status: int = 200) -> None:
            self.status_code = status
            self.headers: dict[str, str] = {}

        def raise_for_status(self) -> None:
            if self.status_code >= 400:
                raise RuntimeError(f"HTTP {self.status_code}")

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def iter_content(self, chunk_size: int):  # noqa: ARG002
            yield b"x" * 1024

    monkeypatch.setattr(
        fetcher.requests, "head", lambda *a, **k: _Resp(200)
    )
    monkeypatch.setattr(
        fetcher.requests, "get", lambda *a, **k: _Resp(200)
    )

    ds, meta = fetcher.open_dataset(cycle, "nowcast", tmp_root=tmp_path)
    assert isinstance(ds, _FakeDs)
    assert meta.mode == "download"
    assert len(opendap_calls) == len(fetcher.OPENDAP_RETRIES), (
        "every OPeNDAP attempt should have run before falling back"
    )
    assert local_open == [meta.local_path]
    assert meta.local_path is not None
    assert meta.local_path.parent == tmp_path.expanduser().resolve()


def test_head_404_raises_file_not_available(monkeypatch):
    """HTTPS HEAD 404 surfaces FileNotAvailable so main can fall back to a prior cycle."""
    cycle = _cycle()

    def _open(url, *args, **kwargs):
        raise OSError("opendap down")

    monkeypatch.setattr(xr, "open_dataset", _open)

    class _Resp:
        status_code = 404
        headers: dict[str, str] = {}

    monkeypatch.setattr(fetcher.requests, "head", lambda *a, **k: _Resp())

    with pytest.raises(fetcher.FileNotAvailable):
        fetcher.open_dataset(cycle, "nowcast")


def test_head_5xx_distinct_from_4xx(monkeypatch, caplog):
    """HEAD 503 (NOAA outage) raises with a server-error tagged log event."""
    cycle = _cycle()

    def _open(url, *args, **kwargs):
        raise OSError("opendap down")

    monkeypatch.setattr(xr, "open_dataset", _open)

    class _Resp:
        status_code = 503
        headers: dict[str, str] = {}

    monkeypatch.setattr(fetcher.requests, "head", lambda *a, **k: _Resp())

    with (
        caplog.at_level("WARNING", logger="goodspeed.fetcher"),
        pytest.raises(RuntimeError, match="NOAA server error"),
    ):
        fetcher.open_dataset(cycle, "nowcast")

    assert any(
        r.message == "download.head_server_error" for r in caplog.records
    ), "5xx must emit the dedicated server-error log event"
