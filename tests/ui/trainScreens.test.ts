import { describe, expect, it } from "vitest";
import { LOCOMOTIVES, buyableLocomotivesIn } from "../../src/data/trains";
import { groupCars, rosterOrder, statBars, suggestConsists } from "../../src/ui/train/locoStats";
import { strings } from "../../src/ui/strings";

describe("statBars", () => {
  it("scales against the best of the pool and clamps to 0..1", () => {
    const pool = buyableLocomotivesIn(1950);
    for (const l of pool) {
      const b = statBars(l, pool);
      for (const v of Object.values(b)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    const fastest = pool.reduce((a, b) => (b.maxSpeedKmh > a.maxSpeedKmh ? b : a));
    expect(statBars(fastest, pool).speed).toBe(1);
  });
});

describe("suggestConsists", () => {
  it("suggests passengers + mail for a passenger station and freight sized to supply", () => {
    const s = suggestConsists(
      { passengers: 80, mail: 30, coal: 100 },
      ["passengers", "mail", "coal"],
      8,
    );
    expect(s[0]?.cars).toEqual(["passengers", "passengers", "mail"]);
    const coal = s.find((x) => x.id === "coal");
    expect(coal?.cars.every((c) => c === "coal")).toBe(true);
    expect(coal?.cars.length).toBe(5);
  });
  it("respects max cars and allowed cargo, and falls back to a passenger train", () => {
    expect(suggestConsists({ coal: 500 }, ["coal"], 3)[0]?.cars).toHaveLength(3);
    expect(suggestConsists({}, ["passengers", "mail"], 6)[0]?.cars).toContain("passengers");
    expect(
      suggestConsists({ coal: 50 }, ["passengers"], 6).every((x) => !x.cars.includes("coal")),
    ).toBe(true);
  });
});

describe("groupCars / rosterOrder / notes", () => {
  it("groups by first appearance", () => {
    expect(groupCars(["coal", "mail", "coal"])).toEqual([
      { cargo: "coal", count: 2 },
      { cargo: "mail", count: 1 },
    ]);
  });
  it("orders the roster by intro year", () => {
    const years = rosterOrder(LOCOMOTIVES).map((l) => l.introYear);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });
  it("has a short note for every locomotive", () => {
    for (const l of LOCOMOTIVES) {
      const note = strings.rosterNotes[l.id];
      expect(note, l.id).toBeTruthy();
      expect((note as string).length).toBeLessThan(200);
    }
  });
});
