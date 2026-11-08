/**
 * People carried per route (Phase 90, SPEC 9.5d): how many boarded at `from` for `to` over roughly the last month, for the station
 * and train panels' "carried X of Y". A count that fades by a factor e every 30 days (so it reads "a month") and is saved with the
 * game; nothing in the simulation reads it. Pure and deterministic (driven by the tick).
 */
import type { GameState } from "../state";
import { DAYS_PER_MONTH, HOURS_PER_DAY } from "../time";

export interface RouteCarried {
  value: number;
  tick: number;
}

const key = (from: number, to: number): string => `${from}>${to}`;
const fade = (state: GameState, c: RouteCarried): number =>
  c.value * Math.exp(-(state.ticks - c.tick) / HOURS_PER_DAY / DAYS_PER_MONTH);

/** People who boarded at `from` for `to` in roughly the last month. */
export function carriedLastMonth(state: GameState, from: number, to: number): number {
  const c = state.routeCarried.get(key(from, to));
  return c ? fade(state, c) : 0;
}

/** Called when people board: `lots` are the destination stops and amounts. */
export function recordCarried(
  state: GameState,
  from: number,
  lots: ReadonlyArray<{ dest: number; amount: number }>,
): void {
  for (const lot of lots) {
    const k = key(from, lot.dest);
    const old = state.routeCarried.get(k);
    state.routeCarried.set(k, {
      value: (old ? fade(state, old) : 0) + lot.amount,
      tick: state.ticks,
    });
  }
}
