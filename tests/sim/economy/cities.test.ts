import { describe, expect, it } from "vitest";
import { createRng } from "../../../src/sim/rng";
import { generateMap, type MapGenOptions } from "../../../src/sim/map/generate";
import { CITY_MIN_SPACING, CITY_TIER_DEFS } from "../../../src/data/cities";

function options(overrides: Partial<MapGenOptions> = {}): MapGenOptions {
  return { size: "medium", waterLevel: "normal", roughness: "normal", ...overrides };
}

describe("placeCities", () => {
  it("spaces every pair of cities at least CITY_MIN_SPACING tiles apart (anchor to anchor)", () => {
    for (const seed of [1, 2, 3, 42, 12345]) {
      const { cities } = generateMap(createRng(seed), options());
      for (let i = 0; i < cities.length; i++) {
        for (let j = i + 1; j < cities.length; j++) {
          const a = cities[i]!;
          const b = cities[j]!;
          const dist = Math.hypot(a.anchorX - b.anchorX, a.anchorY - b.anchorY);
          expect(dist).toBeGreaterThanOrEqual(CITY_MIN_SPACING);
        }
      }
    }
  });

  it("gives every city a unique name and id, and a footprint within its tier's max tile count", () => {
    const { map, cities } = generateMap(createRng(12345), options());
    expect(cities.length).toBeGreaterThan(0);
    const names = new Set(cities.map((c) => c.name));
    expect(names.size).toBe(cities.length);
    const ids = cities.map((c) => c.id);
    expect(ids).toEqual(cities.map((_, i) => i));
    for (const city of cities) {
      expect(city.tiles.length).toBeGreaterThan(0);
      expect(city.tiles.length).toBeLessThanOrEqual(CITY_TIER_DEFS[city.tier].maxTiles);
      expect(city.tiles).toContain(city.anchorY * map.width + city.anchorX);
    }
  });

  it("is deterministic: same seed produces identical cities", () => {
    const a = generateMap(createRng(777), options());
    const b = generateMap(createRng(777), options());
    expect(a.cities).toEqual(b.cities);
    expect(Array.from(a.map.cityId)).toEqual(Array.from(b.map.cityId));
  });

  it("marks every footprint tile with its city's id on the map", () => {
    const { map, cities } = generateMap(createRng(9), options());
    for (const city of cities) {
      for (const idx of city.tiles) {
        expect(map.cityId[idx]).toBe(city.id);
      }
    }
  });
});
