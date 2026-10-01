/** Trains that need the player's attention (PLAN Phase 28A; the ⚠ chip of 28B reads this): stuck, broken,
 * without a route for `NO_ROUTE_FLAG_DAYS`, or waiting longer than `WAITING_FLAG_DAYS`. Pure and read-only. */
import type { GameState } from "../state";
import type { Train } from "./types";

export const NO_ROUTE_FLAG_DAYS = 30;
export const WAITING_FLAG_DAYS = 10;

export type StuckReason = "stuck" | "noRoute" | "waiting" | "broken" | "fewStops";

export function stuckReason(train: Train): StuckReason | undefined {
  if (train.orders.length < 2) return "fewStops";
  const days = train.waitTicks / 24;
  switch (train.status) {
    case "stuck":
      return "stuck";
    case "broken":
      return train.inOverhaul ? undefined : "broken"; // an overhaul is planned, not a failure
    case "noRoute":
      return days >= NO_ROUTE_FLAG_DAYS ? "noRoute" : undefined;
    case "waitingForBlock":
    case "waitingForStation":
      return days >= WAITING_FLAG_DAYS ? "waiting" : undefined;
    default:
      return undefined;
  }
}

export function stuckTrains(state: GameState): Array<{ train: Train; reason: StuckReason }> {
  const result: Array<{ train: Train; reason: StuckReason }> = [];
  for (const train of state.trains) {
    const reason = stuckReason(train);
    if (reason) result.push({ train, reason });
  }
  return result;
}
