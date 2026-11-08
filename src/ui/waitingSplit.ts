/** Phase 54: what the station panel says about the people waiting at a station: one pile, when the next train comes and
 * which towns the station's trains reach (biggest share first). Pure read of the state. */
import { HOURS_PER_DAY } from "../sim/time";
import type { GameState } from "../sim/state";
import { serviceKey, serviceRates, observedIntervalDays } from "../sim/stations/waiting";
import { routeStationView, type RouteStationView } from "./routeView";

export interface WaitingInfo {
  /** Passengers in the pile. */
  waiting: number;
  /** Days until the next train that calls here is expected, when one runs. */
  nextDays?: number;
  /** Phase 90: the station's routes with their demand and what was carried. */
  routes?: RouteStationView;
}

/** Days until the next passenger train leaves `stationId`: the shortest, over its next stops, of the observed gap between
 * departures minus the time since the last one (an estimate from the timetable until a gap has been seen). */
export function nextTrainDays(state: GameState, stationId: number): number | undefined {
  const rates = serviceRates(state);
  let best: number | undefined;
  for (const key of rates.keys()) {
    if (!key.startsWith(`${stationId}>`)) continue;
    const next = Number(key.slice(key.indexOf(">") + 1));
    const gap = observedIntervalDays(state, rates, stationId, next);
    if (gap === undefined) continue;
    const last = state.departures.get(serviceKey(stationId, next))?.last;
    const since = last === undefined ? 0 : (state.ticks - last) / HOURS_PER_DAY;
    const left = Math.max(0, gap - since);
    if (best === undefined || left < best) best = left;
  }
  return best === undefined ? undefined : Math.max(1, Math.round(best));
}

export function waitingInfo(state: GameState, stationId: number): WaitingInfo | undefined {
  const economy = state.stationEconomy.get(stationId);
  if (economy?.passengerPool === undefined) return undefined;
  const pile = state.stationCargo.get(stationId)?.passengers;
  const nextDays = nextTrainDays(state, stationId);
  const routeView = routeStationView(state, stationId);
  return {
    waiting: Math.round(pile?.amount ?? 0),
    ...(nextDays ? { nextDays } : {}),
    ...(routeView ? { routes: routeView } : {}),
  };
}
