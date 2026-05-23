import { AutoRefresh } from "@/components/AutoRefresh";
import { ForecastCharts } from "@/components/charts/ForecastCharts";
import { ScrubProvider } from "@/components/charts/ScrubContext";
import { Header } from "@/components/Header";
import { BayMapSection } from "@/components/map/BayMapSection";
import { NowPanel } from "@/components/now/NowPanel";
import { getDashboardData } from "@/lib/data-source";
import { findNowIndex, levelTrend } from "@/lib/derive/now";
import { getStaleness } from "@/lib/derive/staleness";
import { findTideExtrema, nextTideEvent } from "@/lib/derive/tides";
import styles from "./page.module.css";

function nearestTimeIndex(times: readonly string[], target: Date): number {
  const t = target.getTime();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(new Date(times[i]).getTime() - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

export default async function Page() {
  const { feed, field } = await getDashboardData();
  const ts = feed.timeseries;
  const now = new Date();

  const nowIndex = findNowIndex(ts, now);
  const tideEvents = findTideExtrema(ts);
  const staleness = getStaleness(feed.model.cycle, now);
  const trend = levelTrend(ts, nowIndex);
  const nextTide = nextTideEvent(tideEvents, now);

  const pointTimes = ts.map((p) => p.t);
  const nowFieldIndex = field ? nearestTimeIndex(field.t, now) : 0;

  return (
    <div className={styles.page}>
      <AutoRefresh />
      <main className={styles.main}>
        <Header feed={feed} staleness={staleness} />
        <NowPanel
          now={now.toISOString()}
          point={ts[nowIndex]}
          trend={trend}
          nextTide={nextTide}
        />
        <ScrubProvider>
          <BayMapSection
            field={field}
            nowFieldIndex={nowFieldIndex}
            pointTimes={pointTimes}
          />
          <ForecastCharts
            data={ts}
            nowIndex={nowIndex}
            tideEvents={tideEvents}
          />
        </ScrubProvider>
        <footer className={styles.footer}>
          Modeled data from the NOAA San Francisco Bay Operational Forecast
          System, station {feed.station.id}. These are model estimates, not measurements, and not swim advice.
        </footer>
      </main>
    </div>
  );
}
