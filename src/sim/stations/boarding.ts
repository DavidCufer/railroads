/**
 * Who boards a train (PLAN Phase 54, SPEC §8.1). One pile of waiting passengers per station. A calling train takes the
 * people heading for the towns it stops at: at most the pile x (gravity weight of the towns of its later stops / gravity
 * weight of every town the station's trains reach), so an express that skips the small towns does not carry the people
 * who wanted them. Those who board split over the train's later stops by gravity and pay per distance on arrival.
 */
import type { GameState, PassengerLot, StationCargoPile } from "../state";
import { octileTileDistance } from "../trains/geometry";
import { passengerNetwork } from "./destinations";
import { gravityWeight } from "./passengerFlows";
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

/** Gravity weight of every town a set of stops stands for, seen from `station`, and the stop that serves each town (the
 * nearest). One entry per town: two stops in one town are one destination. */
function townWeights(
  state: GameState,
  station: { id: number; tile: number },
  stops: Iterable<number>,
): Map<number, { weight: number; stop: number }> {
  const here = state.stationEconomy.get(station.id)?.passengerTownId;
  const result = new Map<number, { weight: number; stop: number; dist: number }>();
  for (const stopId of [...stops].sort((a, b) => a - b)) {
    if (stopId === station.id) continue;
    const stop = state.stations.find((s) => s.id === stopId);
    const cityId = state.stationEconomy.get(stopId)?.passengerTownId;
    const city = cityId === undefined ? undefined : state.cities[cityId];
    if (!stop || !city || cityId === here) continue;
    const dist = octileTileDistance(station.tile, stop.tile, state.map.width);
    const known = result.get(city.id);
    if (!known || dist < known.dist)
      result.set(city.id, {
        weight: gravityWeight(
          city.population,
          octileTileDistance(
            station.tile,
            city.anchorY * state.map.width + city.anchorX,
            state.map.width,
          ),
        ),
        stop: stopId,
        dist,
      });
  }
  return result;
}

/** Part of the station's pile that is bound for the towns of `stops`: their gravity weight / the weight of every town the
 * station's trains reach. */
export function pileShareFor(
  state: GameState,
  station: { id: number; tile: number },
  stops: Iterable<number>,
): number {
  let mine = 0;
  for (const t of townWeights(state, station, stops).values()) mine += t.weight;
  let all = 0;
  for (const t of townWeights(
    state,
    station,
    passengerNetwork(state).get(station.id) ?? [],
  ).values())
    all += t.weight;
  return all > 0 ? Math.min(1, mine / all) : 0;
}

/** What one calling train may take from the station's pile and where those people go. Built once per stop. */
export class Boarding {
  /** Share of the people who board that ride to each later stop (sums to 1; empty when no later stop has a town). */
  readonly shares = new Map<number, number>();
  /** Part of the pile this train takes: its towns' weight / the weight of all towns the station's trains reach. */
  readonly fraction: number;
  /** People of the pile this train may still take at this stop (shrinks as its cars load). */
  left: number;

  constructor(state: GameState, train: Train, station: { id: number; tile: number }, pile: number) {
    const mine = townWeights(state, station, upcomingStops(train));
    let total = 0;
    for (const t of mine.values()) total += t.weight;
    if (total > 0) for (const t of mine.values()) this.shares.set(t.stop, t.weight / total);
    let all = 0;
    for (const t of townWeights(
      state,
      station,
      passengerNetwork(state).get(station.id) ?? [],
    ).values())
      all += t.weight;
    this.fraction = all > 0 ? Math.min(1, total / all) : 0;
    this.left = pile * this.fraction;
  }

  /** People who would board now, of a pile of `amount`. */
  available(amount: number): number {
    return this.shares.size === 0 ? 0 : Math.min(amount, this.left);
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
  if (entry.amount < 1e-9) entry.amount = 0;
  return taken;
}
