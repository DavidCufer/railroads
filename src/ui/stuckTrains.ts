/**
 * Stuck-train indicator (Phase 28B, PLAYTEST-1 Bug "no trains waiting indicator"): which trains the
 * player should look at. Read-only over `GameState`; unknown statuses (a later sim phase may add some)
 * are never flagged unless they carry a long wait.
 */
import type { GameState } from "../sim/state";
import type { Train } from "../sim/trains/types";
import { HOURS_PER_DAY } from "../sim/time";

/** A waiting train counts as stuck after this many days. */
export const STUCK_WAIT_DAYS = 10;

const ALWAYS_FLAGGED = new Set<string>(["noRoute", "stuck", "broken"]);
const WAITING = new Set<string>(["waitingForBlock", "waitingForStation"]);

export function isTrainStuck(train: Train): boolean {
  const status: string = train.status;
  if (ALWAYS_FLAGGED.has(status)) return true;
  return WAITING.has(status) && train.waitTicks > STUCK_WAIT_DAYS * HOURS_PER_DAY;
}

export function stuckTrains(state: GameState): Train[] {
  return state.trains.filter(isTrainStuck);
}

/** The train after `currentId` in `list` (wraps); the first one when `currentId` is absent. */
export function nextStuck(list: readonly Train[], currentId: number | null): Train | null {
  if (list.length === 0) return null;
  const i = list.findIndex((t) => t.id === currentId);
  return list[(i + 1) % list.length] as Train;
}
