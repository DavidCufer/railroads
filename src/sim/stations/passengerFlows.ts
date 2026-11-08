/**
 * Where a station's passengers go (PLAN Phase 35, rewritten in Phases 54 and 90, SPEC 9.5d). Pure.
 *
 * Route demand: every town the station's trains call at *directly* is one route with its own number of people a month, from the
 * two towns' populations and the distance (`routeDemandPerMonth`), whatever else is built. The people wait in one pile
 * (cargoFlow.ts) and split over the stops of the train that takes them when they board (boarding.ts). Towns in range that no
 * train calls at are listed with what they would send (the route list's "not served" hint).
 */
import {
  PARTY_SIZE,
  ROUTE_DEMAND,
  travelRangeTiles,
  tripsPerHeadPerMonth,
} from "../../data/economy";
import type { City } from "../economy/types";
import type { GameMap } from "../map/types";
import { octileTileDistance } from "../trains/geometry";

export interface PassengerRoute {
  /** The station the town is reached at, and the town. */
  destination: number;
  cityId: number;
  /** People a month the route sends from this station (the route's demand). */
  perMonth: number;
}

export interface PassengerFlows {
  /** Routes' people a month / the station's part of its town's total (above 1 for a hub with several routes). */
  fraction: number;
  routes: PassengerRoute[];
  /** Towns in the radius that no train calls at, largest first: people they would send (a hint to connect them). */
  unconnected: Array<{ cityId: number; perMonth: number }>;
}

interface StationPoint {
  id: number;
  tile: number;
  /** The town this station mostly serves (it receives and sends that town's people), if any. */
  cityId: number;
}

/** People a month, in game passengers, one town sends to another over a route `tiles` long, for the whole town: the route demand
 * of SPEC 9.5d. Symmetric. A station of a town with several stations sends its share of it (`stationShare`). */
export function routeDemandPerMonth(
  popA: number,
  popB: number,
  tiles: number,
  year: number,
): number {
  const perHead = tripsPerHeadPerMonth(year) / PARTY_SIZE;
  const bend = Math.pow(
    ROUTE_DEMAND.refTiles / Math.max(ROUTE_DEMAND.refTiles, tiles),
    ROUTE_DEMAND.distExponent,
  );
  return Math.sqrt(popA * popB) * perHead * ROUTE_DEMAND.pairShare * bend;
}

/** `demand` is the station's part of its town's total travel demand (people a month). `links` = the stations each station reaches
 * directly on one train. */
export function computePassengerFlows(
  map: GameMap,
  cities: readonly City[],
  year: number,
  source: StationPoint,
  demand: number,
  stations: readonly StationPoint[],
  links: ReadonlyMap<number, ReadonlySet<number>>,
): PassengerFlows | undefined {
  if (demand <= 0) return undefined;
  const home = cities.find((c) => c.id === source.cityId);
  if (!home) return undefined;
  const range = travelRangeTiles(year);
  const direct = links.get(source.id);
  const distToCity = (city: City): number =>
    octileTileDistance(source.tile, city.anchorY * map.width + city.anchorX, map.width);
  // The station's part of its town (towns with several stations split their people by covered tiles).
  const townTotal = home.population * (tripsPerHeadPerMonth(year) / PARTY_SIZE);
  const stationShare = townTotal > 0 ? Math.min(1, demand / townTotal) : 0;

  // The nearest station of each town that a train of this station calls at.
  const target = new Map<number, { station: number; dist: number }>();
  for (const s of stations) {
    if (!direct?.has(s.id) || s.cityId < 0 || s.cityId === source.cityId) continue;
    const dist = octileTileDistance(source.tile, s.tile, map.width);
    const known = target.get(s.cityId);
    if (!known || dist < known.dist || (dist === known.dist && s.id < known.station))
      target.set(s.cityId, { station: s.id, dist });
  }
  const routes: PassengerRoute[] = [];
  for (const [cityId, t] of [...target].sort((a, b) => a[0] - b[0])) {
    const city = cities.find((c) => c.id === cityId);
    if (!city) continue;
    routes.push({
      destination: t.station,
      cityId,
      perMonth: routeDemandPerMonth(home.population, city.population, t.dist, year) * stationShare,
    });
  }
  // A hub never sends more than `townCap` times its own total, the routes scaled down alike.
  const sum = routes.reduce((s, r) => s + r.perMonth, 0);
  const cap = ROUTE_DEMAND.townCap * demand;
  if (sum > cap && sum > 0) for (const r of routes) r.perMonth = (r.perMonth * cap) / sum;

  const unconnected: PassengerFlows["unconnected"] = [];
  for (const city of cities) {
    if (city.id === source.cityId || target.has(city.id)) continue;
    const d = distToCity(city);
    if (d > range) continue;
    unconnected.push({
      cityId: city.id,
      perMonth: routeDemandPerMonth(home.population, city.population, d, year) * stationShare,
    });
  }
  unconnected.sort((a, b) => b.perMonth - a.perMonth || a.cityId - b.cityId);
  if (routes.length === 0 && unconnected.length === 0) return undefined;
  return {
    fraction: routes.reduce((s, r) => s + r.perMonth, 0) / demand,
    routes,
    unconnected,
  };
}
