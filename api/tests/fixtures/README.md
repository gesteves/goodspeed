# Test fixtures

`sfbofs_stations_nowcast.nc` is a real SFBOFS station file from one cycle,
committed to keep the test suite deterministic and offline.

**Origin:** `sfbofs.t09z.20260520.stations.nowcast.nc` downloaded from
`https://opendap.co-ops.nos.noaa.gov/thredds/fileServer/NOAA/SFBOFS/MODELS/2026/05/20/sfbofs.t09z.20260520.stations.nowcast.nc`.

Properties (used in `test_extract.py`):
- 61 timesteps (6 h of nowcast at 6-min cadence).
- 250 stations.
- SFB1204 is present; lat ≈ 37.82, lon ≈ -122.43.

## Refreshing

Pick any recent cycle; the schema doesn't change between cycles. From the
repo root:

```sh
curl -o api/tests/fixtures/sfbofs_stations_nowcast.nc \
  "https://opendap.co-ops.nos.noaa.gov/thredds/fileServer/NOAA/SFBOFS/MODELS/YYYY/MM/DD/sfbofs.tHHz.YYYYMMDD.stations.nowcast.nc"
```

If `test_extract.py` asserts a specific timestep count or time range, update
those assertions when refreshing.
