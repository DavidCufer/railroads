/**
 * Who boards a train (PLAN Phase 34 item 10): waiting passengers are bound for a destination station
 * (`StationCargoPile.bound`); a train boards the people bound for any other stop of its orders, plus those with no
 * destination yet (`amount` minus what is bound). Piles without `bound` (everything else, and old saves) board anyone.
 */
import { PAIR_DEMAND } from "../../data/economy";
import { octileTileDistance } from "../trains/geometry";
import type { GameState, PassengerLot, StationCargoPile } from "../state";
import { routesFrom, shortestFirstLegs, type Route } from "./passengerFlows";
import { passengerNetwork, type PassengerNetwork } from "./destinations";
import type { Train } from "../trains/types";

/** Phase 48: answers "which way to their destination?" for people at a station, from the trains' current orders.
 * Built once per stop (the network cannot change in the middle of one). */
export class Router {
  private readonly links: PassengerNetwork;
  private readonly tileOf: Map<number, number>;
  private readonly width: number;
  private readonly cache = new Map<string, Map<number, Route>>();

  constructor(state: GameState) {
    this.links = passengerNetwork(state);
    this.tileOf = new Map(state.stations.map((s) => [s.id, s.tile]));
    this.width = state.map.width;
  }

  /** Best routes from `station`; `line` = the train line the traveller is on (-1 = not on one yet). */
  from(station: number, line = -1): Map<number, Route> {
    const key = `${station}:${line}`;
    let routes = this.cache.get(key);
    if (!routes) {
      routes = routesFrom(station, this.links, this.tileOf, this.width, line);
      this.cache.set(key, routes);
    }
    return routes;
  }

  /** The line `train` runs (-1 if it is not a passenger train). */
  lineOf(train: Train): number {
    return this.links.lineIds.get(train.orders.map((o) => o.stationId).join(",")) ?? -1;
  }
}

/** The stops `train` makes from its current one until it comes back to this same station: where one more ride on it
 * can take you. (A train A-B-C-B at C: B, A, B; at the middle B: C only.) */
export function upcomingStops(train: Train): Set<number> {
  const stops = new Set<number>();
  const n = train.orders.length;
  const here = train.orders[train.currentOrderIndex]?.stationId;
  for (let step = 1; step < n; step++) {
    const id = (train.orders[(train.currentOrderIndex + step) % n] as { stationId: number })
      .stationId;
    if (id === here) break;
    stops.add(id);
  }
  return stops;
}

function lotSum(entry: StationCargoPile): number {
  let sum = 0;
  for (const lot of entry.lots ?? []) sum += lot.amount;
  return sum;
}

/** Whether `lot` waiting at `stationId` would ride `train`: the next station towards its destination is a stop the
 * train makes. People whose destination cannot be reached by any train board anything. */
function lotBoards(
  lot: PassengerLot,
  router: Router,
  train: Train,
  stationId: number,
  upcoming: ReadonlySet<number>,
): boolean {
  if (lot.dest === stationId) return false;
  const route = router.from(stationId).get(lot.dest);
  return route ? upcoming.has(route.firstLeg) : true;
}

/** What happens to a passenger lot aboard `train` when it calls at `stationId`: it arrives (destination), stays on
 * (the train goes on towards it), or changes (alights to wait for another train). */
export function lotFate(
  lot: PassengerLot,
  router: Router,
  train: Train,
  stationId: number,
): "arrive" | "stay" | "change" | "stranded" {
  if (lot.dest === stationId) return "arrive";
  const route = router.from(stationId, router.lineOf(train)).get(lot.dest);
  if (!route) return "stranded";
  return upcomingStops(train).has(route.firstLeg) ? "stay" : "change";
}

/** Adds `amount` people to `lots`, merged with a lot of the same destination, origin and start. */
export function addLot(lots: PassengerLot[], add: PassengerLot): void {
  const same = lots.find(
    (l) => l.dest === add.dest && l.originTile === add.originTile && l.tick === add.tick,
  );
  if (same) same.amount += add.amount;
  else lots.push({ ...add });
}

/** People boarding `train` from the lots in `entry`, up to `room`; removes them from the pile. A lot's journey starts
 * (`tick`) the moment it first boards. */
export function takeLots(
  entry: StationCargoPile,
  router: Router,
  train: Train,
  stationId: number,
  room: number,
  now: number,
): PassengerLot[] {
  const taken: PassengerLot[] = [];
  if (!entry.lots || room <= 0) return taken;
  const upcoming = upcomingStops(train);
  let left = room;
  for (const lot of entry.lots) {
    if (left <= 1e-9) break;
    if (lot.amount <= 0 || !lotBoards(lot, router, train, stationId, upcoming)) continue;
    const n = Math.min(lot.amount, left);
    lot.amount -= n;
    left -= n;
    entry.amount -= n;
    addLot(taken, { dest: lot.dest, amount: n, originTile: lot.originTile, tick: lot.tick ?? now });
  }
  entry.lots = entry.lots.filter((l) => l.amount > 1e-9);
  if (entry.lots.length === 0) delete entry.lots;
  if (entry.amount < 1e-9) {
    entry.amount = 0;
    delete entry.bound;
    delete entry.lots;
  }
  return taken;
}

/** Exploration E1 (m2, m3): people waiting in the station's one pile, with no destination yet. */
export function poolAmount(entry: StationCargoPile): number {
  return Math.max(0, entry.amount - lotSum(entry));
}

/** Share of the people who board `train` at `station` that ride to each of its later stops: gravity, destination
 * population / max(distance, `PAIR_DEMAND.minDistanceTiles`)^`distanceExponent`, among the stops the train makes before
 * it comes back to this station (`upcomingStops`). Empty when no later stop has a town to go to. */
export function boardingShares(
  state: GameState,
  train: Train,
  station: { id: number; tile: number },
): Map<number, number> {
  const here = state.stationEconomy.get(station.id)?.passengerTownId;
  const weights = new Map<number, number>();
  let total = 0;
  for (const stop of [...upcomingStops(train)].sort((a, b) => a - b)) {
    if (stop === station.id) continue;
    const target = state.stations.find((s) => s.id === stop);
    const cityId = state.stationEconomy.get(stop)?.passengerTownId;
    const city = cityId === undefined ? undefined : state.cities[cityId];
    if (!target || !city || cityId === here) continue;
    const dist = octileTileDistance(station.tile, target.tile, state.map.width);
    const w =
      Math.pow(city.population, PAIR_DEMAND.sizeExponent) /
      Math.pow(Math.max(PAIR_DEMAND.minDistanceTiles, dist), PAIR_DEMAND.distanceExponent);
    weights.set(stop, w);
    total += w;
  }
  if (total <= 0) return new Map();
  for (const [id, w] of weights) weights.set(id, w / total);
  return weights;
}

/** Exploration E1 (m2, m3): up to `room` people of the one pile board `train` and each picks a destination among its later
 * stops (`boardingShares`). They pay by distance on arrival like any other passenger. */
export function takePool(
  state: GameState,
  entry: StationCargoPile,
  train: Train,
  station: { id: number; tile: number },
  room: number,
  now: number,
): PassengerLot[] {
  const n = Math.min(poolAmount(entry), room);
  if (n <= 1e-9) return [];
  const shares = boardingShares(state, train, station);
  const taken: PassengerLot[] = [];
  for (const [dest, share] of shares)
    addLot(taken, { dest, amount: n * share, originTile: station.tile, tick: now });
  if (taken.length === 0) return [];
  entry.amount -= n;
  if (entry.amount < 1e-9) {
    entry.amount = 0;
    delete entry.bound;
    delete entry.lots;
  }
  return taken;
}

function boundSum(entry: StationCargoPile): number {
  let sum = 0;
  for (const v of Object.values(entry.bound ?? {})) sum += v;
  return sum;
}

function eligibleBound(entry: StationCargoPile, train: Train, stationId: number): number {
  if (!entry.bound) return 0;
  let sum = 0;
  const seen = new Set<number>();
  for (const order of train.orders) {
    if (order.stationId === stationId || seen.has(order.stationId)) continue;
    seen.add(order.stationId);
    sum += entry.bound[order.stationId] ?? 0;
  }
  return sum;
}

/** People in `entry` who would board `train` at `stationId`. */
export function boardable(
  entry: StationCargoPile,
  train: Train,
  stationId: number,
  router?: Router,
): number {
  return legacyBoardable(entry, train, stationId) + lotsBoardable(entry, train, stationId, router);
}

/** People of the older first-leg buckets (and everyone with no destination) who would board `train`. */
export function legacyBoardable(entry: StationCargoPile, train: Train, stationId: number): number {
  const amount = Math.max(0, entry.amount - lotSum(entry));
  if (!entry.bound) return amount;
  const unbound = Math.max(0, amount - boundSum(entry));
  return Math.min(amount, unbound + eligibleBound(entry, train, stationId));
}

/** People bound for a destination (Phase 48) who would board `train`. */
export function lotsBoardable(
  entry: StationCargoPile,
  train: Train,
  stationId: number,
  router?: Router,
): number {
  if (!entry.lots || !router) return 0;
  const upcoming = upcomingStops(train);
  let sum = 0;
  for (const lot of entry.lots)
    if (lotBoards(lot, router, train, stationId, upcoming)) sum += lot.amount;
  return sum;
}

/** Removes `amount` (at most `boardable`) from `entry`: people bound for the train's stops first, then unassigned. */
export function takeBoarders(
  entry: StationCargoPile,
  train: Train,
  stationId: number,
  amount: number,
): void {
  if (entry.bound) {
    const eligible = eligibleBound(entry, train, stationId);
    const fromBound = Math.min(amount, eligible);
    if (fromBound > 0) {
      const ratio = fromBound / eligible;
      const seen = new Set<number>();
      for (const order of train.orders) {
        if (order.stationId === stationId || seen.has(order.stationId)) continue;
        seen.add(order.stationId);
        const v = entry.bound[order.stationId] ?? 0;
        entry.bound[order.stationId] = v - v * ratio;
      }
    }
  }
  entry.amount -= amount;
  if (entry.amount < 1e-9) {
    entry.amount = 0;
    delete entry.bound;
    delete entry.lots;
  }
}

/** Migration (Phase 35 item 7): Phase 34 saved waiting passengers by *destination* station; they are now stored by
 * first leg (the next station on the shortest route there). Re-buckets every passenger pile; people bound for a
 * station no train network reaches any more become unassigned (they board any train, or give up as usual). Applying
 * it to a pile that is already stored by first leg changes nothing. */
export function rebucketPassengerPiles(
  state: Pick<GameState, "stations" | "stationCargo" | "map">,
  links: ReadonlyMap<number, ReadonlySet<number>>,
): void {
  const tileOf = new Map(state.stations.map((s) => [s.id, s.tile]));
  for (const [stationId, pile] of state.stationCargo) {
    const entry = pile.passengers;
    if (!entry?.bound) continue;
    const reach = shortestFirstLegs(stationId, links, tileOf, state.map.width);
    const rebound: Record<number, number> = {};
    for (const [key, amount] of Object.entries(entry.bound)) {
      const firstLeg = reach.get(Number(key))?.firstLeg;
      if (firstLeg !== undefined) rebound[firstLeg] = (rebound[firstLeg] ?? 0) + amount;
    }
    entry.bound = rebound;
  }
}
