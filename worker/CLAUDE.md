# Goodspeed Worker

Python service that pulls SFBOFS model output from NOAA, extracts surface
conditions for station **SFB1204** (SW of Alcatraz Island), and publishes a
JSON feed. The `web/` dashboard consumes that feed; the JSON contract lives in
`../schema/sfbofs-sfb1204.schema.json`.

## Commands

All commands run from `worker/` and use `uv`.

```sh
uv sync --extra dev                              # install deps (incl. dev)
uv run pytest -q                                 # tests
uv run ruff check src tests                      # lint (CI-gated; must pass)
uv run ruff check --fix src tests                # autofix lint
uv run python -m goodspeed.main run --out-dir ../output   # one-off local run, no AWS
uv run --env-file .env python -m goodspeed.main run       # one-off run against S3
uv run python -m goodspeed.main serve --out-dir ../output # run the scheduler locally
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
- **`storage.py`** — publishes `latest.json` + `runs/sfbofs-sfb1204-<cycle>.json`.
  Routing: `--out-dir` → local files; else `S3_BUCKET` set → S3; else
  `./output/` with a warning. Also `read_published_cycle()` for the skip check.
- **`main.py`** — CLI (`run` / `serve`) and the scheduler.
- **`notify.py`** — best-effort Slack alert on scheduled-run failure.
- **`logging_config.py`** — all logs are one JSON object per line on stdout.

## The scheduler

`serve` runs an APScheduler `BlockingScheduler` firing `run_once` hourly on the
hour UTC — it's the Fly Machine entrypoint (`fly.toml`, app `gdspd-worker`).

Hourly polling is intentional: NOAA's 4 daily cycles don't land at exact times.
Each run first compares the latest ready cycle to the cycle in the published
`latest.json`; if they match it logs `run.skipped` and exits **without**
downloading the large NetCDF files. So ~20 runs/day are cheap no-ops.

`_safe_run` wraps `run_once` and, on a non-zero rc (`scheduled_run.failed`) or
an exception (`scheduled_run.exception`), posts a Slack alert via `notify.py`.

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

- `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` —
  required for S3 publishing in production.
- `SLACK_WEBHOOK_URL` — *optional*; when set, failed scheduled runs alert here.
  Unset locally and in tests (alerting is then a silent no-op).
- `GOODSPEED_SCHEMA_PATH` — overrides schema lookup (set in the Docker image).

## Deploy

GitHub Actions (`.github/workflows/ci.yml`): lint → test → deploy to Fly on
push to `main`. Deploy from the repo root so the build context includes both
`worker/` and `schema/`. Add `[skip deploy]` to a commit message to skip it.
