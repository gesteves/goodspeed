# Goodspeed

> I love pressure. I eat it for breakfast.

A live dashboard showing forecast conditions in San Francisco Bay at station [SFB1204](https://tidesandcurrents.noaa.gov/ofs/ofs_station.html?stname=SW%20of%20AI&ofs=sfb&stnid=SFB1204&subdomain=en) (SW of Alcatraz Island) based on the hydrodynamic model provided by the National Oceanic and Atmospheric Administration’s San Francisco Bay Operational Forecast System. See it live at https://alcatraz.giventotri.com/

<img width="1858" height="1794" alt="image" src="https://github.com/user-attachments/assets/723f7013-5ce0-4d9e-83a9-283104d278fc" />

Goodspeed consists of two separate apps:

- **`api/`** — A Python backend application that polls NOAA's THREDDS server hourly, extracts surface-layer
  conditions for SFB1204, and serves the resulting JSON feed over HTTP.
- **`web/`** — A single-page SSR Astro front-end application that renders the feed's data as a dashboard.

Instructions for setting up each of the apps are available in their corresponding READMEs.
