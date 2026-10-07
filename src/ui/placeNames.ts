import type { GameState } from "../sim/state";
import { strings } from "./strings";

/** Nearest built station to `tile` by straight-line tile distance — used to name a place for
 * tile-anchored news (traffic jams, washouts) that don't reference a specific station. */
export function nearestStationName(state: GameState, tile: number): string {
  const width = state.map.width;
  const tx = tile % width;
  const ty = Math.floor(tile / width);
  let best: { name: string; d: number } | null = null;
  for (const s of state.stations) {
    const sx = s.tile % width;
    const sy = Math.floor(s.tile / width);
    const d = Math.hypot(sx - tx, sy - ty);
    if (!best || d < best.d) best = { name: s.name, d };
  }
  return best?.name ?? strings.fallback.place;
}
