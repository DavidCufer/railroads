import { describe, expect, it } from "vitest";
import { LOCOMOTIVES, locomotiveById } from "../../src/data/trains";
import { bestOf } from "../../src/ui/locoStats";
import { LOADING_RULES, nextRule } from "../../src/ui/routeTimeline";
import { suggestConsists } from "../../src/ui/consistBuilder";
import { strings } from "../../src/ui/strings";
import type { StationEconomy } from "../../src/sim/stations/economy";

describe("route timeline helpers", () => {
  it("cycles through every loading rule and wraps", () => {
    let rule = LOADING_RULES[0]!;
    const seen = new Set<string>();
    for (let i = 0; i < LOADING_RULES.length; i++) {
      seen.add(rule);
      rule = nextRule(rule);
    }
    expect(seen.size).toBe(LOADING_RULES.length);
    expect(rule).toBe(LOADING_RULES[0]);
  });
});

describe("engine stat helpers", () => {
  it("bestOf returns the per-stat maxima", () => {
    const best = bestOf(LOCOMOTIVES);
    expect(best.maxSpeedKmh).toBe(Math.max(...LOCOMOTIVES.map((l) => l.maxSpeedKmh)));
    expect(best.maxCars).toBe(Math.max(...LOCOMOTIVES.map((l) => l.maxCars)));
  });
});

describe("suggested consists", () => {
  const economy = (supply: StationEconomy["supply"]): StationEconomy => ({
    supply,
    acceptPoints: {},
    accepts: [],
  });

  it("suggests passengers + mail for a people station and freight for an industry", () => {
    const loco = locomotiveById("american-4-4-0")!;
    const out = suggestConsists(economy({ passengers: 12, coal: 30 }), loco, 1900);
    expect(out.length).toBe(2);
    expect(out[0]!.cars.every((c) => c === "passengers" || c === "mail")).toBe(true);
    expect(out[0]!.cars).toContain("mail");
    expect(out[1]!.cars.every((c) => c === "coal")).toBe(true);
    expect(out.every((s) => s.cars.length <= loco.maxCars)).toBe(true);
  });

  it("never suggests freight cars for a passenger-only trainset", () => {
    const loco = locomotiveById("high-speed-trainset")!;
    const out = suggestConsists(economy({ passengers: 5, coal: 50 }), loco, 1990);
    for (const s of out) {
      expect(s.cars.every((c) => c === "passengers" || c === "mail")).toBe(true);
    }
  });

  it("is empty when nothing is supplied", () => {
    expect(suggestConsists(economy({}), locomotiveById("american-4-4-0")!, 1900)).toEqual([]);
  });
});

describe("roster notes", () => {
  it("every locomotive has a short original note", () => {
    for (const l of LOCOMOTIVES) {
      const note = strings.locoNotes[l.id];
      expect(note, l.id).toBeTruthy();
      expect(note!.length).toBeGreaterThan(30);
      expect(note!.length).toBeLessThan(220);
    }
  });
});
