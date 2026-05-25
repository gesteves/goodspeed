# Goodspeed API

Python service that pulls SFBOFS model output from NOAA, extracts surface
conditions for station **SFB1204** (SW of Alcatraz Island), and serves the
resulting JSON feed over HTTP. The `web/` dashboard consumes that feed; the
JSON contract lives in `../schema/sfbofs-sfb1204.schema.json`.

## Commands

All commands run from `api/` and use `uv`.

```sh
uv sync --extra dev                              # install deps (incl. dev)
uv run pytest -q                                 # tests
uv run ruff check src tests                      # lint (CI-gated; must pass)
uv run ruff check --fix src tests                # autofix lint
uv run python -m goodspeed.main run --out-dir ../output   # one-off local run
uv run python -m goodspeed.main serve --out-dir ../output # scheduler + HTTP server (port 8080)
```

`run` takes `--force` to fetch/republish even when the cycle is unchanged.

## Architecture

`src/goodspeed/` — the pipeline runs in this order:

- **`catalog.py`** — resolves which model *cycle* is available. NOAA publishes
  4 cycles/day at hours 3, 9, 15, 21 UTC; `latest_ready_cycle()` applies a
  45-min `READY_BUFFER_MIN` because files land 25–30 min after the cycle hour.
  Also builds THREDDS OPeNDAP/fileServer URLs.
- **`fetcher.py`** — `open_dataset()` opens a cycle's NetCDF, preferring
  OPeNDAP with a download fallback. Raises `FileNotAvailable` on a 404/catalog
  miss.
- **`extract.py`** — finds SFB1204 by station id, picks the surface layer,
  returns a `StationSeries` (tz-aware UTC times + per-variable arrays).
- **`output.py`** — derives bearings/speeds, converts units, assembles the
  feed dict, runs `sanity_check()`, and validates against the JSON Schema
  (`Draft202012Validator`) before publishing.
- **`storage.py`** — writes `latest.json` and `field-latest.json` to the
  out-dir (atomic: tmp file + `os.replace`). Also `read_published_cycle()` for
  the skip check.
- **`web.py`** — Starlette app exposing `/latest.json`, `/field-latest.json`,
  and `/healthz`. Reads from the same out-dir the scheduler writes to.
- **`main.py`** — CLI (`run` / `serve`). `serve` runs the scheduler in a
  background thread and uvicorn in the main thread on :8080.
- **`notify.py`** — best-effort Slack alert on scheduled-run failure.
- **`logging_config.py`** — all logs are one JSON object per line on stdout.

## The scheduler + server

`serve` is the Fly Machine entrypoint (`fly.toml`, app `goodspeed-api`). One
process runs two things:

1. An APScheduler `BackgroundScheduler` fires `run_once` 8 times per day —
   twice per NOAA cycle, at `0,30 5,11,17,23` UTC (see
   `main.SCHEDULER_CRON`). A warm-up `run_once` is also kicked off in a thread
   at startup so a freshly deployed machine populates the volume immediately.
2. Uvicorn serves the Starlette app from `web.py` on :8080 in the main thread.

The fire times are aligned to NOAA's actual publish schedule. SFBOFS cycles
run at 03/09/15/21 UTC and the last regulargrid file lands ~HH+1:23 after
each cycle, so the first fire of each pair (e.g. 05:00 for the 03Z cycle)
runs ~37 min after the cycle is fully published. The second fire 30 min later
is cheap insurance against a late publish: `run_once` is idempotent — it
compares the latest ready cycle to the cycle in the published `latest.json`
and exits with `run.skipped` when they match, without downloading the
NetCDF files. On a normal day expect 4 `run.complete` + 4 `run.skipped` per
day.

`_safe_run` wraps `run_once` and, on a non-zero rc (`scheduled_run.failed`) or
an exception (`scheduled_run.exception`), posts a Slack alert via `notify.py`.

Writes are atomic (tmp file in the same directory, then `os.replace`) so a
concurrent HTTP read never observes a partial file.

## Conventions & gotchas

- **Logging is structured.** Use `log.info("event.name", extra={...})` — never
  f-strings in the message. The message is a dotted event name; data goes in
  `extra`. Errors must never crash a run: `storage.read_published_cycle` and
  `notify.slack_failure` swallow their own exceptions by design.
- **Times are tz-aware UTC** everywhere. Use `datetime.now(UTC)` (ruff `UP017`
  enforces the `UTC` alias over `timezone.utc`).
- **Ruff is CI-gated** — `ci.yml` fails the build on any lint violation. Keep
  `ruff check src tests` clean.
- **Tests are offline & deterministic.** They use a committed NetCDF fixture
  (`tests/fixtures/`); patch `catalog.latest_ready_cycle` to pin the clock
  rather than depending on wall time. See `tests/fixtures/README.md` to refresh.

## Config

Env vars / Fly secrets:

- `GOODSPEED_OUT_DIR` — directory where `serve` reads/writes the JSON. Defaults
  to `/data` (the Fly Volume mount). The `run` subcommand takes `--out-dir`
  explicitly.
- `SLACK_WEBHOOK_URL` — *optional*; when set, failed scheduled runs alert here.
  Unset locally and in tests (alerting is then a silent no-op).
- `GOODSPEED_SCHEMA_PATH` — overrides schema lookup (set in the Docker image).

## Deploy

GitHub Actions (`.github/workflows/ci.yml`): lint → test → deploy to Fly on
push to `main`. Deploy from the repo root so the build context includes both
`api/` and `schema/`. Add `[skip deploy]` to a commit message to skip it.
