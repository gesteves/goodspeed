import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { UnitsProvider } from "@/components/providers/UnitsProvider";
import {
  THEME_COOKIE,
  UNITS_COOKIE,
  isTheme,
  isUnitSystem,
  type Theme,
} from "@/lib/preferences";
import { DEFAULT_UNIT_SYSTEM, type UnitSystem } from "@/lib/units/units";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alcatraz Swim Conditions",
  description:
    "Modeled water temperature, currents, tide, and wind for the Alcatraz-to-Marina swim route.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9eef2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1117" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const themeCookie = jar.get(THEME_COOKIE)?.value;
  const unitsCookie = jar.get(UNITS_COOKIE)?.value;
  const theme: Theme = isTheme(themeCookie) ? themeCookie : "system";
  const units: UnitSystem = isUnitSystem(unitsCookie)
    ? unitsCookie
    : DEFAULT_UNIT_SYSTEM;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      data-theme={theme === "system" ? undefined : theme}
      // Browser extensions add attributes to <html>; ignore them on hydration.
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider initialTheme={theme}>
          <UnitsProvider initialUnits={units}>{children}</UnitsProvider>
        </ThemeProvider>
        {/* Plausible analytics, proxied through Netlify (see netlify.toml). The
            script and event endpoint are served from this domain so ad blockers
            don't drop them, while data still lands at plausible.io. */}
        <Script
          src="/js/pa-Ql_GCQ3RubH8FjaceAlmn.js"
          strategy="afterInteractive"
        />
        <Script id="plausible-init" strategy="afterInteractive">
          {`
            window.plausible = window.plausible || function () { (plausible.q = plausible.q || []).push(arguments) };
            plausible.init = plausible.init || function (i) { plausible.o = i || {} };
            plausible.init({ endpoint: '/api/event' });
          `}
        </Script>
      </body>
    </html>
  );
}
