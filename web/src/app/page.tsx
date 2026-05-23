import { AutoRefresh } from "@/components/AutoRefresh";
import { ForecastCharts } from "@/components/charts/ForecastCharts";
import { Header } from "@/components/Header";
import { NowPanel } from "@/components/now/NowPanel";
import { getDashboardData } from "@/lib/data-source";
import { findNowIndex, levelTrend } from "@/lib/derive/now";
import { getStaleness } from "@/lib/derive/staleness";
import { findTideExtrema, nextTideEvent } from "@/lib/derive/tides";
import styles from "./page.module.css";

export default async function Page() {
  const { feed } = await getDashboardData();
  const ts = feed.timeseries;
  const now = new Date();

  const nowIndex = findNowIndex(ts, now);
  const tideEvents = findTideExtrema(ts);
  const staleness = getStaleness(feed.model.cycle, now);
  const trend = levelTrend(ts, nowIndex);
  const nextTide = nextTideEvent(tideEvents, now);

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
        <ForecastCharts data={ts} nowIndex={nowIndex} tideEvents={tideEvents} />
        <footer className={styles.footer}>
          Modeled data from the NOAA San Francisco Bay Operational Forecast
          System (SFBOFS), station {feed.station.id}. These are model estimates, not measurements, and not swim advice.
        </footer>
      </main>
    </div>
  );
}
