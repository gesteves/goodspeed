# Goodspeed API

Python service that pulls SFBOFS model output from NOAA's THREDDS server,
extracts surface conditions for station **SFB1204** (SW of Alcatraz Island),
and publishes the resulting JSON feeds over HTTP. The `web/` dashboard consumes
them; the JSON contracts are `../schema/sfbofs-sfb1204.schema.json` (point feed)
and `../schema/sfbofs-field.schema.json` (gridded field feed).

**Stack:** Python 3.12+ (`<3.15`), `uv`, xarray + netCDF4 + numpy (NetCDF
processing), Starlette + uvicorn (HTTP), APScheduler (cron), jsonschema
(validation), Bugsnag (alerts), pytest + ruff. All work runs from `api/`.

## Setup

Requires [`uv`](https://docs.astral.sh/uv/).

```sh
uv sync --extra dev    # install runtime + dev deps into .venv
```

## Commands

Prefer file-scoped commands; run the full suite before pushing.

```sh
uv run pytest -q                                # full test suite (offline)
uv run pytest tests/test_output.py -q           # one file
uv run pytest -k bearing -q                      # by keyword
uv run ruff check src tests                      # lint (CI-gated; must pass)
uv run ruff check --fix src tests                # autofix

# Run the pipeline:
uv run python -m goodspeed.main run  --out-dir ../output   # one-off; writes latest.json + field-latest.json
uv run python -m goodspeed.main serve --out-dir ../output  # scheduler + HTTP server on :8080
```

`run` takes `--force` to fetch/republish even when the cycle is unchanged.
`serve` routes: `/latest.json`, `/field-latest.json`, `/healthz`.

## Code style & conventions

- **Ruff is CI-gated** (`E,F,I,B,UP,SIM`; `line-length=100`, `E501` ignored).
  Keep `ruff check src tests` clean — any violation fails the build.
- **Structured logging only.** `log.info("event.name", extra={...})` — the
  message is a dotted event name, data goes in `extra`. Never f-strings in the
  message. See `logging_config.py` (one JSON object per line on stdout).
- **Times are tz-aware UTC** everywhere. Use `datetime.now(UTC)` — ruff `UP017`
  enforces the `UTC` alias over `timezone.utc`.
- **Errors must never crash a run.** `storage.read_published_cycle` and
  `notify.report_failure` swallow their own exceptions by design.

## Architecture

`src/goodspeed/` — the pipeline runs in this order:

- **`catalog.py`** — resolves which model *cycle* is available. NOAA publishes 4
  cycles/day at 03/09/15/21 UTC; `latest_ready_cycle()` applies a 45-min
  `READY_BUFFER_MIN` because files land ~25–30 min after the cycle hour. Builds
  the THREDDS OPeNDAP / fileServer URLs.
- **`fetcher.py`** — `open_dataset()` opens a cycle's NetCDF, preferring OPeNDAP
  with a download fallback. Raises `FileNotAvailable` on a 404 / catalog miss.
- **`extract.py`** / **`extract_field.py`** — pull the SFB1204 station series
  and the gridded field, respectively (surface layer, tz-aware UTC times).
- **`output.py`** — derives bearings/speeds, converts units, assembles the feed
  dicts, runs `sanity_check()`, and validates each against its JSON Schema
  (`Draft202012Validator`; `POINT_SCHEMA_FILENAME` / `FIELD_SCHEMA_FILENAME`,
  resolved via `GOODSPEED_SCHEMA_PATH`) before publishing.
- **`storage.py`** — writes `latest.json` / `field-latest.json` atomically (tmp
  file + `os.replace`, so an HTTP read never sees a partial file). Also
  `read_published_cycle()` for the skip check.
- **`web.py`** — Starlette app serving the JSON + `/healthz` from the same
  out-dir the scheduler writes to.
- **`main.py`** — CLI (`run` / `serve`). `serve` runs the scheduler in a
  background thread and uvicorn in the main thread on :8080.
- **`notify.py`** — best-effort Bugsnag alerts; silent no-op when
  `BUGSNAG_API_KEY` is unset.

### Scheduler + server (the `serve` entrypoint)

`serve` is the Fly Machine entrypoint (one process, two jobs):

1. An APScheduler `BackgroundScheduler` fires `run_once` 8×/day — twice per NOAA
   cycle at `0,30 5,11,17,23` UTC (`main.SCHEDULER_CRON`). The first fire of each
   pair runs ~37 min after the cycle is fully published; the second 30 min later
   is cheap insurance against a late publish. `run_once` is idempotent: it
   compares the latest ready cycle to the published one and exits with
   `run.skipped` (no download) when they match. Normal day: 4 `run.complete` + 4
   `run.skipped`. A warm-up `run_once` also runs at startup so a fresh machine
   populates its volume immediately.
2. Uvicorn serves `web.py` on :8080 in the main thread.

`_safe_run` wraps `run_once` and reports a Bugsnag event on non-zero rc
(`scheduled_run.failed`) or exception (`scheduled_run.exception`).

## Testing

Tests are **offline & deterministic**: they use a committed NetCDF fixture
(`tests/fixtures/`) and patch `catalog.latest_ready_cycle` to pin the clock
rather than depending on wall time. `conftest.py` holds shared fixtures; each
module has a matching `test_*.py`. See `tests/fixtures/README.md` to refresh the
fixture.

## Safety & permission boundaries

- **Autonomous:** read files, `ruff check`, `pytest` (offline — no network),
  `ruff check --fix`, edits, and local `run`/`serve` against `../output`.
- **Ask first:** `uv add` / dependency or lockfile changes, any `git`
  commit/push, deleting files, and anything that deploys to Fly. A push to
  `main` deploys — see below.

## Config

Env vars / Fly secrets (never hardcode values; secrets live in Fly):

- `GOODSPEED_OUT_DIR` — where `serve` reads/writes JSON. Defaults to `/data`
  (the Fly Volume mount). `run` takes `--out-dir` explicitly instead.
- `BUGSNAG_API_KEY` — *optional*; when set, failed scheduled runs and the
  OPeNDAP→download fallback warning are forwarded to Bugsnag. Unset locally and
  in tests (alerting is then a silent no-op).
- `BUGSNAG_RELEASE_STAGE` — *optional*; defaults to `production`. Use
  `development`/`staging` for non-prod runs.
- `GOODSPEED_SCHEMA_PATH` — overrides schema lookup (set in the Docker image).

## Deploy

GitHub Actions (`../.github/workflows/ci.yml`): **lint → test → deploy to Fly**
on push to `main` (app `goodspeed-api`, see `fly.toml`). It triggers only on
changes under `api/**`, `schema/**`, or the workflow itself. Deploy uses the
repo root as build context so it includes both `api/` and `schema/`. Add
`[skip deploy]` (or `[no deploy]`) to a commit message to skip the deploy job.
