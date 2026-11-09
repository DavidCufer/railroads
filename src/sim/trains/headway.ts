/**
 * Even spacing of trains on a line (PLAN Phase 34 item 9): an estimate of a train's round-trip time and the
 * departure gap that spreads `n` trains of a line evenly around it. Pure; the command that applies the gap is
 * `spaceTrainsEvenly` in src/sim/commands.ts.
 */
import { MAX_WAIT_DAYS } from "../../data/economy";
import {
  MIN_LOADING_TICKS,
  TICKS_PER_CAR_HANDLED,
  TICKS_PER_TILE_DIVISOR,
  locomotiveById,
  turnaroundTicks,
} from "../../data/trains";
import type { GameState } from "../state";
import { DAYS_PER_MONTH, HOURS_PER_DAY } from "../time";
import { carCapacity } from "./capacity";
import { octileTileDistance } from "./geometry";
import type { Train } from "./types";

/** Track is rarely a straight line, curves and junctions cost speed: legs are 15 % longer than the crow flies and the
 * train averages 75 % of its top speed. */
const DETOUR = 1.15;
export const AVERAGE_SPEED_SHARE = 0.75;

/** The steps the per-stop stepper offers, in days (Off = undefined). */
export const GAP_STEPS: readonly (number | undefined)[] = [
  undefined,
  1,
  2,
  3,
  5,
  7,
  10,
  14,
  21,
  30,
];

/** Whether a train with these orders reverses at order `i`: the stop before and the stop after are the same station
 * (every stop of a two-stop shuttle, the ends of a there-and-back line). Intermediate stops and loops do not. */
export function reversesAtOrder(orders: Train["orders"], i: number): boolean {
  const n = orders.length;
  if (n < 2) return false;
  const at = (k: number): number => (orders[(k + n) % n] as { stationId: number }).stationId;
  return at(i - 1) === at(i + 1) && at(i - 1) !== at(i);
}

/** Share of a passenger train's cars that have people in them at a stop, known ahead from the route demand (0 to 1).
 * The real rule (`planLoadUnload`, `computeDwellTicks` in loading.ts) charges one handling per car unloaded plus one per car
 * loaded, so a thinly loaded train stands far shorter than "every car twice": cars fill in order, and only the occupied
 * ones are unloaded and refilled. A measured five-stop line shows the same dwell at the ends and in the middle, so the
 * share does not depend on which stop it is, only on the people: what the train's stops send to each other (the routes of
 * `passengerRoutes`), shared between the passenger trains that call at them in proportion to their seats, per visit.
 * A train that carries no passengers, or has no route demand yet, counts as full (the old estimate). */
export function passengerFill(state: GameState, train: Train): number {
  const seats = train.cars.reduce(
    (u, c) => u + (c.cargoType === "passengers" ? carCapacity(c) : 0),
    0,
  );
  if (seats <= 0) return 1;
  const visits = train.orders.filter((o) => o.rule !== "passThrough");
  const stops = new Set(visits.map((o) => o.stationId));
  if (stops.size < 2) return 1;
  let perMonth = 0;
  for (const a of stops)
    for (const r of state.stationEconomy.get(a)?.passengerRoutes ?? [])
      if (stops.has(r.destination)) perMonth += r.perMonth;
  if (perMonth <= 0) return 1;
  // Every passenger train that calls at two or more of these stops shares the same people, by seats.
  let allSeats = 0;
  for (const t of state.trains) {
    if (t.laidUp) continue;
    const calls = new Set(t.orders.filter((o) => o.rule !== "passThrough").map((o) => o.stationId));
    let shared = 0;
    for (const id of calls) if (stops.has(id)) shared++;
    if (shared < 2) continue;
    allSeats += t.cars.reduce((u, c) => u + (c.cargoType === "passengers" ? carCapacity(c) : 0), 0);
  }
  const share = allSeats > 0 ? Math.min(1, seats / allSeats) : 1;
  // People arrive for a round trip, but a pile holds only `MAX_WAIT_DAYS` of them between two visits to a stop.
  const rt = roundTripDays(state, train, 1);
  const days = Math.min(rt, (MAX_WAIT_DAYS * visits.length) / stops.size);
  const perVisit = (share * (perMonth / DAYS_PER_MONTH) * days) / visits.length;
  return Math.min(1, perVisit / seats);
}

/** Hours a train dwells at a stop it loads at, as the real rule (`computeDwellTicks`) will charge: one handling per car
 * with people unloaded and one per car refilled. Freight and mail trains: every car twice (what a full train does). */
export function stopDwellHours(state: GameState, train: Train, fill?: number): number {
  const cars = train.cars.length;
  const f =
    fill ??
    (train.cars.some((c) => c.cargoType === "passengers") ? passengerFill(state, train) : 1);
  const occupied = Math.min(cars, Math.ceil(f * cars));
  return Math.max(MIN_LOADING_TICKS, occupied * 2 * TICKS_PER_CAR_HANDLED);
}

/** Days a train needs to run all its stops once and arrive back at the first: running time plus a dwell per stop. */
export function estimateRoundTripDays(state: GameState, train: Train): number {
  return roundTripDays(state, train);
}

/** `estimateRoundTripDays` with the stop time of a given fill (undefined: worked out from the demand). */
function roundTripDays(state: GameState, train: Train, fill?: number): number {
  const loco = locomotiveById(train.locoModelId);
  const kmh = Math.max(10, (loco?.maxSpeedKmh ?? 40) * AVERAGE_SPEED_SHARE);
  // The sim moves a train `speed / TICKS_PER_TILE_DIVISOR` tiles an hour (data/trains.ts), not its real-world km/h:
  // Phase 51 found the old km-per-tile figure ~50x too fast (3.3-day round trip where the sim takes ~50).
  const tilesPerHour = kmh / TICKS_PER_TILE_DIVISOR;
  const stops = train.orders.filter((o) => o.rule !== "passThrough");
  let tiles = 0;
  for (let i = 0; i < train.orders.length; i++) {
    const a = state.stations.find((s) => s.id === train.orders[i]?.stationId);
    const b = state.stations.find(
      (s) => s.id === train.orders[(i + 1) % train.orders.length]?.stationId,
    );
    if (a && b) tiles += octileTileDistance(a.tile, b.tile, state.map.width) * DETOUR;
  }
  let turnHours = 0;
  for (let i = 0; i < train.orders.length; i++)
    if (loco && train.orders[i]?.rule !== "passThrough" && reversesAtOrder(train.orders, i))
      turnHours += turnaroundTicks(loco);
  const dwellHours = stops.length * stopDwellHours(state, train, fill) + turnHours;
  return (tiles / tilesPerHour + dwellHours) / HOURS_PER_DAY;
}

/** Gap in whole days between departures that spaces `count` trains evenly around `roundTripDays` (at least 1). */
export function evenGapDays(roundTripDays: number, count: number): number {
  return Math.max(1, Math.round(roundTripDays / Math.max(1, count)));
}
