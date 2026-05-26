import type { UnitSystem } from "@/lib/units/units";
import { useUnits } from "./providers/UnitsProvider";
import { Segmented } from "./Segmented";

/**
 * Imperial / metric toggle. Reads from and writes to {@link UnitsProvider},
 * which persists the choice in the `gs-units` cookie. The feed already
 * carries both unit systems, so this just selects which field readings come
 * from -- there is no conversion math at the consumer.
 */
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
