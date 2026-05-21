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

Set the S3 env vars (or use Fly secrets — same names):

```sh
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
export S3_BUCKET=my-bucket
uv run python -m goodspeed.main run
```

With `S3_BUCKET` set and no `--out-dir`, the worker pushes to S3 with proper
`Content-Type` and `Cache-Control` headers per the spec.

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
