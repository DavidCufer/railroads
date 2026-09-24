/** Where a station may be placed (SPEC §6.1: "a tile with existing track — straight or diagonal
 * through-track or a dead-end"), and its catchment tiles. */
import { directionSteps } from "../track/graph";
import type { TrackGraph } from "../track/graph";
import { inBounds, tileIndex } from "../map/grid";
import type { GameMap } from "../map/types";
import type { Station } from "./types";

/** True if `tile` carries exactly one track edge (a dead end) or exactly two edges that are
 * exactly opposite (a straight or diagonal through-run) — a junction (3+ edges) or a bend (2
 * edges not opposite) can't take a station. */
export function canPlaceStationAt(map: GameMap, graph: TrackGraph, tile: number): boolean {
  if (!inBounds(map, tile % map.width, Math.floor(tile / map.width))) return false;
  const edges = graph.edgesAt(tile);
  if (edges.length === 1) return true;
  if (edges.length !== 2) return false;
  const [e0, e1] = edges as [(typeof edges)[0], (typeof edges)[0]];
  const dir0 = e0.a === tile ? e0.direction : (e0.direction + 4) % 8;
  const dir1 = e1.a === tile ? e1.direction : (e1.direction + 4) % 8;
  return directionSteps(dir0, dir1) === 4;
}

/** The station already occupying `tile`, if any. */
export function stationAtTile(stations: readonly Station[], tile: number): Station | undefined {
  return stations.find((s) => s.tile === tile);
}

/** Square catchment around `tile` (Chebyshev radius, SPEC §6.1: "3×3"/"5×5"/"7×7"), clipped to
 * the map. */
export function stationCatchmentTiles(map: GameMap, tile: number, radius: number): number[] {
  const cx = tile % map.width;
  const cy = Math.floor(tile / map.width);
  const tiles: number[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(map, x, y)) continue;
      tiles.push(tileIndex(map, x, y));
    }
  }
  return tiles;
}
