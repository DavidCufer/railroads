/** Phase 54: what the station panel says about the people waiting at a station: one pile, when the next train comes and
 * which towns the station's trains reach (biggest share first). Pure read of the state. */
import { HOURS_PER_DAY } from "../sim/time";
import type { GameState } from "../sim/state";
import { serviceKey, serviceRates, observedIntervalDays } from "../sim/stations/waiting";
import { strings } from "./strings";

const SHOWN = 4;

export interface WaitingInfo {
  /** Passengers in the pile. */
  waiting: number;
  /** Days until the next train that calls here is expected, when one runs. */
  nextDays?: number;
  /** Towns the trains here call at directly, biggest share first (at most `SHOWN`, then "+N more"). */
  reach: string[];
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
  const routes = [...(economy.passengerRoutes ?? [])].sort(
    (a, b) => b.perMonth - a.perMonth || a.cityId - b.cityId,
  );
  const names = routes.map((r) => state.cities.find((c) => c.id === r.cityId)?.name ?? "?");
  const reach = names.slice(0, SHOWN);
  if (names.length > SHOWN) reach.push(strings.station.reachMore(names.length - SHOWN));
  const nextDays = nextTrainDays(state, stationId);
  return { waiting: Math.round(pile?.amount ?? 0), reach, ...(nextDays ? { nextDays } : {}) };
}
