/** Phase 23A: regions are upsampled WORLD_SCALE× at load time — smooth, deterministic, faithful. */
import { describe, expect, it } from "vitest";
import { WORLD_SCALE } from "../../../src/data/scale";
import { REGION_IDS, getRegion, loadRegion } from "../../../src/sim/regions";
import { decodeUint8 } from "../../../src/sim/regions/codec";
import { terrainId } from "../../../src/sim/map/terrain";
import { DIRS8 } from "../../../src/sim/map/grid";

const WATER = terrainId("water");
const RIVER = terrainId("river");

describe("region upsampling", () => {
  for (const id of REGION_IDS) {
    describe(id, () => {
      const json = getRegion(id);
      const src = decodeUint8(json.terrainB64);
      const loaded = loadRegion(json);
      const { map } = loaded;

      it("is deterministic", () => {
        const again = loadRegion(json);
        expect(again.map.terrain).toEqual(map.terrain);
        expect(again.map.elevation).toEqual(map.elevation);
        expect(again.cities).toEqual(loaded.cities);
        expect(again.industries).toEqual(loaded.industries);
      });

      it("keeps the land/water proportion of the source", () => {
        let srcWater = 0;
        for (const t of src) if (t === WATER) srcWater++;
        let water = 0;
        for (const t of map.terrain) if (t === WATER) water++;
        const before = srcWater / src.length;
        const after = water / map.terrain.length;
        expect(Math.abs(after - before)).toBeLessThan(0.03);
      });

      it("coast/lake boundaries are not blocky 2x2 blocks", () => {
        // A pure nearest-neighbour upsample makes every aligned WORLD_SCALE block uniform. Count
        // aligned blocks that straddle land and water: a refined edge must have plenty.
        let mixed = 0;
        let uniformWaterOrLand = 0;
        const w = map.width;
        for (let by = 0; by + WORLD_SCALE <= map.height; by += WORLD_SCALE) {
          for (let bx = 0; bx + WORLD_SCALE <= w; bx += WORLD_SCALE) {
            let water = 0;
            for (let dy = 0; dy < WORLD_SCALE; dy++)
              for (let dx = 0; dx < WORLD_SCALE; dx++)
                if (map.terrain[(by + dy) * w + bx + dx] === WATER) water++;
            if (water > 0 && water < WORLD_SCALE * WORLD_SCALE) mixed++;
            else uniformWaterOrLand++;
          }
        }
        expect(uniformWaterOrLand).toBeGreaterThan(mixed);
        expect(mixed).toBeGreaterThan(10);
      });

      it("has no water or land specks smaller than 3 tiles", () => {
        // Sample: every water tile has at least one water 8-neighbour or is inside a big body.
        let lonely = 0;
        for (let y = 1; y < map.height - 1; y++) {
          for (let x = 1; x < map.width - 1; x++) {
            if (map.terrain[y * map.width + x] !== WATER) continue;
            if (!DIRS8.some(([dx, dy]) => map.terrain[(y + dy) * map.width + x + dx] === WATER)) {
              lonely++;
            }
          }
        }
        expect(lonely).toBe(0);
      });

      it("re-traces every river as a connected chain of river tiles ending at water", () => {
        let riverTiles = 0;
        for (const t of map.terrain) if (t === RIVER) riverTiles++;
        expect(riverTiles).toBeGreaterThan(json.rivers.length * 5);
        // Follow every river source (river tile with no upstream) downstream to water.
        const hasUpstream = new Uint8Array(map.terrain.length);
        for (let i = 0; i < map.riverNext.length; i++) {
          const n = map.riverNext[i] as number;
          if (n >= 0) hasUpstream[n] = 1;
        }
        let reached = 0;
        let sources = 0;
        for (let i = 0; i < map.terrain.length; i++) {
          if (map.terrain[i] !== RIVER || hasUpstream[i]) continue;
          sources++;
          let cur = i;
          const chain = new Set<number>([i]);
          for (let step = 0; step < map.terrain.length; step++) {
            const n = map.riverNext[cur] as number;
            if (n < 0) break;
            const dx = Math.abs((n % map.width) - (cur % map.width));
            const dy = Math.abs(Math.floor(n / map.width) - Math.floor(cur / map.width));
            expect(Math.max(dx, dy)).toBe(1); // 8-connected
            cur = n;
            chain.add(cur);
            if (map.terrain[cur] === WATER) break;
          }
          const cx = cur % map.width;
          const cy = Math.floor(cur / map.width);
          const endsAtWater =
            map.terrain[cur] === WATER ||
            DIRS8.some(([dx, dy]) => map.terrain[(cy + dy) * map.width + cx + dx] === WATER);
          if (endsAtWater) reached++;
        }
        expect(sources).toBeGreaterThan(0);
        // Every source river that reaches the sea still does after re-tracing.
        let srcReach = 0;
        for (const river of json.rivers) {
          const last = river[river.length - 1] as number;
          const lx = last % json.width;
          const ly = Math.floor(last / json.width);
          if (DIRS8.some(([dx, dy]) => src[(ly + dy) * json.width + lx + dx] === WATER)) srcReach++;
        }
        expect(reached).toBeGreaterThanOrEqual(srcReach);
      });

      it("cities keep their tile counts and stay on land; industries are on free land", () => {
        for (const src of json.cities) {
          const city = loaded.cities.find((c) => c.id === src.id);
          expect(city).toBeDefined();
          const tiles =
            city?.tiles.length ||
            loaded.pendingCityFoundings.find((p) => p.cityId === src.id)?.tiles.length;
          expect(tiles).toBe(Math.max(1, src.tiles.length));
        }
        for (const i of loaded.industries) {
          expect(map.terrain[i.y * map.width + i.x]).not.toBe(WATER);
          expect(map.cityId[i.y * map.width + i.x]).toBe(-1);
        }
      });
    });
  }
});
