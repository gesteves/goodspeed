import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import {
  faDesktop,
  faMoon,
  faSunBright,
} from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Theme } from "@/lib/preferences";
import { useTheme } from "./providers/ThemeProvider";
import { Segmented } from "./Segmented";

// We import the FA stylesheet directly above; disable the runtime CSS
// injection so SSR markup stays stable.
config.autoAddCss = false;

const iconStyle = { width: 16, height: 16 };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Segmented<Theme>
      ariaLabel="Color theme"
      value={theme}
      onChange={setTheme}
      options={[
        {
          value: "system",
          label: (
            <FontAwesomeIcon
              icon={faDesktop}
              style={iconStyle}
              aria-hidden="true"
            />
          ),
          title: "Match system theme",
        },
        {
          value: "light",
          label: (
            <FontAwesomeIcon
              icon={faSunBright}
              style={iconStyle}
              aria-hidden="true"
            />
          ),
          title: "Light theme",
        },
        {
          value: "dark",
          label: (
            <FontAwesomeIcon
              icon={faMoon}
              style={iconStyle}
              aria-hidden="true"
            />
          ),
          title: "Dark theme",
        },
      ]}
    />
  );
}
