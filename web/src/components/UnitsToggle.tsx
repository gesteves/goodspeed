"use client";

import type { UnitSystem } from "@/lib/units/units";
import { useUnits } from "./providers/UnitsProvider";
import { Segmented } from "./Segmented";

export function UnitsToggle() {
  const { units, setUnits } = useUnits();
  return (
    <Segmented<UnitSystem>
      ariaLabel="Measurement units"
      value={units}
      onChange={setUnits}
      options={[
        { value: "imperial", label: "°F · kt", title: "Imperial units" },
        { value: "metric", label: "°C · m/s", title: "Metric units" },
      ]}
    />
  );
}
