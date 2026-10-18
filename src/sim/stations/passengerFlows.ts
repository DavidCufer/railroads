/**
 * Where a station's passengers go (PLAN Phase 35, SPEC §9.5d). Pure.
 *
 * The station's part of its town's total travel demand (population x trips per head, SPEC §9.5d) is split over the towns within the era's travel range by a
 * gravity share (destination size × distance decay); only the shares of towns *reachable* through the train network
 * (stations linked by trains' orders, any number of changes) are generated. Each reachable destination is stored by its
 * **first leg**: the next station on the shortest route there, so the waiting number always equals what the trains
 * calling at the station can take.
 */
import { maxChangesOf } from "../../data/passengerModels";
import { CHANGE_MIN_TILES, PAIR_DEMAND, travelRangeTiles } from "../../data/economy";
import type { City } from "../economy/types";
import type { GameMap } from "../map/types";
import { octileTileDistance } from "../trains/geometry";
import { PassengerNetwork } from "./destinations";

export interface PassengerRoute {
  /** The next station on the shortest route: the bucket the people wait in. */
  firstLeg: number;
  /** The destination station and the town it stands for. */
  destination: number;
  cityId: number;
  /** People a month, of the station's final (reachable) supply. */
  perMonth: number;
  /** Changes of train on the best route (Phase 48). */
  changes: number;
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

export interface Route {
  /** Tiles along the route (crow-flies hop by hop). */
  dist: number;
  /** Distance plus the change penalty: what the route search minimises. */
  cost: number;
  changes: number;
  firstLeg: number;
}

/** Cheapest route from `source` to every station, where each change of train line costs `links.changeTiles` (the wait
 * for the onward train, at least `CHANGE_MIN_TILES`; Phase 48/53B). `startLine` is the line the traveller is already on (-1 = none yet: boarding is free). Without line
 * information on `links` every link is one line and nothing is a change. Ties go to the lower first leg, then the
 * lower station id, so the result is deterministic. */
export function routesFrom(
  source: number,
  links: ReadonlyMap<number, ReadonlySet<number>>,
  tileOf: ReadonlyMap<number, number>,
  mapWidth: number,
  startLine = -1,
): Map<number, Route> {
  const edgeLines = links instanceof PassengerNetwork ? links.edgeLines : undefined;
  const changeTiles = links instanceof PassengerNetwork ? links.changeTiles : undefined;
  const linesOf = (a: number, b: number): number[] =>
    edgeLines ? [...(edgeLines.get(`${a}>${b}`) ?? [])].sort((x, y) => x - y) : [0];
  interface Node extends Route {
    station: number;
    line: number;
    done: boolean;
  }
  const nodes = new Map<string, Node>();
  const keyOf = (station: number, line: number): string => `${station}:${line}`;
  const start: Node = {
    station: source,
    line: startLine,
    dist: 0,
    cost: 0,
    changes: 0,
    firstLeg: source,
    done: false,
  };
  nodes.set(keyOf(source, startLine), start);
  for (;;) {
    let current: Node | undefined;
    for (const node of nodes.values()) {
      if (node.done) continue;
      if (
        !current ||
        node.cost < current.cost - 1e-9 ||
        (Math.abs(node.cost - current.cost) <= 1e-9 &&
          (node.station < current.station ||
            (node.station === current.station && node.line < current.line)))
      )
        current = node;
    }
    if (!current) break;
    current.done = true;
    const a = tileOf.get(current.station);
    for (const next of [...(links.get(current.station) ?? [])].sort((x, y) => x - y)) {
      const b = tileOf.get(next);
      if (a === undefined || b === undefined) continue;
      const hop = octileTileDistance(a, b, mapWidth);
      for (const line of linesOf(current.station, next)) {
        const change = current.line >= 0 && line !== current.line ? 1 : 0;
        const cost =
          current.cost +
          hop +
          (change ? (changeTiles ? changeTiles(current.station, next) : CHANGE_MIN_TILES) : 0);
        const firstLeg = current.station === source ? next : current.firstLeg;
        const known = nodes.get(keyOf(next, line));
        if (known && known.done) continue;
        if (
          !known ||
          cost < known.cost - 1e-9 ||
          (Math.abs(cost - known.cost) <= 1e-9 && firstLeg < known.firstLeg)
        )
          nodes.set(keyOf(next, line), {
            station: next,
            line,
            dist: current.dist + hop,
            cost,
            changes: current.changes + change,
            firstLeg,
            done: false,
          });
      }
    }
  }
  const best = new Map<number, Route>();
  for (const node of nodes.values()) {
    if (node.station === source) continue;
    const known = best.get(node.station);
    if (
      !known ||
      node.cost < known.cost - 1e-9 ||
      (Math.abs(node.cost - known.cost) <= 1e-9 && node.firstLeg < known.firstLeg)
    )
      best.set(node.station, {
        dist: node.dist,
        cost: node.cost,
        changes: node.changes,
        firstLeg: node.firstLeg,
      });
  }
  return best;
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

/** `demand` is the station's part of its town's total travel demand (people a month). */
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
  const tileOf = new Map(stations.map((s) => [s.id, s.tile]));
  const reach = routesFrom(source.id, links, tileOf, map.width);
  // Exploration E1: m2 counts only towns a train of this station calls at directly, m3 also one change away.
  const maxChanges = links instanceof PassengerNetwork ? maxChangesOf(links.model) : Infinity;

  // Gravity weight: destination population / distance (real decay, clamped so a next-door village does not dominate).
  const distToCity = (city: City): number =>
    octileTileDistance(source.tile, city.anchorY * map.width + city.anchorX, map.width);
  // Effective distance = the way there + the wait at each change of train (Phase 48/53B): a town reached direct draws
  // more people than the same town reached with changes.
  const gravity = (city: City, changeTiles: number): number =>
    Math.pow(city.population, PAIR_DEMAND.sizeExponent) /
    Math.pow(
      Math.max(PAIR_DEMAND.minDistanceTiles, distToCity(city) + changeTiles),
      PAIR_DEMAND.distanceExponent,
    );

  // The best (nearest by route) reachable station of each town.
  const target = new Map<
    number,
    { station: number; dist: number; firstLeg: number; changes: number; changeTiles: number }
  >();
  for (const s of stations) {
    const r = reach.get(s.id);
    if (!r || s.cityId < 0 || s.cityId === source.cityId || r.changes > maxChanges) continue;
    const known = target.get(s.cityId);
    if (!known || r.cost < known.dist || (r.cost === known.dist && s.id < known.station))
      target.set(s.cityId, {
        station: s.id,
        dist: r.cost,
        firstLeg: r.firstLeg,
        changes: r.changes,
        changeTiles: r.cost - r.dist,
      });
  }
  // Candidates: towns within the known-destination radius, plus any town the network reaches.
  const weight = new Map<number, number>(); // cityId -> gravity weight
  for (const city of cities) {
    if (city.id === source.cityId) continue;
    if (distToCity(city) <= range || target.has(city.id))
      weight.set(city.id, gravity(city, target.get(city.id)?.changeTiles ?? 0));
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
      routes.push({
        firstLeg: t.firstLeg,
        destination: t.station,
        cityId,
        perMonth: demand * share,
        changes: t.changes,
      });
    } else unconnected.push({ cityId, perMonth: demand * share });
  }
  unconnected.sort((a, b) => b.perMonth - a.perMonth || a.cityId - b.cityId);
  return { fraction: reachable, routes, unconnected };
}
