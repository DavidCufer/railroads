/** Phase 51: people wait only for the next train (SPEC §9.5e-5). Pure.
 *
 * A destination's pile at a station holds the people who arrive between two trains that carry them: demand per day x the
 * service interval (round-trip time of those trains / how many), clamped to `MIN_WAIT_DAYS`..`MAX_WAIT_DAYS`. */
import {
  CHANGE_MIN_TILES,
  MAX_WAIT_DAYS,
  MIN_WAIT_DAYS,
  eraReferenceTilesPerDay,
} from "../../data/economy";
import type { GameState } from "../state";
import { estimateRoundTripDays } from "../trains/headway";
import { DAYS_PER_MONTH, HOURS_PER_DAY, calendarFromTicks } from "../time";

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

/** Tiles of effective distance a change of train costs at `station` for the onward leg to `next`. */
export type ChangeTiles = (station: number, next: number) => number;

/** Phase 53B: a change costs what it really costs, the wait. The traveller arrives at a random moment, so waits half the
 * onward service interval (clamped like a pile's, `MIN/MAX_WAIT_DAYS`), which at the era's reference speed
 * (`eraReferenceTilesPerDay`) is that many tiles of travel; never less than the platform walk (`CHANGE_MIN_TILES`).
 * The service data is Phase 51's and is built on the first change asked about, so a network with no change pays nothing. */
export function changeTilesFor(state: GameState): ChangeTiles {
  let rates: ServiceRates | undefined;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  return (station, next) => {
    rates ??= serviceRates(state);
    const interval = serviceIntervalDays(rates.get(serviceKey(station, next))) ?? MAX_WAIT_DAYS;
    const wait = 0.5 * Math.min(MAX_WAIT_DAYS, Math.max(MIN_WAIT_DAYS, interval));
    return Math.max(CHANGE_MIN_TILES, wait * eraReferenceTilesPerDay(year));
  };
}
