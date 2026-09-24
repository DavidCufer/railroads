import { describe, expect, it } from "vitest";
import { createRng } from "../../../src/sim/rng";
import { generateMap, type MapGenOptions } from "../../../src/sim/map/generate";
import { INDUSTRIES } from "../../../src/data/industries";
import { terrainName } from "../../../src/sim/map/terrain";

function options(overrides: Partial<MapGenOptions> = {}): MapGenOptions {
  return { size: "medium", waterLevel: "normal", roughness: "normal", ...overrides };
}

describe("placeIndustries", () => {
  it("places raw producers only on their allowed terrain", () => {
    for (const seed of [1, 2, 3, 42, 12345]) {
      const { map, industries } = generateMap(createRng(seed), options());
      for (const industry of industries) {
        const def = INDUSTRIES[industry.type];
        if (def.placement.kind !== "terrain") continue;
        const terrain = terrainName(map.terrain[industry.y * map.width + industry.x] as number);
        expect(def.placement.terrain).toContain(terrain);
      }
    }
  });

  it("never places an industry on a city tile", () => {
    const { map, industries } = generateMap(createRng(12345), options());
    for (const industry of industries) {
      const idx = industry.y * map.width + industry.x;
      expect(map.cityId[idx]).toBe(-1);
    }
  });

  it("never places an industry whose era is after the game's start year", () => {
    const startYear = 1850;
    const { industries } = generateMap(createRng(12345), options(), startYear);
    for (const industry of industries) {
      expect(INDUSTRIES[industry.type].era).toBeLessThanOrEqual(startYear);
    }
    // 1850 is before oil (1860) and refineries (1880): neither should appear.
    expect(industries.some((i) => i.type === "oilWell")).toBe(false);
    expect(industries.some((i) => i.type === "refinery")).toBe(false);
  });

  it("assigns every industry a unique id matching its index (map.industryId agrees)", () => {
    const { map, industries } = generateMap(createRng(5), options());
    const ids = industries.map((i) => i.id);
    expect(ids).toEqual(industries.map((_, i) => i));
    for (const industry of industries) {
      const idx = industry.y * map.width + industry.x;
      expect(map.industryId[idx]).toBe(industry.id);
    }
  });

  it("is deterministic: same seed produces identical industries", () => {
    const a = generateMap(createRng(777), options());
    const b = generateMap(createRng(777), options());
    expect(a.industries).toEqual(b.industries);
    expect(Array.from(a.map.industryId)).toEqual(Array.from(b.map.industryId));
  });
});
