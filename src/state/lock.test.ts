import { afterEach, describe, expect, it, vi } from "vitest";
import { validateTeam } from "../engine";
import { rawData } from "../engine/testing/fixtures";
import { reducer, type AppState } from "./machine";
import { checkReveal, fetchRevealFor } from "./reveal";
import { restoreLocked, type SavedSession } from "./session";
import { aiBuild, ctx, loadedApp, lockedApp, readyToLock, reveal } from "./testing";
import { cleanTeamName, randomTeamName, RANDOM_TEAM_NAMES } from "./teamNames";
import { manifest } from "../engine/testing/fixtures";

const gw37 = manifest().gameweeks[0]!;

describe("team name", () => {
  it("is required, trimmed and limited in length", () => {
    let s: AppState = { ...loadedApp(), screen: "name" };
    s = reducer(s, { type: "SET_TEAM_NAME", name: "   " });
    expect(reducer(s, { type: "NEXT" }).screen).toBe("name");
    s = reducer(s, { type: "SET_TEAM_NAME", name: "  The   Overfitters  " });
    const next = reducer(s, { type: "NEXT" });
    expect(next.screen).toBe("build");
    expect(next.teamName).toBe("The Overfitters");
    expect(reducer(s, { type: "SET_TEAM_NAME", name: "x".repeat(60) }).teamName).toHaveLength(24);
    expect(cleanTeamName("a".repeat(30))).toHaveLength(24);
  });

  it("the dice picks a built-in name different from the current one", () => {
    expect(RANDOM_TEAM_NAMES).toContain(randomTeamName("", () => 0.5));
    expect(randomTeamName("The Overfitters", () => 0)).not.toBe("The Overfitters");
  });
});

describe("lock and freeze", () => {
  it("locking moves to Meet FantasyXI with a legal frozen team", () => {
    const s = lockedApp();
    expect(s.screen).toBe("meet");
    expect(validateTeam(s.build!.lockedTeam!, ctx)).toEqual([]);
    expect(s.reveal.status).toBe("idle"); // nothing requested yet
  });

  it("a second LOCK (double click) changes nothing", () => {
    const s = lockedApp();
    expect(reducer(s, { type: "LOCK" })).toBe(s);
  });

  it("no action can change the locked team, its name, or reopen the editing screens", () => {
    const s = lockedApp();
    const attempts = [
      { type: "PLACE_PLAYER", slotIndex: 0, playerId: ctx.byPosition.GK[0]!.id },
      { type: "CLEAR_SLOT", slotIndex: 0 },
      { type: "SET_FORMATION", formation: "4-4-2" },
      { type: "UNDO" },
      { type: "START_OVER" },
      { type: "AUTO_FILL_BENCH" },
      { type: "MOVE_BENCH", from: 0, to: 1 },
      { type: "SET_CAPTAIN", playerId: s.build!.lockedTeam!.starting[3]! },
      { type: "TIMER_AUTOCOMPLETE" },
      { type: "SET_TEAM_NAME", name: "Sneaky" },
      { type: "GOTO", screen: "build" },
      { type: "GOTO", screen: "bench" },
      { type: "GOTO", screen: "captain" },
      { type: "GOTO", screen: "lock" },
      { type: "GOTO", screen: "name" },
    ] as const;
    for (const a of attempts) {
      const after = reducer(s, a);
      expect(after.build!.lockedTeam, a.type).toEqual(s.build!.lockedTeam);
      expect(after.build!.lineup, a.type).toBe(s.build!.lineup);
      expect(after.teamName, a.type).toBe("Test FC");
      expect(after.screen, a.type).toBe("meet");
    }
  });

  it("Next on the Lock screen doesn't skip the lock", () => {
    expect(reducer(readyToLock(), { type: "NEXT" }).screen).toBe("lock");
  });

  it("Play again clears the lock, the team and the reveal", () => {
    let s = reducer(lockedApp(), { type: "REVEAL_REQUEST" });
    s = reducer(s, { type: "RESET" });
    expect(s.build!.lockedTeam).toBeNull();
    expect(s.teamName).toBe("");
    expect(s.reveal.status).toBe("idle");
  });
});

describe("reveal loading states (spoiler guard)", () => {
  const aiTeam = () => checkReveal(reveal, ctx, 37);

  it("can't be requested before the lock", () => {
    const s = readyToLock();
    expect(reducer(s, { type: "REVEAL_REQUEST" })).toBe(s);
  });

  it("loading -> error keeps the locked team -> retry -> ready", () => {
    let s = reducer(lockedApp(), { type: "REVEAL_REQUEST" });
    expect(s.reveal).toEqual({ status: "loading", attempt: 1 });
    expect(reducer(s, { type: "REVEAL_REQUEST" })).toBe(s); // already loading
    const locked = s.build!.lockedTeam;

    s = reducer(s, { type: "REVEAL_FAILED", attempt: 1, message: "Couldn't load FantasyXI's team. reveal.json returned 500." });
    expect(s.reveal.status).toBe("error");
    expect(s.build!.lockedTeam).toBe(locked);
    expect(s.screen).toBe("meet");

    s = reducer(s, { type: "REVEAL_REQUEST" }); // Retry
    expect(s.reveal).toEqual({ status: "loading", attempt: 2 });
    // A late answer from the first attempt is ignored.
    expect(reducer(s, { type: "REVEAL_FAILED", attempt: 1, message: "old" })).toBe(s);

    const ok = aiTeam();
    if (!ok.ok) throw new Error(ok.message);
    s = reducer(s, { type: "REVEAL_LOADED", attempt: 2, reveal, aiTeam: ok.aiTeam });
    expect(s.reveal.status).toBe("ready");
    expect(s.build!.lockedTeam).toBe(locked);
  });

  it("checkReveal accepts the real data and rejects a tampered (illegal) AI team or wrong gameweek", () => {
    expect(aiTeam().ok).toBe(true);
    const tampered = structuredClone(reveal);
    tampered.ai.bench[0] = tampered.ai.starting[0]!; // duplicate player
    const bad = checkReveal(tampered, ctx, 37);
    expect(bad).toMatchObject({ ok: false });
    expect(!bad.ok && bad.message).toMatch(/^FantasyXI's team data looks wrong/);
    expect(checkReveal(reveal, ctx, 38)).toEqual({ ok: false, message: "FantasyXI's data is for gameweek 37, not 38." });
  });
});

describe("fetchRevealFor (fetch stubbed, no network)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (impl: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(impl));

  it("loads, parses and checks the real reveal.json", async () => {
    stub(async () => new Response(JSON.stringify(rawData.gw37Reveal), { status: 200 }));
    const r = await fetchRevealFor(gw37, ctx);
    expect(r.ok).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/data/gw37/reveal.json");
  });

  it("server error, network failure, broken JSON and bad data all give friendly messages (never throw)", async () => {
    stub(async () => new Response("nope", { status: 500 }));
    expect(await fetchRevealFor(gw37, ctx)).toEqual({ ok: false, message: "Couldn't load FantasyXI's team. gw37/reveal.json returned 500." });
    stub(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchRevealFor(gw37, ctx)).toEqual({ ok: false, message: "Couldn't load FantasyXI's team. Couldn't reach gw37/reveal.json." });
    stub(async () => new Response("{not json", { status: 200 }));
    expect(await fetchRevealFor(gw37, ctx)).toEqual({ ok: false, message: "Couldn't load FantasyXI's team. gw37/reveal.json is not valid JSON." });
    stub(async () => new Response(JSON.stringify({ ...rawData.gw37Reveal, ai: undefined }), { status: 200 }));
    expect(await fetchRevealFor(gw37, ctx)).toMatchObject({ ok: false, message: expect.stringMatching(/ai should be an object/) });
  });
});

describe("restoring a locked team after a refresh", () => {
  const dataVersion = manifest().data_version;
  const saved = (): SavedSession => {
    const b = aiBuild();
    return { v: 1, dataVersion, gameweek: 37, teamName: "Test FC", lineup: b.lineup, captainId: b.captainId!, viceCaptainId: b.viceCaptainId! };
  };

  it("restores a valid saved team straight to Meet, still locked", () => {
    const s = loadedApp(JSON.parse(JSON.stringify(saved())));
    expect(s.screen).toBe("meet");
    expect(s.teamName).toBe("Test FC");
    expect(validateTeam(s.build!.lockedTeam!, ctx)).toEqual([]);
    expect(reducer(s, { type: "GOTO", screen: "build" }).screen).toBe("meet");
  });

  it("ignores missing, outdated, broken or tampered saves (clean start)", () => {
    expect(restoreLocked(null, ctx, dataVersion, 37)).toBeNull();
    expect(restoreLocked("junk", ctx, dataVersion, 37)).toBeNull();
    expect(restoreLocked({ ...saved(), dataVersion: "old" }, ctx, dataVersion, 37)).toBeNull();
    expect(restoreLocked({ ...saved(), gameweek: 38 }, ctx, dataVersion, 37)).toBeNull();
    const illegal = saved();
    illegal.lineup = { ...illegal.lineup, slots: illegal.lineup.slots.map((x, i) => (i === 1 ? { ...x, playerId: illegal.lineup.slots[2]!.playerId } : x)) };
    expect(restoreLocked(illegal, ctx, dataVersion, 37)).toBeNull();
    expect(restoreLocked({ ...saved(), captainId: 99999 }, ctx, dataVersion, 37)).toBeNull();
    const fresh = loadedApp({ ...saved(), v: 2 });
    expect(fresh.screen).toBe("attract");
    expect(fresh.build!.lockedTeam).toBeNull();
  });
});
