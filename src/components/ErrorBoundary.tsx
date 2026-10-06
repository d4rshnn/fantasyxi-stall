import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Start a fresh game (the leaderboard is kept: it lives in App state + browser storage). */
  onRestart: () => void;
  /** Only when the leaderboard can't be saved in this browser: offer a backup download first. */
  onExportBoard?: () => void;
}

interface State {
  failed: boolean;
}

/** Catches a crash in any screen and shows a friendly restart screen instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept for the operator's developer tools; visitors only see the friendly screen.
    console.error("Screen crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen crash" role="alert">
        <h1 className="screen__title">Something went wrong</h1>
        <p className="screen__body">Sorry! Tap the button to start a new game. The leaderboard is kept.</p>
        <button type="button" className="btn btn--primary btn--hero" onClick={this.props.onRestart} autoFocus>
          Tap to restart
        </button>
        {this.props.onExportBoard && (
          <button type="button" className="btn btn--ghost" onClick={this.props.onExportBoard}>
            Save a leaderboard backup first
          </button>
        )}
      </main>
    );
  }
}

/** Dev-only crash switch for testing the boundary (never rendered in production builds). */
export function DevCrash(): never {
  throw new Error("Deliberate test crash (?crash=...)");
}
