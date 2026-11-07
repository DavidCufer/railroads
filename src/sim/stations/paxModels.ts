/**
 * Phase 89 prototypes (dev flag `PAX.model`, off by default): three ways to decide how many people a pair of stations
 * sends, replacing the "gravity share of every town in range" of today. `applyPaxModel` rewrites the passenger routes of
 * `state.stationEconomy` after every refresh; the waiting pile and the boarding are the existing ones, with the platform
 * holding `PAX_HOLD_DAYS` instead of 30. Pure and deterministic (the only state it reads is the game's own); the carried
 * counters below are for the UI and the benches and never feed back.
 */
import { PAX, ROUTE_DEMAND, SERVICE_DEMAND, TICKET_OFFICE } from "../../data/passengerModels";
import { PARTY_SIZE, tripsPerHeadPerMonth } from "../../data/economy";
import type { GameState } from "../state";
import { calendarFromTicks, DAYS_PER_MONTH, HOURS_PER_DAY } from "../time";
import { octileTileDistance } from "../trains/geometry";
import { serviceKey, serviceRates } from "./waiting";
import type { PassengerRoute } from "./passengerFlows";
import type { City } from "../economy/types";

/** Departures a week from `from` of passenger trains that also call at `to` (both directions are symmetric in practice). */
function departuresPerWeek(rates: Map<string, number>, from: number, to: number): number {
  return 7 * (rates.get(serviceKey(from, to)) ?? 0);
}

/** Level of service, 0..1, for a pair: how much of the ceiling travels. */
export function serviceLevel(perWeek: number): number {
  const u = 1 - Math.exp(-perWeek / SERVICE_DEMAND.scaleDeparturesPerWeek);
  return perWeek <= 0 ? 0 : Math.max(SERVICE_DEMAND.floor, u);
}

/** People a month (game passengers) one town sends to another under the active prototype at full service, whole town: the
 * formula of `applyPaxModel` without the station share. `route` and `service` use the pair formula (service x its ceiling), `ticket`
 * the budget split of two destinations is not known here, so a town with one destination sends its whole budget. */
export function pairDemandPerMonth(a: City, b: City, tiles: number, year: number): number {
  const tph = tripsPerHeadPerMonth(year) / PARTY_SIZE;
  if (PAX.model === "ticket") return a.population * tph * TICKET_OFFICE.budgetShare;
  const geo = Math.sqrt(a.population * b.population) * tph;
  const dist = Math.pow(
    ROUTE_DEMAND.refTiles / Math.max(ROUTE_DEMAND.refTiles, tiles),
    ROUTE_DEMAND.distExponent,
  );
  const base = geo * ROUTE_DEMAND.pairShare * dist;
  return PAX.model === "service" ? base * SERVICE_DEMAND.ceilingMult : base;
}

/** The bot's view of a line's demand: people a month both ways between every pair of its towns (what a player reads off the
 * route numbers); a hub is capped like `applyPaxModel` does. */
export function lineDemandPerMonth(cities: readonly City[], year: number, width: number): number {
  let sum = 0;
  for (let i = 0; i < cities.length; i++)
    for (let j = 0; j < cities.length; j++) {
      if (i === j) continue;
      const a = cities[i] as City;
      const b = cities[j] as City;
      const tiles = octileTileDistance(
        a.anchorY * width + a.anchorX,
        b.anchorY * width + b.anchorX,
        width,
      );
      sum += pairDemandPerMonth(a, b, tiles, year);
    }
  if (PAX.model === "ticket") return sum / Math.max(1, cities.length - 1); // one budget per town, shared by its destinations
  return sum;
}

/** Rewrites `passengerRoutes`, `passengerPool` and `supply.passengers` of every station a passenger train calls at. */
export function applyPaxModel(state: GameState): void {
  if (PAX.model === "today") return;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const tph = tripsPerHeadPerMonth(year) / PARTY_SIZE;
  const rates = PAX.model === "service" ? serviceRates(state) : new Map<string, number>();
  const stationById = new Map(state.stations.map((s) => [s.id, s]));
  for (const station of state.stations) {
    const eco = state.stationEconomy.get(station.id);
    if (!eco || !eco.passengerRoutes || eco.passengerRoutes.length === 0) continue;
    const cityA = eco.passengerTownId === undefined ? undefined : state.cities[eco.passengerTownId];
    if (!cityA) continue;
    const townTotal = cityA.population * tph;
    // The station's part of its town (towns with several stations split their people by covered tiles).
    const stationShare = townTotal > 0 ? Math.min(1, (eco.passengerDemand ?? 0) / townTotal) : 0;
    const demand = eco.passengerDemand ?? 0;
    const pairQuota: PassengerRoute[] = [];
    // The weights of the ticket office: population / distance among the destinations served only.
    let weightSum = 0;
    const weights = new Map<number, number>();
    for (const r of eco.passengerRoutes) {
      const dest = stationById.get(r.destination);
      const cityB = state.cities[r.cityId];
      if (!dest || !cityB) continue;
      const d = octileTileDistance(station.tile, dest.tile, state.map.width);
      if (PAX.model === "ticket") {
        const w = cityB.population / Math.max(15, d);
        weights.set(r.cityId, w);
        weightSum += w;
        continue;
      }
      const geo = Math.sqrt(cityA.population * cityB.population) * tph;
      const dist = Math.pow(
        ROUTE_DEMAND.refTiles / Math.max(ROUTE_DEMAND.refTiles, d),
        ROUTE_DEMAND.distExponent,
      );
      const ceiling = geo * ROUTE_DEMAND.pairShare * dist * stationShare;
      if (PAX.model === "route") pairQuota.push({ ...r, perMonth: ceiling, ceiling });
      else {
        const ceil = ceiling * SERVICE_DEMAND.ceilingMult;
        const perWeek = departuresPerWeek(rates, station.id, r.destination);
        const level = serviceLevel(perWeek);
        pairQuota.push({ ...r, perMonth: ceil * level, ceiling: ceil, level, perWeek });
      }
    }
    let routes: PassengerRoute[];
    if (PAX.model === "ticket") {
      const budget = demand * TICKET_OFFICE.budgetShare;
      routes = eco.passengerRoutes
        .filter((r) => weights.has(r.cityId))
        .map((r) => ({
          ...r,
          perMonth: weightSum > 0 ? (budget * (weights.get(r.cityId) as number)) / weightSum : 0,
          ceiling: budget,
        }));
    } else {
      routes = pairQuota;
      if (PAX.model === "route") {
        // A hub never sends more than `townCap` times its own total, the pairs scaled down alike.
        const sum = routes.reduce((s, r) => s + r.perMonth, 0);
        const cap = ROUTE_DEMAND.townCap * demand;
        if (sum > cap && sum > 0)
          routes = routes.map((r) => ({ ...r, perMonth: (r.perMonth * cap) / sum }));
      }
    }
    const total = routes.reduce((s, r) => s + r.perMonth, 0);
    eco.passengerRoutes = routes;
    eco.passengerPool = total;
    eco.supply.passengers = total;
  }
}

// --- carried counters (UI + benches; not part of the simulation) -----------------------------------------------------

interface Carried {
  value: number;
  tick: number;
}
const carried = new WeakMap<GameState, Map<string, Carried>>();
const carriedKey = (from: number, to: number): string => `${from}>${to}`;
const DECAY_DAYS = DAYS_PER_MONTH;

/** People who boarded at `from` for `to` in roughly the last month (exponentially forgotten, so it reads "a month"). */
export function carriedLastMonth(state: GameState, from: number, to: number): number {
  const c = carried.get(state)?.get(carriedKey(from, to));
  if (!c) return 0;
  return c.value * Math.exp(-(state.ticks - c.tick) / HOURS_PER_DAY / DECAY_DAYS);
}

/** Called when people board: `lots` are the destination stops and amounts. */
export function recordCarried(
  state: GameState,
  from: number,
  lots: ReadonlyArray<{ dest: number; amount: number }>,
): void {
  if (PAX.model === "today") return;
  let map = carried.get(state);
  if (!map) carried.set(state, (map = new Map()));
  for (const lot of lots) {
    const k = carriedKey(from, lot.dest);
    const old = map.get(k);
    const decayed = old
      ? old.value * Math.exp(-(state.ticks - old.tick) / HOURS_PER_DAY / DECAY_DAYS)
      : 0;
    map.set(k, { value: decayed + lot.amount, tick: state.ticks });
  }
}
