/**
 * Even spacing of trains on a line (PLAN Phase 34 item 9): an estimate of a train's round-trip time and the
 * departure gap that spreads `n` trains of a line evenly around it. Pure; the command that applies the gap is
 * `spaceTrainsEvenly` in src/sim/commands.ts.
 */
import {
  MIN_LOADING_TICKS,
  TICKS_PER_CAR_HANDLED,
  TICKS_PER_TILE_DIVISOR,
  locomotiveById,
  turnaroundTicks,
} from "../../data/trains";
import type { GameState } from "../state";
import { HOURS_PER_DAY } from "../time";
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

/** Hours a train dwells at a stop it loads at: the same figure `estimateRoundTripDays` uses. */
export function stopDwellHours(train: Train): number {
  return Math.max(MIN_LOADING_TICKS, train.cars.length * 2 * TICKS_PER_CAR_HANDLED);
}

/** Days a train needs to run all its stops once and arrive back at the first: running time plus a dwell per stop. */
export function estimateRoundTripDays(state: GameState, train: Train): number {
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
  const dwellHours = stops.length * stopDwellHours(train) + turnHours;
  return (tiles / tilesPerHour + dwellHours) / HOURS_PER_DAY;
}

/** Gap in whole days between departures that spaces `count` trains evenly around `roundTripDays` (at least 1). */
export function evenGapDays(roundTripDays: number, count: number): number {
  return Math.max(1, Math.round(roundTripDays / Math.max(1, count)));
}
