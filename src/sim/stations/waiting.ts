/** Phase 51: people wait only for the next train (SPEC §9.5e-5). Pure.
 *
 * A destination's pile at a station holds the people who arrive between two trains that carry them: demand per day x the
 * service interval (round-trip time of those trains / how many), clamped to `MIN_WAIT_DAYS`..`MAX_WAIT_DAYS`. */
import { MAX_WAIT_DAYS, MIN_WAIT_DAYS } from "../../data/economy";
import type { GameState } from "../state";
import { estimateRoundTripDays } from "../trains/headway";
import { DAYS_PER_MONTH } from "../time";

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

/** Most people a destination's pile holds: a day's demand x the days to the next train, clamped. Zero with no service. */
export function waitingCap(perMonth: number, intervalDays: number | undefined): number {
  if (intervalDays === undefined || perMonth <= 0) return 0;
  const days = Math.min(MAX_WAIT_DAYS, Math.max(MIN_WAIT_DAYS, intervalDays));
  return (perMonth / DAYS_PER_MONTH) * days;
}
