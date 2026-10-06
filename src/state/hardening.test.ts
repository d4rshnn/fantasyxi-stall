import { describe, expect, it } from "vitest";
import { nextFocusIndex } from "../components/useFocusTrap";
import { initialState, reducer, type AppState } from "./machine";
import { manifest } from "../engine/testing/fixtures";
import { cleanTeamName, limitChars } from "./teamNames";
import { aiBuild, loadedApp, pregame } from "./testing";

describe("odd team names", () => {
  it("limits by characters, never splitting an emoji", () => {
    const name = "⚽".repeat(30);
    expect(Array.from(limitChars(name, 24))).toHaveLength(24);
    expect(limitChars(name, 24)).not.toMatch(/[\uD800-\uDBFF]$/); // no half emoji at the end
    expect(cleanTeamName("  Ødegaard's   Élan 🎉  ")).toBe("Ødegaard's Élan 🎉");
    expect(cleanTeamName("x".repeat(24))).toHaveLength(24);
    expect(cleanTeamName("     ")).toBe("");
  });

  it("only spaces can't continue; emoji names can", () => {
    let s: AppState = { ...loadedApp(), screen: "name" };
    s = reducer(s, { type: "SET_TEAM_NAME", name: "    " });
    expect(reducer(s, { type: "NEXT" }).screen).toBe("name");
    s = reducer(s, { type: "SET_TEAM_NAME", name: "🔥🔥 Fire FC 🔥🔥" });
    const next = reducer(s, { type: "NEXT" });
    expect(next.screen).toBe("build");
    expect(next.teamName).toBe("🔥🔥 Fire FC 🔥🔥");
  });
});

describe("keyboard focus stays inside dialogs", () => {
  it("Tab wraps from last to first, Shift+Tab from first to last", () => {
    expect(nextFocusIndex(2, 3, false)).toBe(0);
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(-1, 3, false)).toBe(0); // focus was outside: go to the first control
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
    expect(nextFocusIndex(0, 0, false)).toBe(-1);
  });
});

describe("opening #/admin directly with a locked game saved", () => {
  it("stays in admin, and closing admin returns to the restored game", () => {
    const b = aiBuild();
    const m = manifest();
    const saved = { v: 1, dataVersion: m.data_version, gameweek: 37, teamName: "Saved FC", lineup: b.lineup, captainId: b.captainId, viceCaptainId: b.viceCaptainId };
    const adminFirst = reducer(initialState, { type: "OPEN_ADMIN" }); // the #/admin hash is read before the data loads
    const s = reducer(adminFirst, { type: "DATA_LOADED", data: { manifest: m, gameweek: m.gameweeks[0]!, pregame }, saved });
    expect(s.screen).toBe("admin");
    expect(s.build!.lockedTeam).not.toBeNull();
    expect(reducer(s, { type: "CLOSE_ADMIN" }).screen).toBe("meet");
  });
});

describe("address bar / unknown hashes", () => {
  it("closing admin when it isn't open, or opening it twice, changes nothing", () => {
    const s = loadedApp();
    expect(reducer(s, { type: "CLOSE_ADMIN" })).toBe(s);
    const open = reducer(s, { type: "OPEN_ADMIN" });
    expect(reducer(open, { type: "OPEN_ADMIN" })).toBe(open);
    expect(reducer(open, { type: "CLOSE_ADMIN" }).screen).toBe("attract");
  });
});
