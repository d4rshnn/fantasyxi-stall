import { useCallback, useEffect, useReducer, useState, type Dispatch } from "react";
import { DevScreenStrip } from "./components/DevScreenStrip";
import { TimeUpDialog } from "./components/TimeUpDialog";
import { DataLoadError, loadInitialData } from "./data/loader";
import { initialState, reducer, TIMED_SCREENS, type Action, type AppState, type FlowScreen } from "./state/machine";
import { loadSettings, saveSettings } from "./state/settings";
import { AdminScreen } from "./screens/AdminScreen";
import { AttractScreen } from "./screens/AttractScreen";
import { BenchScreen } from "./screens/BenchScreen";
import { BuildScreen } from "./screens/BuildScreen";
import { CaptainScreen } from "./screens/CaptainScreen";
import { ExplainerScreen } from "./screens/ExplainerScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { LockScreen } from "./screens/LockScreen";
import { MeetScreen } from "./screens/MeetScreen";
import { NameScreen } from "./screens/NameScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { SimulateScreen } from "./screens/SimulateScreen";
import { LoadErrorScreen, LoadingScreen } from "./screens/StatusScreens";
import { PlaceholderScreen } from "./components/PlaceholderScreen";
import { fetchRevealFor } from "./state/reveal";
import { clearSession, readSession, writeSession } from "./state/session";

const ADMIN_HASH = "#/admin";

/** Dev-only: `?timer=15` shortens the countdown to 15 s for testing. Ignored in production builds. */
function devTimerMs(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const s = Number(new URLSearchParams(window.location.search).get("timer"));
  return Number.isFinite(s) && s > 0 ? s * 1000 : undefined;
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState, (s) => ({ ...s, settings: loadSettings() }));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [timerMs] = useState(devTimerMs);
  // A team locked before a page refresh (sessionStorage); restored once the data has loaded.
  const [savedSession] = useState(readSession);

  useEffect(() => saveSettings(state.settings), [state.settings]);

  // Keep the locked team in sessionStorage so an accidental refresh doesn't lose it; forget it for a new game.
  const lockedTeam = state.build?.lockedTeam ?? null;
  useEffect(() => {
    if (state.data.status !== "ready" || !state.build) return;
    const { lineup, captainId, viceCaptainId } = state.build;
    if (lockedTeam && captainId !== null && viceCaptainId !== null) {
      writeSession({
        v: 1,
        dataVersion: state.data.data.manifest.data_version,
        gameweek: state.data.data.gameweek.gameweek,
        teamName: state.teamName,
        lineup,
        captainId,
        viceCaptainId,
      });
    } else if (!lockedTeam) {
      clearSession();
    }
  }, [lockedTeam, state.data, state.build, state.teamName]);

  // Spoiler guard (not security): reveal.json is fetched only when the reducer has moved to "loading",
  // which it only does for a locked team. Results are ignored if a newer attempt has started.
  const revealAttempt = state.reveal.status === "loading" ? state.reveal.attempt : null;
  useEffect(() => {
    if (revealAttempt === null || state.data.status !== "ready") return;
    let cancelled = false;
    fetchRevealFor(state.data.data.gameweek, state.data.ctx).then((r) => {
      if (cancelled) return;
      dispatch(
        r.ok
          ? { type: "REVEAL_LOADED", attempt: revealAttempt, reveal: r.reveal, aiTeam: r.aiTeam }
          : { type: "REVEAL_FAILED", attempt: revealAttempt, message: r.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [revealAttempt, state.data]);

  // Load manifest + pre-game data (never reveal.json) on start and on "Try again".
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "DATA_LOADING" });
    loadInitialData()
      .then((data) => !cancelled && dispatch({ type: "DATA_LOADED", data, saved: savedSession }))
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof DataLoadError ? err.message : "Unexpected error while loading.";
        dispatch({ type: "DATA_FAILED", message });
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // Hidden admin: the #/admin address or Ctrl+Shift+A. Browser Back closes it.
  const openAdmin = useCallback(() => {
    if (window.location.hash === ADMIN_HASH) dispatch({ type: "OPEN_ADMIN" });
    else window.location.hash = ADMIN_HASH; // fires hashchange -> OPEN_ADMIN
  }, []);

  const clearAdminHash = () => {
    if (window.location.hash === ADMIN_HASH) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  useEffect(() => {
    const syncHash = () => dispatch({ type: window.location.hash === ADMIN_HASH ? "OPEN_ADMIN" : "CLOSE_ADMIN" });
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        openAdmin();
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("keydown", onKey);
    };
  }, [openAdmin]);

  const showTimeUp = state.screen !== "admin" && TIMED_SCREENS.includes(state.screen) && state.build?.timer.dialog;

  return (
    <div className="app">
      {import.meta.env.DEV && (
        <DevScreenStrip
          current={state.screen}
          onJump={(screen: FlowScreen) => {
            clearAdminHash();
            dispatch({ type: "GOTO", screen });
          }}
          onAdmin={openAdmin}
        />
      )}
      {state.screen === "admin" ? (
        <AdminScreen
          timerEnabled={state.settings.timerEnabled}
          onTimerEnabled={(enabled) => dispatch({ type: "SET_TIMER_ENABLED", enabled })}
          onClose={() => {
            clearAdminHash();
            dispatch({ type: "CLOSE_ADMIN" });
          }}
          onReset={() => {
            clearAdminHash();
            dispatch({ type: "RESET" });
          }}
        />
      ) : (
        renderMain(state, dispatch, () => setLoadAttempt((n) => n + 1), timerMs)
      )}
      {showTimeUp && state.build && <TimeUpDialog build={state.build} dispatch={dispatch} />}
    </div>
  );
}

function renderMain(state: AppState, dispatch: Dispatch<Action>, retry: () => void, timerMs: number | undefined) {
  if (state.data.status === "loading" || (state.data.status === "ready" && !state.build)) return <LoadingScreen />;
  if (state.data.status === "error") return <LoadErrorScreen message={state.data.message} onRetry={retry} />;
  const { data, ctx } = state.data;
  const build = state.build!;
  const next = () => dispatch({ type: "NEXT" });
  const buildProps = { build, ctx, dispatch, timerEnabled: state.settings.timerEnabled, timerMs };

  switch (state.screen) {
    case "attract":
      return <AttractScreen data={data} onNext={next} />;
    case "name":
      return <NameScreen teamName={state.teamName} dispatch={dispatch} />;
    case "build":
      return <BuildScreen {...buildProps} />;
    case "bench":
      return <BenchScreen {...buildProps} />;
    case "captain":
      return <CaptainScreen {...buildProps} />;
    case "lock":
      return <LockScreen build={build} ctx={ctx} teamName={state.teamName} dispatch={dispatch} />;
    case "meet":
      if (!build.lockedTeam) {
        // Only reachable before locking via the dev strip; nothing is revealed until the lock.
        return <PlaceholderScreen eyebrow="Not yet" title="Lock your team first" body="FantasyXI's team appears after you lock yours." />;
      }
      return <MeetScreen ctx={ctx} teamName={state.teamName} humanTeam={build.lockedTeam} reveal={state.reveal} dispatch={dispatch} />;
    case "simulate":
      return <SimulateScreen onNext={next} />;
    case "result":
      return <ResultScreen onNext={next} />;
    case "leaderboard":
      return <LeaderboardScreen onNext={next} />;
    case "explainer":
      return <ExplainerScreen onNext={next} />;
    case "admin":
      return null; // rendered above
  }
}
