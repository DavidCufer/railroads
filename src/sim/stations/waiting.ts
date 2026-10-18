/** Phase 51/54: people wait only for the next train (SPEC §9.5e-5). Pure.
 *
 * A station's one pile holds the people who arrive between two trains: it fills from the last departure up to
 * `MAX_WAIT_DAYS` of demand. Service rates (departures a day per station and next stop) are the estimate behind the
 * station panel's "next train" until a gap has been observed. */
import { MAX_WAIT_DAYS } from "../../data/economy";
import type { GameState } from "../state";
import { estimateRoundTripDays } from "../trains/headway";
import { DAYS_PER_MONTH, HOURS_PER_DAY } from "../time";

/** Departures a day, per (station, first leg), of passenger trains that call at both. Key `${station}>${firstLeg}`. */
export type ServiceRates = Map<string, number>;

export const serviceKey = (stationId: number, firstLeg: number): string =>
  `${stationId}>${firstLeg}`;

/** A train that calls at a station and at its first leg carries the people bound that way; it leaves the station once
 * per visit in its orders every round trip. Trains with the same line add their frequencies (RT / n trains = interval). */
export function serviceRates(state: GameState): ServiceRates {
  const rates: ServiceRates = new Map();
  for (const train of state.trains) {
    if (!train.cars.some((c) => c.cargoType === "passengers") || train.orders.length < 2) continue;
    const roundTrip = Math.max(1, estimateRoundTripDays(state, train));
    const visits = new Map<number, number>();
    for (const o of train.orders) visits.set(o.stationId, (visits.get(o.stationId) ?? 0) + 1);
    for (const [from, n] of visits)
      for (const to of visits.keys()) {
        if (to === from) continue;
        const key = serviceKey(from, to);
        rates.set(key, (rates.get(key) ?? 0) + n / roundTrip);
      }
  }
  return rates;
}

/** Days between trains for a departure rate (a day, undefined when nothing runs). */
export function serviceIntervalDays(ratePerDay: number | undefined): number | undefined {
  return ratePerDay && ratePerDay > 0 ? 1 / ratePerDay : undefined;
}

/** Most people a destination's pile holds: `MAX_WAIT_DAYS` of its demand while a train serves the pair, none without
 * service. Phase 53C: the pile no longer follows an estimated service interval. It fills linearly from the moment the
 * last train that carries those people left (`DepartureStamp`), what a departing train cannot take stays, and only the
 * part above this ceiling is lost. */
export function waitingCap(perMonth: number, served: boolean): number {
  if (!served || perMonth <= 0) return 0;
  return (perMonth / DAYS_PER_MONTH) * MAX_WAIT_DAYS;
}

/** A passenger train leaves `stationId` now: stamp every next stop it makes (the first legs of the people it carries),
 * and fold the gap since the previous departure into the observed average. */
export function stampDeparture(state: GameState, stationId: number, stops: Iterable<number>): void {
  for (const next of stops) {
    if (next === stationId) continue;
    const key = serviceKey(stationId, next);
    const old = state.departures.get(key);
    if (!old) {
      state.departures.set(key, { last: state.ticks });
      continue;
    }
    const gap = (state.ticks - old.last) / HOURS_PER_DAY;
    // Smoothed over ~4 departures; a gap of 0 (two trains leave together) is a real observation.
    old.gapDays = old.gapDays === undefined ? gap : old.gapDays + (gap - old.gapDays) / 4;
    old.last = state.ticks;
  }
}

/** Days between trains for (station, next stop): the observed average once there is one, else the estimate. */
export function observedIntervalDays(
  state: GameState,
  rates: ServiceRates,
  stationId: number,
  next: number,
): number | undefined {
  const estimate = serviceIntervalDays(rates.get(serviceKey(stationId, next)));
  if (estimate === undefined) return undefined;
  const seen = state.departures.get(serviceKey(stationId, next))?.gapDays;
  return seen !== undefined && seen > 0 ? seen : estimate;
}
