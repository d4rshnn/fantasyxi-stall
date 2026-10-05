import { describe, expect, it } from "vitest";
import { initials, searchKey, shortName, tinyName } from "./names";
import { realGameweek } from "../engine/testing/fixtures";

describe("shortName", () => {
  it("keeps short names and shortens long ones to initial + surname", () => {
    expect(shortName("Bukayo Saka")).toBe("Bukayo Saka");
    expect(shortName("Bruno Borges Fernandes")).toBe("B. Fernandes");
    expect(shortName("Gabriel dos Santos Magalhães")).toBe("G. Magalhães");
    expect(shortName("Igor Jesus Maciel da Cruz")).toBe("I. da Cruz");
    expect(shortName("Virgil van Dijk", 12)).toBe("V. van Dijk");
  });

  it("never makes a real GW37 name longer, and never returns an empty string", () => {
    for (const p of realGameweek(37).pregame.players) {
      const s = shortName(p.name, 14);
      expect(s.length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(p.name.length);
    }
  });
});

describe("tinyName (phone pitch cards)", () => {
  it("uses the surname for longer names", () => {
    expect(tinyName("Mohamed Salah")).toBe("Salah");
    expect(tinyName("Virgil van Dijk")).toBe("van Dijk");
    expect(tinyName("Rodri")).toBe("Rodri");
    expect(tinyName("Son Heung-min")).toBe("Heung-min");
  });
});

describe("initials and search", () => {
  it("initials skip particles", () => {
    expect(initials("Virgil van Dijk")).toBe("VD");
    expect(initials("Rodri")).toBe("R");
  });

  it("search ignores accents and special letters", () => {
    expect(searchKey("Martin Ødegaard")).toContain("odegaard");
    expect(searchKey("Ferdi Kadıoğlu")).toContain("kadioglu");
    expect(searchKey("Viktor Gyökeres")).toContain("gyokeres");
  });
});
