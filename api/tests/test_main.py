from __future__ import annotations

from datetime import date

from goodspeed import catalog, fetcher, main


def _patch_cycle(monkeypatch) -> catalog.Cycle:
    """Pin latest_ready_cycle so the skip logic doesn't depend on the wall clock."""
    cycle = catalog.Cycle(date=date(2026, 5, 22), hour=15)
    monkeypatch.setattr(catalog, "latest_ready_cycle", lambda *a, **k: cycle)
    return cycle


def _raise_missing(cycle, kind, *a, **k):
    raise fetcher.FileNotAvailable(f"test: {cycle.iso()} {kind}")


def test_run_once_skips_when_cycle_already_published(tmp_path, monkeypatch):
    """When the latest cycle is already published, the heavy fetch is skipped."""
    cycle = _patch_cycle(monkeypatch)
    monkeypatch.setattr(main.storage, "read_published_cycle", lambda *a, **k: cycle.iso())

    def _no_fetch(*a, **k):
        raise AssertionError("open_dataset must not run when the cycle is current")

    monkeypatch.setattr(main.fetcher, "open_dataset", _no_fetch)
    assert main.run_once(out_dir=tmp_path) == 0


def test_run_once_fetches_when_cycle_is_new(tmp_path, monkeypatch):
    """A newer ready cycle than what's published → the fetch path runs."""
    _patch_cycle(monkeypatch)
    monkeypatch.setattr(
        main.storage, "read_published_cycle", lambda *a, **k: "2026-05-22T09:00:00Z"
    )
    monkeypatch.setattr(main.fetcher, "open_dataset", _raise_missing)
    # New cycle → fetch is attempted; with every file reading as missing the run
    # exhausts its fallbacks and returns 2 — not 0, which would mean it skipped.
    assert main.run_once(out_dir=tmp_path) == 2


def test_run_once_force_skips_cycle_probe(tmp_path, monkeypatch):
    """--force fetches unconditionally and never reads the published cycle."""
    _patch_cycle(monkeypatch)
    probed: list[bool] = []

    def _probe(*a, **k):
        probed.append(True)
        return "2026-05-22T15:00:00Z"

    monkeypatch.setattr(main.storage, "read_published_cycle", _probe)
    monkeypatch.setattr(main.fetcher, "open_dataset", _raise_missing)
    assert main.run_once(out_dir=tmp_path, force=True) == 2
    assert probed == [], "--force must not consult the published cycle"


def test_run_once_closes_nowcast_when_forecast_missing(tmp_path, monkeypatch):
    """If nowcast opens but forecast 404s, the nowcast Dataset must be closed
    before the fallback retries — otherwise it leaks for the lifetime of the
    process. This guards the regression fix in main.run_once's fallback loop.
    """
    _patch_cycle(monkeypatch)
    monkeypatch.setattr(main.storage, "read_published_cycle", lambda *a, **k: None)

    class _FakeDs:
        def __init__(self) -> None:
            self.closed = False

        def close(self) -> None:
            self.closed = True

    opened: list[_FakeDs] = []

    def _open(cycle, kind, *a, **k):
        # Nowcast succeeds; forecast 404s on every cycle, exhausting fallbacks.
        if kind == "nowcast":
            ds = _FakeDs()
            opened.append(ds)
            return ds, fetcher.FetchMeta(
                cycle=cycle, kind=kind, url="opendap://test", mode="opendap", elapsed_s=0.1
            )
        raise fetcher.FileNotAvailable(f"test: {cycle.iso()} {kind}")

    monkeypatch.setattr(main.fetcher, "open_dataset", _open)
    assert main.run_once(out_dir=tmp_path) == 2
    assert opened, "nowcast open should have been attempted"
    assert all(ds.closed for ds in opened), (
        "every successfully-opened nowcast Dataset must be closed before the next fallback"
    )
