import { describe, expect, it } from "vitest";
import { createRng } from "../../../src/sim/rng";
import { generateMap } from "../../../src/sim/map/generate";
import { DIRS8, inBounds, tileIndex } from "../../../src/sim/map/grid";
import { terrainName } from "../../../src/sim/map/terrain";
import type { GameMap } from "../../../src/sim/map/types";

/** Every 8-connected component of river tiles must touch a water tile somewhere. */
function everyRiverComponentTouchesWater(map: GameMap): boolean {
  const visited = new Uint8Array(map.width * map.height);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const startIdx = tileIndex(map, x, y);
      if (visited[startIdx] === 1) continue;
      if (terrainName(map.terrain[startIdx] as number) !== "river") continue;

      const stack: Array<[number, number]> = [[x, y]];
      visited[startIdx] = 1;
      let touchesWater = false;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop() as [number, number];
        for (const [dx, dy] of DIRS8) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inBounds(map, nx, ny)) continue;
          const nIdx = tileIndex(map, nx, ny);
          const nTerrain = terrainName(map.terrain[nIdx] as number);
          if (nTerrain === "water") {
            touchesWater = true;
          } else if (nTerrain === "river" && visited[nIdx] !== 1) {
            visited[nIdx] = 1;
            stack.push([nx, ny]);
          }
        }
      }

      if (!touchesWater) return false;
    }
  }
  return true;
}

describe("river carving", () => {
  it("every river reaches water or a lake, across many seeds", () => {
    for (let seed = 0; seed < 15; seed++) {
      const map = generateMap(createRng(seed * 1000 + 1), {
        size: "medium",
        waterLevel: "normal",
        roughness: "mountainous",
      });
      expect(everyRiverComponentTouchesWater(map)).toBe(true);
    }
  });

  it("produces some river tiles on a mountainous map (sanity check)", () => {
    const map = generateMap(createRng(12345), {
      size: "medium",
      waterLevel: "normal",
      roughness: "mountainous",
    });
    let riverTiles = 0;
    for (let i = 0; i < map.terrain.length; i++) {
      if (terrainName(map.terrain[i] as number) === "river") riverTiles++;
    }
    expect(riverTiles).toBeGreaterThan(0);
  });
});
