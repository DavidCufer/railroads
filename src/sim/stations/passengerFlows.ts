/**
 * Where a station's passengers go (PLAN Phase 35, rewritten in Phase 54, SPEC §9.5d). Pure.
 *
 * The station's part of its town's total travel demand (population x trips per head, SPEC §9.5d) is split over the towns
 * within the era's travel range by a gravity share (destination size / distance decay). Only the shares of towns the
 * station's trains call at *directly* are generated (no change of train is counted); the rest is the "unserved demand"
 * the station panel hints at. The people who are generated wait in one pile (cargoFlow.ts) and split over the stops of
 * the train that takes them when they board (boarding.ts).
 */
import { PAIR_DEMAND, travelRangeTiles } from "../../data/economy";
import type { City } from "../economy/types";
import type { GameMap } from "../map/types";
import { octileTileDistance } from "../trains/geometry";

export interface PassengerRoute {
  /** The station the town is reached at, and the town. */
  destination: number;
  cityId: number;
  /** People a month, of the station's final (reachable) supply. */
  perMonth: number;
}

export interface PassengerFlows {
  /** Fraction of the station's total demand that is bound for a reachable destination (the rest is never generated). */
  fraction: number;
  routes: PassengerRoute[];
  /** Towns in the radius with no train connection, largest share first: people they would send (a hint to expand). */
  unconnected: Array<{ cityId: number; perMonth: number }>;
}

interface StationPoint {
  id: number;
  tile: number;
  /** The town this station mostly serves (it receives and sends that town's people), if any. */
  cityId: number;
}

/** Gravity weight of a destination town: population / distance (tiles), the distance clamped so a next-door village does
 * not dominate (`PAIR_DEMAND`). The one formula for how many trips a town draws and how riders split over stops. */
export function gravityWeight(population: number, distanceTiles: number): number {
  return (
    Math.pow(population, PAIR_DEMAND.sizeExponent) /
    Math.pow(Math.max(PAIR_DEMAND.minDistanceTiles, distanceTiles), PAIR_DEMAND.distanceExponent)
  );
}

/** Share of the town total each candidate takes: gravity weights normalised to 1, no one above `maxShare` (Phase 53).
 * The excess goes to candidates still under the cap, in proportion; when all are capped it is not generated: a town
 * with few places to go makes fewer trips, so the shares may add up to less than 1. */
export function capShares(
  weights: ReadonlyMap<number, number>,
  maxShare: number,
): Map<number, number> {
  const shares = new Map<number, number>();
  let total = 0;
  for (const w of weights.values()) total += w;
  if (total <= 0) return shares;
  for (const [id, w] of weights) shares.set(id, w / total);
  const cap = maxShare;
  // Water-filling: shares over the cap are cut to it and the excess is spread, in proportion, over the shares still
  // below it; that can lift some of those over the cap, so repeat (at most once per candidate). Whatever cannot be
  // placed (every candidate at the cap) is simply not generated.
  for (let pass = 0; pass <= weights.size; pass++) {
    let excess = 0;
    let free = 0;
    for (const v of shares.values()) {
      if (v > cap + 1e-12) excess += v - cap;
      else if (v < cap - 1e-12) free += v;
    }
    if (excess <= 1e-12) break;
    for (const [id, v] of shares) {
      if (v > cap) shares.set(id, cap);
      else if (v < cap - 1e-12 && free > 0) shares.set(id, v + (excess * v) / free);
    }
  }
  for (const [id, v] of shares) if (v > cap) shares.set(id, cap);
  return shares;
}

/** `demand` is the station's part of its town's total travel demand (people a month). `links` = the stations each
 * station reaches directly on one train. */
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
  const range = travelRangeTiles(year);
  const direct = links.get(source.id);
  const distToCity = (city: City): number =>
    octileTileDistance(source.tile, city.anchorY * map.width + city.anchorX, map.width);

  // The nearest station of each town that a train of this station calls at.
  const target = new Map<number, { station: number; dist: number }>();
  for (const s of stations) {
    if (!direct?.has(s.id) || s.cityId < 0 || s.cityId === source.cityId) continue;
    const dist = octileTileDistance(source.tile, s.tile, map.width);
    const known = target.get(s.cityId);
    if (!known || dist < known.dist || (dist === known.dist && s.id < known.station))
      target.set(s.cityId, { station: s.id, dist });
  }
  // Candidates: towns within the known-destination radius, plus any town a train of this station calls at.
  const weight = new Map<number, number>(); // cityId -> gravity weight
  for (const city of cities) {
    if (city.id === source.cityId) continue;
    if (distToCity(city) <= range || target.has(city.id))
      weight.set(city.id, gravityWeight(city.population, distToCity(city)));
  }
  const shares = capShares(weight, PAIR_DEMAND.maxShare);
  if (shares.size === 0) return undefined;
  const routes: PassengerRoute[] = [];
  const unconnected: PassengerFlows["unconnected"] = [];
  let reachable = 0;
  for (const [cityId, share] of [...shares].sort((a, b) => a[0] - b[0])) {
    const t = target.get(cityId);
    if (t) {
      reachable += share;
      routes.push({ destination: t.station, cityId, perMonth: demand * share });
    } else unconnected.push({ cityId, perMonth: demand * share });
  }
  unconnected.sort((a, b) => b.perMonth - a.perMonth || a.cityId - b.cityId);
  return { fraction: reachable, routes, unconnected };
}
