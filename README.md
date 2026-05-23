# Goodspeed

Modeled San Francisco Bay conditions at station [SFB1204](https://tidesandcurrents.noaa.gov/ofs/ofs_station.html?stname=SW%20of%20AI&ofs=sfb&stnid=SFB1204&subdomain=en) (SW of Alcatraz Island) — the
NOAA SFBOFS station nearest the Alcatraz-to-SF swim route.

Two halves:

- **`api/`** — Python. Polls NOAA's THREDDS server hourly, extracts surface-layer
  conditions for SFB1204, and serves the resulting JSON feed over HTTP
  (Starlette + uvicorn on Fly, app `goodspeed-api`).
- **`web/`** — Dashboard that renders the feed.

The shared JSON contract lives in [`schema/`](./schema/).

## Quick local run

```sh
cd api
uv sync
uv run python -m goodspeed.main run --out-dir ../output
```

This fetches the latest available cycle, extracts SFB1204, validates against
the schema, and writes `latest.json` + `field-latest.json` into `../output/`.

See [`api/README.md`](./api/README.md) for the full workflow, the
scheduler/HTTP-server `serve` command, and deployment.
