import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
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
  title: "Goodspeed — San Francisco Bay swim conditions",
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
      </body>
    </html>
  );
}
