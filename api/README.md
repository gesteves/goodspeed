# Goodspeed API

Pulls the latest SFBOFS station NetCDF (nowcast + forecast) from NOAA's THREDDS
server, extracts surface-layer conditions for station SFB1204 (SW of Alcatraz
Island), and serves the resulting JSON feed over HTTP. In production the same
process runs both the hourly fetch and the HTTP server, with the JSON held on
a Fly Volume.

## Run locally

```sh
uv sync
uv run python -m goodspeed.main run --out-dir ../output
```

This writes `../output/latest.json` and `../output/field-latest.json`. Both
feeds are validated against [`schema/`](../schema/) before being written.

To run the scheduler + HTTP server locally:

```sh
uv run python -m goodspeed.main serve --out-dir ../output
# then: curl http://localhost:8080/latest.json
```

## Tests

```sh
uv run pytest -q
```

Tests use a committed nowcast NetCDF fixture under `tests/fixtures/`. See
[`tests/fixtures/README.md`](tests/fixtures/README.md) for refresh instructions.

## Production

`python -m goodspeed.main serve` is the Fly Machine entrypoint (`fly.toml`,
app `goodspeed-api`). One process runs two things:

- An APScheduler `BackgroundScheduler` that fires the fetch hourly, on the
  hour, UTC. A warm-up `run_once` is also kicked off at startup.
- A Starlette + uvicorn HTTP server on :8080 that serves the published JSON
  from `/data` (a Fly Volume mounted at that path). Routes:
  - `GET /latest.json` — point feed (`Cache-Control: public, max-age=300`)
  - `GET /field-latest.json` — gridded field feed (same cache header)
  - `GET /healthz` — 200 once `latest.json` exists, 503 while warming

NOAA publishes the SFBOFS model only four times a day, but the exact publish
times aren't guaranteed — polling hourly keeps the feed fresh whenever a new
cycle lands.

To avoid downloading the large NetCDF files needlessly, each run first reads
the cycle from the already-published `latest.json` and compares it to the
latest ready cycle. When they match it logs `run.skipped` and exits without
fetching; only an hour that brings a genuinely new cycle does the full
download. Pass `--force` to `run` to fetch and republish regardless:

```sh
uv run python -m goodspeed.main run --out-dir ../output --force
```

### Failure alerts

When a scheduled run fails — a non-zero exit (`scheduled_run.failed`) or an
unhandled exception (`scheduled_run.exception`) — the API posts an alert to
Slack if the `SLACK_WEBHOOK_URL` env var is set to an incoming-webhook URL. It
is unset locally and in tests, where alerting is a silent no-op; in production
set it as a Fly secret. Posting is best-effort: a webhook error is logged
(`notify.slack_failed`) and never interrupts the run.
