/** Where the player's network is: the centre of the biggest cluster of stations (used to frame the camera after a load). */
import type { GameState } from "../state";

/** Stations closer than this (tiles) count as one cluster. */
export const CLUSTER_RADIUS_TILES = 15;

export function networkCentre(state: GameState): { x: number; y: number } | null {
  const width = state.map.width;
  const pts = state.stations.map((s) => ({ x: s.tile % width, y: Math.floor(s.tile / width) }));
  let best: typeof pts = [];
  for (const p of pts) {
    const near = pts.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) <= CLUSTER_RADIUS_TILES);
    if (near.length > best.length) best = near;
  }
  if (best.length === 0) return null;
  return {
    x: best.reduce((sum, p) => sum + p.x, 0) / best.length,
    y: best.reduce((sum, p) => sum + p.y, 0) / best.length,
  };
}
