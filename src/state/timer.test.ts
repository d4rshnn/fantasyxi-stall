import { describe, expect, it } from "vitest";
import { resultsById, scoreTeam } from "../engine";
import { buildReducer, newBuild, TIMER_MS, timerView, type BuildState } from "./build";
import { reducer, type AppState } from "./machine";
import { checkReveal } from "./reveal";
import { aiBuild, ctx, loadedApp, lockedApp, readyToLock, reveal } from "./testing";

const T0 = 1_000_000;

describe("display-only timer", () => {
  it("starts once at 3 minutes and never restarts, even long after 0:00 (overtime)", () => {
    const s = buildReducer(newBuild(ctx), { type: "TIMER_START", now: T0 }, ctx);
    expect(s.timer).toEqual({ endsAt: T0 + TIMER_MS });
    expect(buildReducer(s, { type: "TIMER_START", now: T0 + TIMER_MS + 60_000 }, ctx)).toBe(s);
  });

  it("counts down, warns at 0:30, then counts UP in overtime", () => {
    const end = T0 + TIMER_MS;
    expect(timerView(end, T0)).toEqual({ mode: "normal", value: "3:00" });
    expect(timerView(end, end - 30_500)).toEqual({ mode: "normal", value: "0:31" });
    expect(timerView(end, end - 30_000)).toEqual({ mode: "warning", value: "0:30" });
    expect(timerView(end, end - 400)).toEqual({ mode: "warning", value: "0:01" });
    expect(timerView(end, end)).toEqual({ mode: "overtime", value: "+0:00" });
    expect(timerView(end, end + 23_400)).toEqual({ mode: "overtime", value: "+0:23" });
    expect(timerView(end, end + 65_000)).toEqual({ mode: "overtime", value: "+1:05" });
  });

  it("reaching 0 changes nothing: no lock, no auto-complete, no dialog, team untouched", () => {
    // There is no time-up action any more; the only timer state is the end time.
    for (const start of [newBuild(ctx), aiBuild()]) {
      const s: BuildState = buildReducer(start, { type: "TIMER_START", now: T0 }, ctx);
      expect(Object.keys(s.timer)).toEqual(["endsAt"]);
      const later = buildReducer(s, { type: "TIMER_START", now: T0 + TIMER_MS + 5 * 60_000 }, ctx);
      expect(later).toBe(s);
      expect(later.lockedTeam).toBeNull();
      expect(later.lineup).toBe(start.lineup);
      expect([later.captainId, later.viceCaptainId]).toEqual([start.captainId, start.viceCaptainId]);
    }
  });

  it("timer off in admin hides it and blocks new starts; turning it on again starts a fresh 3:00", () => {
    let app: AppState = reducer(loadedApp(), { type: "TIMER_START", now: T0 });
    expect(app.build!.timer.endsAt).toBe(T0 + TIMER_MS);
    app = reducer(app, { type: "SET_TIMER_ENABLED", enabled: false });
    expect(app.settings.timerEnabled).toBe(false);
    expect(app.build!.timer.endsAt).toBeNull();
    expect(reducer(app, { type: "TIMER_START", now: T0 + 1 })).toBe(app);
    app = reducer(app, { type: "SET_TIMER_ENABLED", enabled: true });
    expect(reducer(app, { type: "TIMER_START", now: T0 + 2 }).build!.timer.endsAt).toBe(T0 + 2 + TIMER_MS);
  });

  it("a team locked by the user in overtime locks, scores and saves exactly like one locked in time", () => {
    // Start the clock well before "now", so the lock happens in overtime.
    const overtime = reducer(readyToLock(), { type: "TIMER_START", now: T0 - TIMER_MS - 40_000 });
    expect(overtime.build!.timer.endsAt).not.toBeNull();
    const locked = reducer(overtime, { type: "LOCK" });
    const normal = lockedApp();
    expect(locked.screen).toBe("meet");
    expect(locked.build!.lockedTeam).toEqual(normal.build!.lockedTeam);
    expect(locked.build!.timer.endsAt).toBeNull(); // the clock stops at the lock

    const finish = (s: AppState) => {
      s = reducer(s, { type: "SET_GAME_ID", id: "game-1" });
      s = reducer(s, { type: "REVEAL_REQUEST" });
      const ok = checkReveal(reveal, ctx, 37);
      if (!ok.ok) throw new Error(ok.message);
      s = reducer(s, { type: "REVEAL_LOADED", attempt: 1, reveal, aiTeam: ok.aiTeam });
      const human = scoreTeam(s.build!.lockedTeam!, resultsById(reveal.results)).total;
      const outcome = { human, ai: reveal.ai.total_points };
      s = reducer(s, { type: "SIMULATION_FINISHED", outcome, finishedAt: 5000 });
      return reducer(s, { type: "SIMULATION_FINISHED", outcome, finishedAt: 6000 }); // double finish
    };
    const a = finish(locked);
    const b = finish(normal);
    expect(a.outcome).toEqual(b.outcome);
    expect(a.outcome!.human).toBe(98); // FantasyXI's own team, scored by the same engine
    expect(a.leaderboard.entries).toHaveLength(1);
    expect(a.leaderboard.entries).toEqual(b.leaderboard.entries);
  });
});
