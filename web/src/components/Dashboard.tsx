import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardData } from "@/lib/data-source";
import { findNowIndex, levelTrend, nearestTimeIndex } from "@/lib/derive/now";
import { getStaleness } from "@/lib/derive/staleness";
import { findTideExtrema, nextTideEvent } from "@/lib/derive/tides";
import type { Theme } from "@/lib/preferences";
import type { UnitSystem } from "@/lib/units/units";
import { ForecastCharts } from "./charts/ForecastCharts";
import { ScrubProvider } from "./charts/ScrubContext";
import { DashboardErrorBoundary } from "./DashboardErrorBoundary";
import { Header } from "./Header";
import { BayMapSection } from "./map/BayMapSection";
import { NowPanel } from "./now/NowPanel";
import { ThemeProvider } from "./providers/ThemeProvider";
import { UnitsProvider } from "./providers/UnitsProvider";

/** Payload returned by the /dashboard.json refresh endpoint. */
export type DashboardPayload = Pick<
  DashboardData,
  "feed" | "field" | "fieldStatus"
>;

interface Props {
  initialData: DashboardPayload;
  initialTheme: Theme;
  initialUnits: UnitSystem;
}

const REFRESH_INTERVAL_MS = 60_000;
const CLOCK_TICK_MS = 30_000;

/**
 * Single React island that owns the interactive surface and the refresh loop.
 *
 * The Astro page renders the first paint with derived values from the server;
 * after hydration, this component:
 *  - re-runs the (cheap) derivations whenever the local clock ticks, so "now"
 *    follows the user's clock rather than the server's,
 *  - fetches `/dashboard.json` every 60s (also on tab visible / online), and
 *  - skips `setState` when the model cycle is unchanged, so the visx charts
 *    don't re-render on the common no-op refresh.
 *
 * The whole interactive tree lives in one island so scrub state, theme,
 * units, and the Mapbox instance survive each refresh.
 */
export function Dashboard({ initialData, initialTheme, initialUnits }: Props) {
  const [data, setData] = useState<DashboardPayload>(initialData);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inFlight = useRef<Promise<void> | null>(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const promise = (async () => {
      try {
        const res = await fetch("/dashboard.json", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as DashboardPayload;
        const prev = dataRef.current;
        const cycleChanged =
          next.feed.model.cycle !== prev.feed.model.cycle ||
          (next.field?.model.cycle ?? null) !==
            (prev.field?.model.cycle ?? null) ||
          next.fieldStatus !== prev.fieldStatus;
        if (cycleChanged) setData(next);
      } catch (err) {
        console.warn("dashboard refresh failed:", err);
      } finally {
        setNowMs(Date.now());
      }
    })();
    inFlight.current = promise;
    try {
      await promise;
    } finally {
      inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);

  // Tick the local clock between refreshes so derivations stay current.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const { feed, field, fieldStatus } = data;

  const derived = useMemo(() => {
    const ts = feed.timeseries;
    const now = new Date(nowMs);
    const nowIndex = findNowIndex(ts, now);
    const tideEvents = findTideExtrema(ts);
    const staleness = getStaleness(feed.model.cycle, now);
    const trend = levelTrend(ts, nowIndex);
    const nextTide = nextTideEvent(tideEvents, now);
    const pointTimes = ts.map((p) => p.t);
    const nowFieldIndex = field ? nearestTimeIndex(field.t, now) : 0;
    return {
      ts,
      nowIso: now.toISOString(),
      nowIndex,
      tideEvents,
      staleness,
      trend,
      nextTide,
      pointTimes,
      nowFieldIndex,
    };
  }, [feed, field, nowMs]);

  return (
    <ThemeProvider initialTheme={initialTheme}>
      <UnitsProvider initialUnits={initialUnits}>
        <DashboardErrorBoundary>
          <Header feed={feed} staleness={derived.staleness} />
          <NowPanel
            now={derived.nowIso}
            point={derived.ts[derived.nowIndex]}
            trend={derived.trend}
            nextTide={derived.nextTide}
          />
          <ScrubProvider>
            <BayMapSection
              field={field}
              fieldStatus={fieldStatus}
              nowFieldIndex={derived.nowFieldIndex}
              pointTimes={derived.pointTimes}
            />
            <ForecastCharts
              data={derived.ts}
              nowIndex={derived.nowIndex}
              tideEvents={derived.tideEvents}
            />
          </ScrubProvider>
        </DashboardErrorBoundary>
      </UnitsProvider>
    </ThemeProvider>
  );
}
