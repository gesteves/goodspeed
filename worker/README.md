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
that runs the fetch hourly, on the hour, UTC. This is the Fly Machine
entrypoint (see `fly.toml`).

NOAA publishes the SFBOFS model only four times a day, but the exact publish
times aren't guaranteed — polling hourly keeps the feed fresh whenever a new
cycle lands.

To avoid downloading the large NetCDF files needlessly, each run first reads
the cycle from the already-published `latest.json` and compares it to the
latest ready cycle. When they match it logs `run.skipped` and exits without
fetching; only an hour that brings a genuinely new cycle does the full
download. Pass `--force` to `run` to fetch and republish regardless:

```sh
uv run --env-file .env python -m goodspeed.main run --force
```

### Failure alerts

When a scheduled run fails — a non-zero exit (`scheduled_run.failed`) or an
unhandled exception (`scheduled_run.exception`) — the worker posts an alert to
Slack if the `SLACK_WEBHOOK_URL` env var is set to an incoming-webhook URL. It
is unset locally and in tests, where alerting is a silent no-op; in production
set it as a Fly secret. Posting is best-effort: a webhook error is logged
(`notify.slack_failed`) and never interrupts the worker.
