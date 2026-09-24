import { describe, expect, it } from "vitest";
import { createRng } from "../../../src/sim/rng";
import { generateMap } from "../../../src/sim/map/generate";
import { DIRS8, inBounds, tileIndex } from "../../../src/sim/map/grid";
import { terrainId } from "../../../src/sim/map/terrain";
import { LAKE_MIN_AREA, RIVER_MIN_LENGTH } from "../../../src/data/mapGen";
import type { GameMap } from "../../../src/sim/map/types";

const WATER_ID = terrainId("water");
const RIVER_ID = terrainId("river");

const MOUNTAINOUS_SEEDS = Array.from({ length: 15 }, (_, i) => i * 1000 + 1);

describe("river carving", () => {
  it("every river tile's riverNext chain reaches water within width+height steps, with no cycles", () => {
    for (const seed of MOUNTAINOUS_SEEDS) {
      const { map } = generateMap(createRng(seed), {
        size: "medium",
        waterLevel: "normal",
        roughness: "mountainous",
      });
      const maxSteps = map.width + map.height;

      for (let idx = 0; idx < map.terrain.length; idx++) {
        if ((map.terrain[idx] as number) !== RIVER_ID) continue;

        const visited = new Set<number>();
        let current = idx;
        let reachedWater = false;
        for (let step = 0; step <= maxSteps; step++) {
          expect(visited.has(current)).toBe(false); // no cycles
          visited.add(current);
          if ((map.terrain[current] as number) === WATER_ID) {
            reachedWater = true;
            break;
          }
          const next = map.riverNext[current] as number;
          expect(next).toBeGreaterThanOrEqual(0);
          current = next;
        }
        expect(reachedWater).toBe(true);
      }
    }
  });

  it("elevation (the flood-filled field used for routing) is non-increasing along every river chain", () => {
    for (const seed of MOUNTAINOUS_SEEDS.slice(0, 5)) {
      const { map, flood } = generateMap(createRng(seed), {
        size: "medium",
        waterLevel: "normal",
        roughness: "mountainous",
      });

      for (let idx = 0; idx < map.terrain.length; idx++) {
        if ((map.terrain[idx] as number) !== RIVER_ID) continue;
        const next = map.riverNext[idx] as number;
        expect(flood.filled[next] as number).toBeLessThanOrEqual(flood.filled[idx] as number);
      }
    }
  });

  it("non-river tiles have no downstream pointer", () => {
    const { map } = generateMap(createRng(5), {
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    for (let idx = 0; idx < map.terrain.length; idx++) {
      if ((map.terrain[idx] as number) !== RIVER_ID) {
        expect(map.riverNext[idx]).toBe(-1);
      }
    }
  });

  it("has no water bodies smaller than the minimum lake area, other than the sea", () => {
    for (const seed of MOUNTAINOUS_SEEDS.slice(0, 5)) {
      const { map } = generateMap(createRng(seed), {
        size: "medium",
        waterLevel: "normal",
        roughness: "mountainous",
      });
      const sizes = waterComponentSizes(map);
      if (sizes.length === 0) continue;
      sizes.sort((a, b) => b - a);
      const lakes = sizes.slice(1); // the largest component is the sea
      for (const size of lakes) {
        expect(size).toBeGreaterThanOrEqual(LAKE_MIN_AREA);
      }
    }
  });

  it("places at least 4 rivers on a Medium mountainous map, each >= the minimum length, across 15 seeds", () => {
    for (const seed of MOUNTAINOUS_SEEDS) {
      const { rivers } = generateMap(createRng(seed), {
        size: "medium",
        waterLevel: "normal",
        roughness: "mountainous",
      });
      expect(rivers.length).toBeGreaterThanOrEqual(4);
      for (const river of rivers) {
        expect(river.length).toBeGreaterThanOrEqual(RIVER_MIN_LENGTH);
      }
    }
  });
});

function waterComponentSizes(map: GameMap): number[] {
  const visited = new Uint8Array(map.width * map.height);
  const sizes: number[] = [];

  for (let start = 0; start < map.terrain.length; start++) {
    if (visited[start] === 1 || (map.terrain[start] as number) !== WATER_ID) continue;
    let size = 0;
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      size++;
      const x = idx % map.width;
      const y = Math.floor(idx / map.width);
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(map, nx, ny)) continue;
        const nIdx = tileIndex(map, nx, ny);
        if (visited[nIdx] === 1 || (map.terrain[nIdx] as number) !== WATER_ID) continue;
        visited[nIdx] = 1;
        stack.push(nIdx);
      }
    }
    sizes.push(size);
  }
  return sizes;
}
