/** PLAN Phase 10: goal generation (SPEC §11) — region goal sets resolve every city name against
 * the real region, and random maps get a deterministic bronze/silver/gold set from the same
 * generator, city names resolved to that game's actual `City.id`s. */
import { describe, expect, it } from "vitest";
import { REGION_GOALS } from "../../../src/data/goals";
import { REGION_IDS } from "../../../src/sim/regions/types";
import { createGameState } from "../../../src/sim/state";

describe("resolveRegionGoals (via createGameState)", () => {
  for (const regionId of REGION_IDS) {
    it(`${regionId}: every named city resolves and no goal is silently dropped`, () => {
      const state = createGameState({ seed: 1, region: regionId });
      const defs = REGION_GOALS[regionId];
      expect(state.goals.length).toBe(defs.length);

      const namesByCity = new Map(state.cities.map((c) => [c.id, c.name]));
      for (const goal of state.goals) {
        if (goal.def.type === "connect") {
          for (const id of goal.def.cityIds) expect(namesByCity.has(id)).toBe(true);
        }
        if (goal.def.type === "cityTier") {
          expect(namesByCity.has(goal.def.cityId)).toBe(true);
        }
      }
    });
  }

  it("us-east's bronze goal connects New York and Chicago", () => {
    const state = createGameState({ seed: 1, region: "us-east" });
    const bronze = state.goals.find((g) => g.tier === "bronze");
    expect(bronze?.def.type).toBe("connect");
    if (bronze?.def.type === "connect") {
      const names = bronze.def.cityIds.map((id) => state.cities[id]?.name).sort();
      expect(names).toEqual(["Chicago", "New York"]);
    }
  });
});

describe("generateRandomGoals (via createGameState)", () => {
  it("is deterministic for the same seed", () => {
    const a = createGameState({
      seed: 42,
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    const b = createGameState({
      seed: 42,
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    expect(a.goals).toEqual(b.goals);
  });

  it("produces one bronze, one silver, one gold goal, each referencing a real city where relevant", () => {
    const state = createGameState({
      seed: 7,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
    });
    const tiers = state.goals.map((g) => g.tier).sort();
    expect(tiers).toEqual(["bronze", "gold", "silver"]);

    for (const goal of state.goals) {
      if (goal.def.type === "connect") {
        for (const id of goal.def.cityIds) expect(state.cities[id]).toBeDefined();
      }
      if (goal.def.type === "cityTier") {
        expect(state.cities[goal.def.cityId]).toBeDefined();
      }
    }
  });

  it("has no goals array crash on a map with fewer than 2 cities (defensive)", () => {
    // "few" cities on a Small map can in principle be just 1-2 — the bronze connect goal is
    // simply omitted rather than referencing an id that doesn't exist.
    const state = createGameState({
      seed: 99,
      size: "small",
      waterLevel: "high",
      roughness: "mountainous",
      cityCount: "few",
    });
    for (const goal of state.goals) {
      if (goal.def.type === "connect") {
        for (const id of goal.def.cityIds) expect(state.cities[id]).toBeDefined();
      }
    }
  });
});
