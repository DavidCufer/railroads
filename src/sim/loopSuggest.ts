/**
 * Where a passing loop would help a single-track jam (Phase 41, PLAYTEST-4 BAL4): the legal spot nearest the jam along
 * the route of a train caught in it. Pure.
 */
import { computePassingLoopPlan } from "./commands";
import type { GameState } from "./state";

export interface LoopSuggestion {
  tile: number;
  /** Cash price of the loop, land included. */
  cost: number;
}

const SEARCH_TILES = 12;

export function suggestPassingLoop(state: GameState, jamTile: number): LoopSuggestion | undefined {
  const spots: number[] = [jamTile];
  for (const train of state.trains) {
    const at = train.route.indexOf(jamTile);
    if (at < 0) continue;
    for (let d = 1; d <= SEARCH_TILES; d++) {
      for (const i of [at - d, at + d]) {
        const tile = train.route[i];
        if (tile !== undefined) spots.push(tile);
      }
    }
    break;
  }
  for (const tile of spots) {
    const plan = computePassingLoopPlan(state, tile);
    if (plan.valid) return { tile, cost: plan.cost };
  }
  return undefined;
}
