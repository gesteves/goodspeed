# Goodspeed Worker

Pulls the latest SFBOFS station NetCDF (nowcast + forecast) from NOAA's THREDDS
server, extracts surface-layer conditions for station SFB1204 (SW of Alcatraz
Island), and publishes a JSON feed.

## Run locally (no AWS required)

```sh
uv sync
uv run python -m goodspeed.main run --out-dir ../output
```

This writes `../output/latest.json` and `../output/runs/sfbofs-sfb1204-<cycle>.json`.
The feed is validated against [`schema/sfbofs-sfb1204.schema.json`](../schema/sfbofs-sfb1204.schema.json)
before being written.

## Run against S3

Put the S3 credentials in a `.env` file (gitignored — never commit it):

```sh
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET=my-bucket
```

Then run with `uv`, which loads the file for you:

```sh
uv run --env-file .env python -m goodspeed.main run
```

With `S3_BUCKET` set and no `--out-dir`, the worker pushes to S3 with proper
`Content-Type` and `Cache-Control` headers per the spec.

In production these come from Fly secrets (same variable names), so no `.env`
is involved.

## Tests

```sh
uv run pytest -q
```

Tests use a committed nowcast NetCDF fixture under `tests/fixtures/`. See
[`tests/fixtures/README.md`](tests/fixtures/README.md) for refresh instructions.

## Schedule (production)

`python -m goodspeed.main serve` starts an APScheduler `BlockingScheduler`
that runs the fetch at 03:45, 09:45, 15:45, 21:45 UTC. This is the Fly Machine
entrypoint (see `fly.toml`).
