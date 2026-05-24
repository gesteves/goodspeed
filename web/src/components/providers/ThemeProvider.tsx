import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { THEME_COOKIE, writePref, type Theme } from "@/lib/preferences";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Theme is "system" by default and follows `prefers-color-scheme` via CSS.
 * An explicit choice sets `data-theme` on <html> and a cookie; the server reads
 * the cookie in the root layout so the first paint already matches.
 */
export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writePref(THEME_COOKIE, next);
    const root = document.documentElement;
    if (next === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", next);
    }
  }, []);

  return (
    <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
