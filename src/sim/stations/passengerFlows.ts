/**
 * Where a station's passengers go (PLAN Phase 35, rewritten in Phase 54, SPEC §9.5d). Pure.
 *
 * The station's part of its town's total travel demand (population x trips per head, SPEC §9.5d) is split over the towns
 * within the era's travel range by the radiation model (`radiationShares`: destination size, and the nearer towns that
 * compete for the trip). Only the shares of towns the
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
 * not dominate (`PAIR_DEMAND`). How a town's trips split over its destinations. */
export function gravityWeight(population: number, distanceTiles: number): number {
  return (
    Math.pow(population, PAIR_DEMAND.sizeExponent) /
    Math.pow(Math.max(PAIR_DEMAND.minDistanceTiles, distanceTiles), PAIR_DEMAND.distanceExponent)
  );
}

/** Share of the town's total travel demand each candidate takes (Phase 62; replaces the 20 % cap). Two real mechanisms,
 * no free parameter beyond the gravity table:
 *  - *Where*: the gravity weights (size / distance, `PAIR_DEMAND`) normalised over the candidates. A bigger or nearer town
 *    draws more, and every other town in range competes for the same trips, so a metropolis cannot take them all.
 *  - *How many*: the radiation model's total (Simini et al., Nature 484, 2012; Stouffer's intervening opportunities,
 *    1940): of the trips of a town of population `m`, the part S / (m + S) finds a destination among the S people living
 *    in the candidate towns. With few towns around, people travel less; the shares add up to it (< 1). */
export function destinationShares(
  originPopulation: number,
  candidates: ReadonlyArray<{ id: number; population: number; distance: number }>,
): Map<number, number> {
  const shares = new Map<number, number>();
  const m = Math.max(1, originPopulation);
  let all = 0;
  let sum = 0;
  const weights = new Map<number, number>();
  for (const c of candidates) {
    all += c.population;
    const w = gravityWeight(c.population, c.distance);
    weights.set(c.id, w);
    sum += w;
  }
  if (all <= 0 || sum <= 0) return shares;
  const found = all / (m + all);
  for (const [id, w] of weights) shares.set(id, (found * w) / sum);
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
  const candidates: Array<{ id: number; population: number; distance: number }> = [];
  for (const city of cities) {
    if (city.id === source.cityId) continue;
    const distance = distToCity(city);
    if (distance <= range || target.has(city.id))
      candidates.push({ id: city.id, population: city.population, distance });
  }
  const origin = cities.find((c) => c.id === source.cityId);
  const shares = destinationShares(origin?.population ?? 1, candidates);
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
