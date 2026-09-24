import type { GameMap } from "./types";
import { tileIndex } from "./grid";

export const TERRAIN_TYPES = [
  "plain",
  "forest",
  "hills",
  "mountain",
  "desert",
  "swamp",
  "water",
  "river",
] as const;

export type Terrain = (typeof TERRAIN_TYPES)[number];

const TERRAIN_ID = Object.fromEntries(TERRAIN_TYPES.map((t, i) => [t, i])) as Record<
  Terrain,
  number
>;

export function terrainId(t: Terrain): number {
  return TERRAIN_ID[t];
}

export function terrainName(id: number): Terrain {
  const t = TERRAIN_TYPES[id];
  if (t === undefined) throw new Error(`invalid terrain id ${id}`);
  return t;
}

export function terrainAt(map: GameMap, x: number, y: number): Terrain {
  return terrainName(map.terrain[tileIndex(map, x, y)] ?? 0);
}

export function elevationAt(map: GameMap, x: number, y: number): number {
  return map.elevation[tileIndex(map, x, y)] ?? 0;
}
