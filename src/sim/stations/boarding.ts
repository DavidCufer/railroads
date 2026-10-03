/**
 * Who boards a train (PLAN Phase 34 item 10): waiting passengers are bound for a destination station
 * (`StationCargoPile.bound`); a train boards the people bound for any other stop of its orders, plus those with no
 * destination yet (`amount` minus what is bound). Piles without `bound` (everything else, and old saves) board anyone.
 */
import type { GameState, StationCargoPile } from "../state";
import { shortestFirstLegs } from "./passengerFlows";
import type { Train } from "../trains/types";

function boundSum(entry: StationCargoPile): number {
  let sum = 0;
  for (const v of Object.values(entry.bound ?? {})) sum += v;
  return sum;
}

function eligibleBound(entry: StationCargoPile, train: Train, stationId: number): number {
  if (!entry.bound) return 0;
  let sum = 0;
  const seen = new Set<number>();
  for (const order of train.orders) {
    if (order.stationId === stationId || seen.has(order.stationId)) continue;
    seen.add(order.stationId);
    sum += entry.bound[order.stationId] ?? 0;
  }
  return sum;
}

/** People in `entry` who would board `train` at `stationId`. */
export function boardable(entry: StationCargoPile, train: Train, stationId: number): number {
  if (!entry.bound) return entry.amount;
  const unbound = Math.max(0, entry.amount - boundSum(entry));
  return Math.min(entry.amount, unbound + eligibleBound(entry, train, stationId));
}

/** Removes `amount` (at most `boardable`) from `entry`: people bound for the train's stops first, then unassigned. */
export function takeBoarders(
  entry: StationCargoPile,
  train: Train,
  stationId: number,
  amount: number,
): void {
  if (entry.bound) {
    const eligible = eligibleBound(entry, train, stationId);
    const fromBound = Math.min(amount, eligible);
    if (fromBound > 0) {
      const ratio = fromBound / eligible;
      const seen = new Set<number>();
      for (const order of train.orders) {
        if (order.stationId === stationId || seen.has(order.stationId)) continue;
        seen.add(order.stationId);
        const v = entry.bound[order.stationId] ?? 0;
        entry.bound[order.stationId] = v - v * ratio;
      }
    }
  }
  entry.amount -= amount;
  if (entry.amount < 1e-9) {
    entry.amount = 0;
    delete entry.bound;
  }
}

/** Migration (Phase 35 item 7): Phase 34 saved waiting passengers by *destination* station; they are now stored by
 * first leg (the next station on the shortest route there). Re-buckets every passenger pile; people bound for a
 * station no train network reaches any more become unassigned (they board any train, or give up as usual). Applying
 * it to a pile that is already stored by first leg changes nothing. */
export function rebucketPassengerPiles(
  state: Pick<GameState, "stations" | "stationCargo" | "map">,
  links: ReadonlyMap<number, ReadonlySet<number>>,
): void {
  const tileOf = new Map(state.stations.map((s) => [s.id, s.tile]));
  for (const [stationId, pile] of state.stationCargo) {
    const entry = pile.passengers;
    if (!entry?.bound) continue;
    const reach = shortestFirstLegs(stationId, links, tileOf, state.map.width);
    const rebound: Record<number, number> = {};
    for (const [key, amount] of Object.entries(entry.bound)) {
      const firstLeg = reach.get(Number(key))?.firstLeg;
      if (firstLeg !== undefined) rebound[firstLeg] = (rebound[firstLeg] ?? 0) + amount;
    }
    entry.bound = rebound;
  }
}
