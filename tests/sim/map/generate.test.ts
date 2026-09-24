import { describe, expect, it } from "vitest";
import { createRng } from "../../../src/sim/rng";
import { generateMap, type MapGenOptions } from "../../../src/sim/map/generate";
import { TERRAIN_TYPES, terrainName } from "../../../src/sim/map/terrain";
import { WATER_LEVEL_LAND_FRACTION, type WaterLevel } from "../../../src/data/mapGen";

function options(overrides: Partial<MapGenOptions> = {}): MapGenOptions {
  return { size: "small", waterLevel: "normal", roughness: "normal", ...overrides };
}

describe("generateMap", () => {
  it("is deterministic: same seed produces identical terrain and elevation arrays", () => {
    const a = generateMap(createRng(12345), options());
    const b = generateMap(createRng(12345), options());
    expect(Array.from(a.terrain)).toEqual(Array.from(b.terrain));
    expect(Array.from(a.elevation)).toEqual(Array.from(b.elevation));
    expect(Array.from(a.riverFlow)).toEqual(Array.from(b.riverFlow));
  });

  it("produces a different map for a different seed", () => {
    const a = generateMap(createRng(1), options());
    const b = generateMap(createRng(2), options());
    expect(Array.from(a.elevation)).not.toEqual(Array.from(b.elevation));
  });

  it("hits the target land fraction within +/-5% for each water level", () => {
    const levels: WaterLevel[] = ["low", "normal", "high"];
    for (const waterLevel of levels) {
      const map = generateMap(createRng(42), options({ waterLevel, size: "medium" }));
      let landTiles = 0;
      for (let i = 0; i < map.terrain.length; i++) {
        if (terrainName(map.terrain[i] as number) !== "water") landTiles++;
      }
      const fraction = landTiles / map.terrain.length;
      const target = WATER_LEVEL_LAND_FRACTION[waterLevel];
      expect(fraction).toBeGreaterThanOrEqual(target - 0.05);
      expect(fraction).toBeLessThanOrEqual(target + 0.05);
    }
  });

  it("never produces NaN or out-of-range elevations", () => {
    const map = generateMap(createRng(777), options({ roughness: "mountainous", size: "large" }));
    for (let i = 0; i < map.elevation.length; i++) {
      const e = map.elevation[i] as number;
      expect(Number.isFinite(e)).toBe(true);
      expect(Number.isInteger(e)).toBe(true);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(9);
    }
  });

  it("only produces valid terrain ids", () => {
    const map = generateMap(createRng(9), options());
    for (let i = 0; i < map.terrain.length; i++) {
      expect(TERRAIN_TYPES[map.terrain[i] as number]).toBeDefined();
    }
  });
});
