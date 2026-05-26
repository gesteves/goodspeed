import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { UNITS_COOKIE, writePref } from "@/lib/preferences";
import type { UnitSystem } from "@/lib/units/units";

interface UnitsContextValue {
  units: UnitSystem;
  setUnits: (units: UnitSystem) => void;
  toggleUnits: () => void;
}

const UnitsContext = createContext<UnitsContextValue | null>(null);

/**
 * Imperial / metric selection. Held in client context so the toggle is instant,
 * and mirrored to a cookie so the server renders the right choice on next load.
 */
export function UnitsProvider({
  initialUnits,
  children,
}: {
  initialUnits: UnitSystem;
  children: ReactNode;
}) {
  const [units, setUnitsState] = useState<UnitSystem>(initialUnits);

  const setUnits = useCallback((next: UnitSystem) => {
    setUnitsState(next);
    writePref(UNITS_COOKIE, next);
  }, []);

  const toggleUnits = useCallback(() => {
    setUnitsState((prev) => {
      const next: UnitSystem = prev === "imperial" ? "metric" : "imperial";
      writePref(UNITS_COOKIE, next);
      return next;
    });
  }, []);

  return (
    <UnitsContext value={{ units, setUnits, toggleUnits }}>
      {children}
    </UnitsContext>
  );
}

/**
 * Read the active unit system from the nearest {@link UnitsProvider}. Throws
 * when used outside one, which means a component was rendered outside the
 * Dashboard island -- always a bug.
 */
export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error("useUnits must be used within a UnitsProvider");
  return ctx;
}
