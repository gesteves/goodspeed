"use client";

import type { Theme } from "@/lib/preferences";
import { useTheme } from "./providers/ThemeProvider";
import { Segmented } from "./Segmented";

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const SystemIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const LightIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const DarkIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Segmented<Theme>
      ariaLabel="Color theme"
      value={theme}
      onChange={setTheme}
      options={[
        { value: "system", label: <SystemIcon />, title: "Match system theme" },
        { value: "light", label: <LightIcon />, title: "Light theme" },
        { value: "dark", label: <DarkIcon />, title: "Dark theme" },
      ]}
    />
  );
}
