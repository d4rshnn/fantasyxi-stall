import { useCallback, useEffect, useReducer, useState } from "react";
import { DevScreenStrip } from "./components/DevScreenStrip";
import { DataLoadError, loadInitialData } from "./data/loader";
import type { InitialData } from "./data/types";
import { initialState, reducer, type AppState, type FlowScreen } from "./state/machine";
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

const ADMIN_HASH = "#/admin";

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Load manifest + pre-game data (never reveal.json) on start and on "Try again".
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "DATA_LOADING" });
    loadInitialData()
      .then((data) => !cancelled && dispatch({ type: "DATA_LOADED", data }))
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
    const syncHash = () =>
      dispatch({ type: window.location.hash === ADMIN_HASH ? "OPEN_ADMIN" : "CLOSE_ADMIN" });
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

  const next = () => dispatch({ type: "NEXT" });

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
        renderMain(state, next, () => setLoadAttempt((n) => n + 1))
      )}
    </div>
  );
}

function renderMain(state: AppState, next: () => void, retry: () => void) {
  if (state.data.status === "loading") return <LoadingScreen />;
  if (state.data.status === "error") return <LoadErrorScreen message={state.data.message} onRetry={retry} />;
  const data: InitialData = state.data.data;

  switch (state.screen) {
    case "attract":
      return <AttractScreen data={data} onNext={next} />;
    case "name":
      return <NameScreen onNext={next} />;
    case "build":
      return <BuildScreen onNext={next} />;
    case "bench":
      return <BenchScreen onNext={next} />;
    case "captain":
      return <CaptainScreen onNext={next} />;
    case "lock":
      return <LockScreen onNext={next} />;
    case "meet":
      return <MeetScreen onNext={next} />;
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
