import { describe, expect, it } from "vitest";
import { priorityFloodFill } from "../../../src/sim/map/flood";
import { terrainId } from "../../../src/sim/map/terrain";
import { tileIndex } from "../../../src/sim/map/grid";
import type { GameMap } from "../../../src/sim/map/types";

const WATER_ID = terrainId("water");
const LAND_ID = terrainId("plain");

/** 5x5 grid: a water ring around a 3x3 land square with an enclosed pit at its center. */
function buildPitMap(): GameMap {
  const width = 5;
  const height = 5;
  const map: GameMap = {
    width,
    height,
    terrain: new Uint8Array(width * height).fill(LAND_ID),
    elevation: new Uint8Array(width * height),
    elevationRaw: new Float32Array(width * height).fill(0.5),
    riverFlow: new Uint16Array(width * height),
    riverNext: new Int32Array(width * height).fill(-1),
    cityId: new Int16Array(width * height).fill(-1),
    industryId: new Int16Array(width * height).fill(-1),
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        const idx = tileIndex(map, x, y);
        map.terrain[idx] = WATER_ID;
        map.elevationRaw[idx] = 0;
      }
    }
  }
  const pit = tileIndex(map, 2, 2);
  map.elevationRaw[pit] = -1; // a depression fully enclosed by higher land
  return map;
}

describe("priorityFloodFill", () => {
  it("raises an enclosed pit's filled elevation above its surroundings", () => {
    const map = buildPitMap();
    const pit = tileIndex(map, 2, 2);
    const ringLand = tileIndex(map, 2, 1); // adjacent land tile between pit and water ring

    const { filled } = priorityFloodFill(map);

    expect(filled[pit] as number).toBeGreaterThan(map.elevationRaw[pit] as number);
    expect(filled[pit] as number).toBeGreaterThanOrEqual(filled[ringLand] as number);
  });

  it("every tile's parent chain reaches a water tile with no cycles", () => {
    const map = buildPitMap();
    const { parent } = priorityFloodFill(map);

    for (let idx = 0; idx < map.terrain.length; idx++) {
      const visited = new Set<number>();
      let current = idx;
      let reachedWater = false;
      for (let step = 0; step <= map.width * map.height; step++) {
        expect(visited.has(current)).toBe(false);
        visited.add(current);
        if ((map.terrain[current] as number) === WATER_ID) {
          reachedWater = true;
          break;
        }
        const p = parent[current] as number;
        expect(p).toBeGreaterThanOrEqual(0);
        current = p;
      }
      expect(reachedWater).toBe(true);
    }
  });

  it("filled elevation strictly decreases from any tile to its parent", () => {
    const map = buildPitMap();
    const { filled, parent } = priorityFloodFill(map);

    for (let idx = 0; idx < map.terrain.length; idx++) {
      if ((map.terrain[idx] as number) === WATER_ID) continue;
      const p = parent[idx] as number;
      expect(filled[p] as number).toBeLessThan(filled[idx] as number);
    }
  });
});
