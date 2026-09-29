import { describe, expect, it } from "vitest";
import { INDUSTRY_MIN_CITY_DISTANCE, INDUSTRY_MIN_GAP_TILES } from "../../../src/data/industries";
import { generateMap } from "../../../src/sim/map/generate";
import { getRegion, loadRegion, type RegionId } from "../../../src/sim/regions";
import { createRng } from "../../../src/sim/rng";
import type { GameMap } from "../../../src/sim/map/types";
import type { Industry } from "../../../src/sim/economy/types";

function violations(
  map: GameMap,
  industries: readonly Industry[],
  extra: readonly number[] = [],
): string[] {
  const out: string[] = [];
  const cityTiles: number[] = [...extra];
  for (let i = 0; i < map.cityId.length; i++) if (map.cityId[i] !== -1) cityTiles.push(i);
  for (const a of industries) {
    if (a.type !== "port") {
      for (const t of cityTiles) {
        const d = Math.hypot((t % map.width) - a.x, Math.floor(t / map.width) - a.y);
        if (d < INDUSTRY_MIN_CITY_DISTANCE) {
          out.push(`${a.type}@${a.x},${a.y} is ${d.toFixed(1)} from a city tile`);
          break;
        }
      }
    }
    for (const b of industries) {
      if (b.id <= a.id) continue;
      if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= INDUSTRY_MIN_GAP_TILES)
        out.push(`${a.type}@${a.x},${a.y} too close to ${b.type}@${b.x},${b.y}`);
    }
  }
  return out;
}

describe("industry spacing (Phase 24A)", () => {
  it("keeps generated industries clear of cities and each other", () => {
    for (const seed of [1, 2, 3, 7, 42, 99, 12345]) {
      for (const size of ["small", "medium"] as const) {
        const { map, industries } = generateMap(createRng(seed), {
          size,
          waterLevel: "normal",
          roughness: "normal",
        });
        expect(violations(map, industries), `seed ${seed} ${size}`).toEqual([]);
      }
    }
  });

  it("keeps region industries clear of cities and each other", () => {
    for (const id of ["central-eu", "gb", "us-east", "us-west"]) {
      const region = loadRegion(getRegion(id as RegionId));
      const extra = region.pendingCityFoundings.flatMap((p) => p.tiles);
      expect(violations(region.map, region.industries, extra), id).toEqual([]);
    }
  });
});
