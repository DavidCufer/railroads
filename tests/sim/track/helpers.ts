/** Synthetic small maps/states for track unit tests — full control over terrain, no RNG needed. */
import { terrainId, type Terrain } from "../../../src/sim/map/terrain";
import type { GameMap } from "../../../src/sim/map/types";
import type { GameState } from "../../../src/sim/state";
import { TrackGraph } from "../../../src/sim/track/graph";
import { createRng } from "../../../src/sim/rng";

/** `rows[y][x]` gives the terrain letter; `elevation[y][x]` (optional) gives 0-9, default 0.
 * Terrain letters: p=plain d=desert f=forest s=swamp h=hills m=mountain w=water r=river. */
const LETTER_TO_TERRAIN: Record<string, Terrain> = {
  p: "plain",
  d: "desert",
  f: "forest",
  s: "swamp",
  h: "hills",
  m: "mountain",
  w: "water",
  r: "river",
};

export function makeTestMap(rows: string[], elevation?: number[][]): GameMap {
  const height = rows.length;
  const width = (rows[0] as string).length;
  const terrain = new Uint8Array(width * height);
  const elevationArr = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y] as string;
    for (let x = 0; x < width; x++) {
      const letter = row[x] as string;
      const t = LETTER_TO_TERRAIN[letter];
      if (!t) throw new Error(`unknown terrain letter '${letter}' at (${x},${y})`);
      terrain[y * width + x] = terrainId(t);
      elevationArr[y * width + x] = elevation?.[y]?.[x] ?? 0;
    }
  }
  return {
    width,
    height,
    terrain,
    elevation: elevationArr,
    elevationRaw: new Float32Array(width * height),
    riverFlow: new Uint16Array(width * height),
    riverNext: new Int32Array(width * height).fill(-1),
    cityId: new Int16Array(width * height).fill(-1),
    industryId: new Int16Array(width * height).fill(-1),
  };
}

export function makeTestState(map: GameMap, overrides: Partial<GameState> = {}): GameState {
  return {
    seed: 1,
    rng: createRng(1),
    map,
    cities: [],
    industries: [],
    startYear: 1830,
    ticks: 0,
    difficulty: "normal",
    cash: 1_000_000,
    trackGraph: new TrackGraph(),
    ...overrides,
  };
}

export function tileAt(map: GameMap, x: number, y: number): number {
  return y * map.width + x;
}
