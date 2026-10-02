/**
 * Who boards a train (PLAN Phase 34 item 10): waiting passengers are bound for a destination station
 * (`StationCargoPile.bound`); a train boards the people bound for any other stop of its orders, plus those with no
 * destination yet (`amount` minus what is bound). Piles without `bound` (everything else, and old saves) board anyone.
 */
import type { StationCargoPile } from "../state";
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
