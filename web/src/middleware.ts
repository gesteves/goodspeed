import { defineMiddleware } from "astro:middleware";
import {
  THEME_COOKIE,
  UNITS_COOKIE,
  isTheme,
  isUnitSystem,
} from "@/lib/preferences";
import { DEFAULT_UNIT_SYSTEM } from "@/lib/units/units";

/**
 * Reads the theme/units preference cookies once per request and stashes them
 * on `Astro.locals`. The layout uses `locals.theme` to render `<html
 * data-theme>` flash-free; the page passes both into the Dashboard island so
 * `ThemeProvider` / `UnitsProvider` hydrate with the same values.
 */
export const onRequest = defineMiddleware((context, next) => {
  const themeCookie = context.cookies.get(THEME_COOKIE)?.value;
  const unitsCookie = context.cookies.get(UNITS_COOKIE)?.value;
  context.locals.theme = isTheme(themeCookie) ? themeCookie : "system";
  context.locals.units = isUnitSystem(unitsCookie)
    ? unitsCookie
    : DEFAULT_UNIT_SYSTEM;
  return next();
});
