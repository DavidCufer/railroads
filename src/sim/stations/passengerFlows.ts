/**
 * Where a station's passengers go (PLAN Phase 35, SPEC §9.5d). Pure.
 *
 * The station's monthly passenger supply is the cap. It is split over the towns within the era's travel range by a
 * gravity share (destination size × distance decay); only the shares of towns *reachable* through the train network
 * (stations linked by trains' orders, any number of changes) are generated. Each reachable destination is stored by its
 * **first leg**: the next station on the shortest route there, so the waiting number always equals what the trains
 * calling at the station can take.
 */
import { PAIR_DEMAND, travelRangeTiles } from "../../data/economy";
import { citySupply } from "../economy/cityStats";
import type { City } from "../economy/types";
import type { GameMap } from "../map/types";
import { octileTileDistance } from "../trains/geometry";

export interface PassengerRoute {
  /** The next station on the shortest route: the bucket the people wait in. */
  firstLeg: number;
  /** The destination station and the town it stands for. */
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

/** Shortest crow-flies distance from `source` to every station in the link graph, with the first leg of that route.
 * Ties are broken by the lower station id so the result is deterministic. */
export function shortestFirstLegs(
  source: number,
  links: ReadonlyMap<number, ReadonlySet<number>>,
  tileOf: ReadonlyMap<number, number>,
  mapWidth: number,
): Map<number, { dist: number; firstLeg: number }> {
  const best = new Map<number, { dist: number; firstLeg: number }>();
  const done = new Set<number>();
  best.set(source, { dist: 0, firstLeg: source });
  for (;;) {
    let current = -1;
    let currentDist = Infinity;
    for (const [id, b] of best) {
      if (done.has(id)) continue;
      if (b.dist < currentDist || (b.dist === currentDist && id < current)) {
        current = id;
        currentDist = b.dist;
      }
    }
    if (current < 0) break;
    done.add(current);
    const here = best.get(current) as { dist: number; firstLeg: number };
    for (const next of [...(links.get(current) ?? [])].sort((a, b) => a - b)) {
      const a = tileOf.get(current);
      const b = tileOf.get(next);
      if (a === undefined || b === undefined || done.has(next)) continue;
      const dist = here.dist + octileTileDistance(a, b, mapWidth);
      const firstLeg = current === source ? next : here.firstLeg;
      const known = best.get(next);
      if (
        !known ||
        dist < known.dist - 1e-9 ||
        (Math.abs(dist - known.dist) <= 1e-9 && firstLeg < known.firstLeg)
      )
        best.set(next, { dist, firstLeg });
    }
  }
  best.delete(source);
  return best;
}

export function computePassengerFlows(
  map: GameMap,
  cities: readonly City[],
  year: number,
  source: StationPoint,
  baseSupply: number,
  stations: readonly StationPoint[],
  links: ReadonlyMap<number, ReadonlySet<number>>,
): PassengerFlows | undefined {
  if (baseSupply <= 0) return undefined;
  const range = travelRangeTiles(year);
  const ref = PAIR_DEMAND.refDistanceTiles;
  const tileOf = new Map(stations.map((s) => [s.id, s.tile]));
  const reach = shortestFirstLegs(source.id, links, tileOf, map.width);

  // Candidate towns: within the travel range of this station, or reached by the network.
  const weight = new Map<number, number>(); // cityId -> gravity weight
  const gravity = (city: City): number => {
    const dist = octileTileDistance(
      source.tile,
      city.anchorY * map.width + city.anchorX,
      map.width,
    );
    return (
      Math.pow(citySupply(city, year).passengers, PAIR_DEMAND.sizeExponent) *
      Math.pow(ref / Math.max(PAIR_DEMAND.minDistanceTiles, dist), PAIR_DEMAND.distanceExponent)
    );
  };
  const distToCity = (city: City): number =>
    octileTileDistance(source.tile, city.anchorY * map.width + city.anchorX, map.width);

  // The best (nearest by route) reachable station of each town.
  const target = new Map<number, { station: number; dist: number; firstLeg: number }>();
  for (const s of stations) {
    const r = reach.get(s.id);
    if (!r || s.cityId < 0 || s.cityId === source.cityId) continue;
    const known = target.get(s.cityId);
    if (!known || r.dist < known.dist || (r.dist === known.dist && s.id < known.station))
      target.set(s.cityId, { station: s.id, dist: r.dist, firstLeg: r.firstLeg });
  }
  for (const city of cities) {
    if (city.id === source.cityId) continue;
    if (distToCity(city) <= range || target.has(city.id)) weight.set(city.id, gravity(city));
  }
  let total = 0;
  for (const w of weight.values()) total += w;
  if (total <= 0) return undefined;
  // The town total is `totalDemandMult` towns of the station's own size at the clamp distance: the denominator is at
  // least that, so a lone same-size partner carries exactly the base (§6.3) supply (total × w / floor = base) and only
  // a crowd of competing towns (Σ weights above the floor) dilutes a line's share. No line can take 100 %.
  const ownCity = cities.find((c) => c.id === source.cityId);
  const own = Math.pow(
    ownCity ? citySupply(ownCity, year).passengers : baseSupply / PAIR_DEMAND.totalDemandMult,
    PAIR_DEMAND.sizeExponent,
  );
  const floor =
    own *
    Math.pow(ref / PAIR_DEMAND.minDistanceTiles, PAIR_DEMAND.distanceExponent) *
    PAIR_DEMAND.totalDemandMult;
  const denominator = Math.max(total, floor);
  const routes: PassengerRoute[] = [];
  const unconnected: PassengerFlows["unconnected"] = [];
  let reachable = 0;
  for (const [cityId, w] of [...weight].sort((a, b) => a[0] - b[0])) {
    const share = w / denominator;
    const t = target.get(cityId);
    if (t) {
      reachable += share;
      routes.push({
        firstLeg: t.firstLeg,
        destination: t.station,
        cityId,
        perMonth: baseSupply * share,
      });
    } else unconnected.push({ cityId, perMonth: baseSupply * share });
  }
  unconnected.sort((a, b) => b.perMonth - a.perMonth || a.cityId - b.cityId);
  return { fraction: reachable, routes, unconnected };
}
