# Goodspeed

Modeled San Francisco Bay conditions at station [SFB1204](https://tidesandcurrents.noaa.gov/ofs/ofs_station.html?stname=SW%20of%20AI&ofs=sfb&stnid=SFB1204&subdomain=en) (SW of Alcatraz Island) — the
NOAA SFBOFS station nearest the Alcatraz-to-SF swim route.

Two halves:

- **`worker/`** — Python. Runs four times a day, pulls the latest SFBOFS
  station NetCDF files from NOAA's THREDDS server, extracts surface-layer
  conditions for SFB1204, and publishes a JSON feed (S3 or local file).
- **`web/`** — Dashboard that renders the feed.

The shared JSON contract lives in [`schema/`](./schema/).

## Quick local run

```sh
cd worker
uv sync
uv run python -m goodspeed.main run --out-dir ../output
```

This fetches the latest available cycle, extracts SFB1204, validates against
the schema, and writes `latest.json` + `runs/<cycle>.json` into `../output/`.
No AWS creds required when `--out-dir` is set (or `S3_BUCKET` is unset).

See [`worker/README.md`](./worker/README.md) for the full worker workflow,
deployment, and the direction-convention verification step.
