/**
 * Who boards a train (PLAN Phase 54, SPEC §8.1). One pile of waiting passengers per station. A calling train takes the
 * people heading for the towns it stops at: at most the pile x (what the station sends to the towns of the train's later
 * stops / what it sends to every town its trains reach), those being the gravity shares that generated the pile (each
 * town capped), so an express that skips the small towns does not carry the people who wanted them. Those who board
 * split over the train's later stops in the same proportions and pay per distance on arrival.
 */
import { MAX_WAIT_DAYS } from "../../data/economy";
import type { GameState, PassengerLot, StationCargoPile } from "../state";
import { DAYS_PER_MONTH, HOURS_PER_DAY } from "../time";
import { octileTileDistance } from "../trains/geometry";
import { waitKey, waitedDays } from "./waiting";
import type { Train } from "../trains/types";

/** The stops `train` makes from its current one until it comes back to this same station: where one more ride on it
 * can take you. (A train A-B-C-B at C: B, A, B; at the middle B: C only.) A "pass through" order is not a stop. */
export function upcomingStops(train: Train): Set<number> {
  const stops = new Set<number>();
  const n = train.orders.length;
  const here = train.orders[train.currentOrderIndex]?.stationId;
  for (let step = 1; step < n; step++) {
    const order = train.orders[(train.currentOrderIndex + step) % n] as {
      stationId: number;
      rule: string;
    };
    if (order.stationId === here) break;
    if (order.rule !== "passThrough") stops.add(order.stationId);
  }
  return stops;
}

/** The people a month the station sends to each town it reaches (`StationEconomy.passengerRoutes`: gravity shares, each
 * town capped at `PAIR_DEMAND.maxShare`, the same numbers that generated the pile), summed over the towns of `stops`,
 * with the stop that serves each town (the nearest one). `total` is what the whole station sends to every town it reaches. */
function routesTo(
  state: GameState,
  station: { id: number; tile: number },
  stops: Iterable<number>,
): { byStop: Map<number, number>; mine: number; total: number } {
  const routes = state.stationEconomy.get(station.id)?.passengerRoutes ?? [];
  const stopOfCity = new Map<number, { stop: number; dist: number }>();
  for (const stopId of [...stops].sort((a, b) => a - b)) {
    if (stopId === station.id) continue;
    const stop = state.stations.find((s) => s.id === stopId);
    const cityId = state.stationEconomy.get(stopId)?.passengerTownId;
    if (!stop || cityId === undefined) continue;
    const dist = octileTileDistance(station.tile, stop.tile, state.map.width);
    const known = stopOfCity.get(cityId);
    if (!known || dist < known.dist) stopOfCity.set(cityId, { stop: stopId, dist });
  }
  const byStop = new Map<number, number>();
  let mine = 0;
  let total = 0;
  for (const route of routes) {
    total += route.perMonth;
    const at = stopOfCity.get(route.cityId);
    if (!at) continue;
    byStop.set(at.stop, (byStop.get(at.stop) ?? 0) + route.perMonth);
    mine += route.perMonth;
  }
  return { byStop, mine, total };
}

/** Part of the station's pile that is bound for the towns of `stops`: what the station sends them / what it sends to all
 * the towns its trains reach. */
export function pileShareFor(
  state: GameState,
  station: { id: number; tile: number },
  stops: Iterable<number>,
): number {
  const { mine, total } = routesTo(state, station, stops);
  return total > 0 ? Math.min(1, mine / total) : 0;
}

/** What one calling train may take from the station's pile and where those people go. Built once per stop.
 *
 * The pile is one number, but the people in it are on their way to different towns, and a train carries only the ones
 * bound for the towns it calls at. How many that is follows from what the pile is made of: for each town the station
 * sends people to (`passengerRoutes`, people a month), the people who arrived since a train that calls there last took
 * them (`waitingSince`, `MAX_WAIT_DAYS` at most), plus a share of any rest. A train may board at most the pile x its
 * towns' share of the demand, and no more than those people: an express that calls only at the two big towns cannot
 * carry the small towns' people however often it runs, and a local that left the big town's people behind leaves them
 * for the next train. */
export class Boarding {
  /** Share of the people who board that ride to each later stop (sums to 1; empty when no later stop has a town). */
  readonly shares = new Map<number, number>();
  /** Part of the pile this train takes by the demand shares (`pileShareFor` for its later stops). */
  readonly fraction: number;
  /** People of the pile this train may still take at this stop (shrinks as its cars load). */
  left: number;
  /** People who boarded so far. */
  taken = 0;
  private readonly weights = new Map<
    number,
    { weight: number; perMonth: number; destination: number }
  >();
  private readonly weightSum: number;

  constructor(state: GameState, train: Train, station: { id: number; tile: number }, pile: number) {
    const routes = state.stationEconomy.get(station.id)?.passengerRoutes ?? [];
    const { byStop, mine, total } = routesTo(state, station, upcomingStops(train));
    this.fraction = total > 0 ? Math.min(1, mine / total) : 0;
    const rate = (perMonth: number): number => perMonth / DAYS_PER_MONTH;
    const stock = new Map<number, number>(); // by town: people who arrived since the last train that carries them
    let stockAll = 0;
    for (const route of routes) {
      const people = rate(route.perMonth) * waitedDays(state, station.id, route.destination);
      stock.set(route.cityId, people);
      stockAll += people;
    }
    // The pile is what is really there: records that count more people than the pile holds (arrivals are added to the pile
    // once a day, a wait is counted by the hour) are scaled down to it, and people no record accounts for (an old pile) are
    // spread by demand.
    if (stockAll > pile && stockAll > 0) {
      const scale = pile / stockAll;
      for (const [city, people] of stock) stock.set(city, people * scale);
      stockAll = pile;
    }
    const rest = Math.max(0, pile - stockAll);
    // Which stop of this train serves each town.
    const stopOf = new Map<number, number>();
    for (const [stop] of byStop) {
      const cityId = state.stationEconomy.get(stop)?.passengerTownId;
      if (cityId !== undefined) stopOf.set(cityId, stop);
    }
    let sum = 0;
    for (const route of routes) {
      const stop = stopOf.get(route.cityId);
      if (stop === undefined) continue;
      const weight =
        (stock.get(route.cityId) ?? 0) + (total > 0 ? (rest * route.perMonth) / total : 0);
      this.weights.set(stop, { weight, perMonth: route.perMonth, destination: route.destination });
      sum += weight;
    }
    this.weightSum = sum;
    if (sum > 0) for (const [stop, w] of this.weights) this.shares.set(stop, w.weight / sum);
    else if (mine > 0)
      for (const [stop, perMonth] of byStop) this.shares.set(stop, perMonth / mine);
    this.left = Math.min(pile * this.fraction, sum);
  }

  /** People who would board now, of a pile of `amount`. */
  available(amount: number): number {
    return this.shares.size === 0 ? 0 : Math.min(amount, this.left);
  }

  /** Records what is left waiting after this loading pass: for each later stop, the people bound there who were not taken
   * (all of them keep their original wait, none left restart it now) as the tick since which they have waited. */
  recordWaiting(state: GameState, stationId: number): void {
    const boardedShare = this.weightSum > 0 ? Math.min(1, this.taken / this.weightSum) : 0;
    for (const w of this.weights.values()) {
      const leftBehind = w.weight * (1 - boardedShare);
      const days =
        leftBehind <= 1e-9 || w.perMonth <= 0
          ? 0
          : Math.min(MAX_WAIT_DAYS, leftBehind / (w.perMonth / DAYS_PER_MONTH));
      state.waitingSince.set(waitKey(stationId, w.destination), state.ticks - days * HOURS_PER_DAY);
    }
  }
}

/** What happens to a passenger lot aboard `train` when it calls at `stationId`: it arrives (its destination), stays on
 * (the train goes on towards it), or is stranded (no later stop of the train is its destination any more). */
export function lotFate(
  lot: PassengerLot,
  train: Train,
  stationId: number,
): "arrive" | "stay" | "stranded" {
  if (lot.dest === stationId) return "arrive";
  return upcomingStops(train).has(lot.dest) ? "stay" : "stranded";
}

/** Adds `add` to `lots`, merged with a lot of the same destination, origin and start. */
export function addLot(lots: PassengerLot[], add: PassengerLot): void {
  const same = lots.find(
    (l) => l.dest === add.dest && l.originTile === add.originTile && l.tick === add.tick,
  );
  if (same) same.amount += add.amount;
  else lots.push({ ...add });
}

/** Up to `room` people of the pile board `train`, within what `boarding` still allows; each picks a destination among the
 * train's later stops. Removes them from the pile. */
export function takePassengers(
  entry: StationCargoPile,
  boarding: Boarding,
  station: { tile: number },
  room: number,
  now: number,
): PassengerLot[] {
  const n = Math.min(boarding.available(entry.amount), room);
  if (n <= 1e-9) return [];
  const taken: PassengerLot[] = [];
  for (const [dest, share] of boarding.shares)
    addLot(taken, { dest, amount: n * share, originTile: station.tile, tick: now });
  entry.amount -= n;
  boarding.left -= n;
  boarding.taken += n;
  if (entry.amount < 1e-9) entry.amount = 0;
  return taken;
}
