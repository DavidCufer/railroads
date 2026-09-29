/** PLAN Phase 18 D: every processor has its inputs within reach, on random and region maps. */
import { WORLD_SCALE } from "../../../src/data/scale";
import { describe, expect, it } from "vitest";
import {
  CHAIN_MAX_DISTANCE_TILES,
  INDUSTRIES,
  INDUSTRY_NUDGE_MAX_RADIUS,
  inputGroups,
} from "../../../src/data/industries";
import { chainIsComplete, hasGoodsChainNearCity, nearestOf } from "../../../src/sim/economy/chains";
import type { City, Industry } from "../../../src/sim/economy/types";
import { generateMap, type MapGenOptions } from "../../../src/sim/map/generate";
import { REGION_IDS, getRegion } from "../../../src/sim/regions";
import { loadRegion } from "../../../src/sim/regions/load";
import { createRng } from "../../../src/sim/rng";

function processors(industries: readonly Industry[]): Industry[] {
  return industries.filter((i) => inputGroups(i.type).length > 0);
}

function expectAllFed(industries: readonly Industry[], startYear: number, label: string): void {
  for (const p of processors(industries)) {
    for (const group of inputGroups(p.type)) {
      const alts = group.filter((t) => INDUSTRIES[t].era <= startYear);
      if (alts.length === 0) continue;
      const near = nearestOf(industries, alts, p);
      expect(
        near && near.distance <= CHAIN_MAX_DISTANCE_TILES,
        `${label}: ${p.type} at ${p.x},${p.y} has no ${alts.join("/")} within ${CHAIN_MAX_DISTANCE_TILES}`,
      ).toBe(true);
    }
    expect(chainIsComplete(industries, p, startYear), `${label}: ${p.type} chain`).toBe(true);
  }
}

describe("industry chains", () => {
  const sizes: MapGenOptions["size"][] = ["small", "medium"];
  for (const seed of [1, 2, 3, 7, 42, 99, 123, 2024]) {
    it(`random map seed ${seed}: every processor has its inputs in range and a Factory exists`, () => {
      for (const size of sizes) {
        const result = generateMap(createRng(seed), {
          size,
          waterLevel: "normal",
          roughness: "normal",
        });
        const startYear = 1830;
        expectAllFed(result.industries, startYear, `seed ${seed} ${size}`);
        expect(result.industries.some((i) => i.type === "factory")).toBe(true);
        expect(hasGoodsChainNearCity(result.industries, result.cities as City[], startYear)).toBe(
          true,
        );
        // ids are list indices and the map grid agrees.
        result.industries.forEach((i, idx) => {
          expect(i.id).toBe(idx);
          expect(result.map.industryId[i.y * result.map.width + i.x]).toBe(idx);
        });
      }
    });
  }

  it("is deterministic per seed", () => {
    const a = generateMap(createRng(5), {
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    const b = generateMap(createRng(5), {
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    expect(a.industries).toEqual(b.industries);
  });

  for (const id of REGION_IDS) {
    it(`region ${id}: keeps hand-placed industries and every processor is fed`, () => {
      const json = getRegion(id);
      const loaded = loadRegion(json);
      // Hand-placed industries keep their id and type and sit within a few tiles of their
      // (×WORLD_SCALE) source position (the loader nudges them onto a free, valid tile, and the spacing pass further out of towns).
      for (const src of json.industries) {
        const got = loaded.industries.find((i) => i.id === src.id);
        expect(got?.type).toBe(src.type);
        const d = Math.hypot(
          (got?.x ?? 1e9) - (src.x * WORLD_SCALE + (WORLD_SCALE - 1) / 2),
          (got?.y ?? 1e9) - (src.y * WORLD_SCALE + (WORLD_SCALE - 1) / 2),
        );
        expect(d, `${id}: ${src.type} ${src.id} moved ${d}`).toBeLessThanOrEqual(
          8 + INDUSTRY_NUDGE_MAX_RADIUS,
        );
      }
      expectAllFed(loaded.industries, json.startYear, id);
    });
  }
});
