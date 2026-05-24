# Goodspeed API

Python service that fetches NOAA SFBOFS model output and serves the resulting
JSON feed over HTTP.

## Run locally

Requires [`uv`](https://docs.astral.sh/uv/).

```sh
uv sync --extra dev
uv run python -m goodspeed.main run --out-dir ../output
```

This writes `../output/latest.json` and `../output/field-latest.json`. Both
feeds are validated against [`schema/`](../schema/) before being written. Pass
`--force` to fetch and republish even when the cycle is unchanged.

To run the scheduler + HTTP server locally:

```sh
uv run python -m goodspeed.main serve --out-dir ../output
# then: curl http://localhost:8080/latest.json
```

Routes: `/latest.json`, `/field-latest.json`, `/healthz`.

## Commands

```sh
uv run pytest -q                    # tests (offline; uses committed NetCDF fixture)
uv run ruff check src tests         # lint (CI-gated)
uv run ruff check --fix src tests   # autofix
```

See [`tests/fixtures/README.md`](tests/fixtures/README.md) for fixture refresh
instructions.

## Env vars

- `GOODSPEED_OUT_DIR` — directory `serve` reads/writes. Defaults to `/data`
  (the Fly Volume mount in production). `run` takes `--out-dir` explicitly.
- `SLACK_WEBHOOK_URL` — optional. When set, failed scheduled runs post an
  alert. Unset locally and in tests (silent no-op).
- `GOODSPEED_SCHEMA_PATH` — overrides schema lookup (set in the Docker image).

## Deploy

GitHub Actions (`.github/workflows/ci.yml`): lint → test → deploy to Fly on
push to `main` (app `goodspeed-api`, see `fly.toml`). Deploy from the repo
root so the build context includes both `api/` and `schema/`. Add
`[skip deploy]` to a commit message to skip it.
