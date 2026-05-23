import { Component, type ReactNode } from "react";
import styles from "@/styles/dashboard-error.module.css";

interface State {
  hasError: boolean;
}

/**
 * Catches runtime exceptions in the Dashboard island (chart rendering, map
 * init, etc.) and shows the same "Conditions unavailable" UI we used to render
 * from `app/error.tsx` in the Next.js app. The "Try again" button clears the
 * error state so the next refresh can replace the data.
 */
export class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error("Dashboard error:", error);
  }

  reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>Conditions unavailable</h1>
          <p className={styles.body}>
            The feed couldn&rsquo;t be loaded right now. This usually clears up
            on its own — the data refreshes a few times a day.
          </p>
          <button type="button" className={styles.button} onClick={this.reset}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
