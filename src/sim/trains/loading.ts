/**
 * Loading/unloading and revenue (SPEC §7.2, §8.1). `stepLoading` is called once per tick while a
 * train's status is `"loading"` (src/sim/trains/movement.ts); it lazily computes the stop's dwell
 * time on first use, decrements it, and performs the actual unload/load batch (and, for "Wait for
 * full load", may loop for extra days) once it reaches zero.
 */
import { CARGO, CARLOAD_UNITS, MIN_REVENUE_DISTANCE_TILES, type CargoType } from "../../data/cargo";
import { DIFFICULTY, eraInflation } from "../../data/finance";
import { INDUSTRIES } from "../../data/industries";
import { STATION_TYPE_DEFS } from "../../data/stations";
import {
  DEFAULT_FULL_LOAD_MAX_WAIT_DAYS,
  MIN_LOADING_TICKS,
  OVERLENGTH_SLOWDOWN_MULT,
  TICKS_PER_CAR_HANDLED,
} from "../../data/trains";
import { addRevenue } from "../finance/ledger";
import { getOrCreateIndustryEconomy } from "../economy/processing";
import { calendarFromTicks, HOURS_PER_DAY } from "../time";
import type { GameState, StationCargoPile } from "../state";
import type { Station } from "../stations/types";
import { stationCatchmentTiles } from "../stations/placement";
import { tileXY } from "./geometry";
import type { Train, TrainOrder } from "./types";

interface LoadPlan {
  unload: number[];
  load: number[];
}

function accepts(state: GameState, stationId: number, cargo: CargoType): boolean {
  return state.stationEconomy.get(stationId)?.accepts.includes(cargo) ?? false;
}

/** Whether `cargo` is accepted at some *other* stop in the train's order list — the "Auto"/"Wait
 * for full load" rule only loads cargo this train can actually deliver somewhere (SPEC §7.2). */
function acceptedAtAnotherStop(state: GameState, train: Train, cargo: CargoType): boolean {
  const n = train.orders.length;
  for (let step = 1; step < n; step++) {
    const order = train.orders[(train.currentOrderIndex + step) % n] as TrainOrder;
    if (accepts(state, order.stationId, cargo)) return true;
  }
  return false;
}

function planLoadUnload(
  state: GameState,
  train: Train,
  station: Station,
  order: TrainOrder,
): LoadPlan {
  const unload: number[] = [];
  const load: number[] = [];
  const pile = state.stationCargo.get(station.id);

  train.cars.forEach((car, i) => {
    if (car.loaded && accepts(state, station.id, car.cargoType)) unload.push(i);
  });

  if (order.rule !== "unloadOnly") {
    train.cars.forEach((car, i) => {
      if (car.loaded || unload.includes(i)) return;
      const available = pile?.[car.cargoType]?.amount ?? 0;
      if (available < CARLOAD_UNITS) return;
      if (!acceptedAtAnotherStop(state, train, car.cargoType)) return;
      load.push(i);
    });
  }

  return { unload, load };
}

function computeDwellTicks(
  state: GameState,
  train: Train,
  station: Station,
  plan: LoadPlan,
): number {
  const handled = plan.unload.length + plan.load.length;
  const overlength = train.cars.length > STATION_TYPE_DEFS[station.type].maxTrainLength;
  const perCar =
    TICKS_PER_CAR_HANDLED *
    STATION_TYPE_DEFS[station.type].loadSpeedMult *
    (overlength ? OVERLENGTH_SLOWDOWN_MULT : 1);
  return Math.max(MIN_LOADING_TICKS, Math.round(handled * perCar));
}

export function computeRevenue(
  state: GameState,
  cargo: CargoType,
  distanceTiles: number,
  days: number,
): number {
  const def = CARGO[cargo];
  const expected = (distanceTiles / 2) * def.urgency + 2;
  const timeFactor =
    days <= expected
      ? 1 + 0.25 * (1 - days / expected)
      : Math.max(0.2, 1 - (days - expected) / (def.decayDays * 2));
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  return (
    def.baseRate *
    (distanceTiles / 10) *
    timeFactor *
    eraInflation(year) *
    DIFFICULTY[state.difficulty].revenueMult
  );
}

function tileDistance(mapWidth: number, a: number, b: number): number {
  const [ax, ay] = tileXY(a, mapWidth);
  const [bx, by] = tileXY(b, mapWidth);
  return Math.hypot(ax - bx, ay - by);
}

/** Industries in `station`'s catchment that consume `cargo` (SPEC §8.2: delivered inputs feed
 * processing, on top of the revenue the delivery itself always earns). */
function industriesConsuming(state: GameState, station: Station, cargo: CargoType): number[] {
  const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
  const tiles = new Set(stationCatchmentTiles(state.map, station.tile, radius));
  const ids: number[] = [];
  for (const industry of state.industries) {
    const tile = industry.y * state.map.width + industry.x;
    if (!tiles.has(tile)) continue;
    if (INDUSTRIES[industry.type].consumes[cargo] !== undefined) ids.push(industry.id);
  }
  return ids;
}

function applyUnload(state: GameState, train: Train, station: Station, carIndex: number): void {
  const car = train.cars[carIndex];
  if (!car) return;
  const cargo = car.cargoType;
  const distanceTiles =
    car.loadedTile !== undefined ? tileDistance(state.map.width, car.loadedTile, station.tile) : 0;

  if (distanceTiles >= MIN_REVENUE_DISTANCE_TILES) {
    const days = (state.ticks - (car.loadedTick ?? state.ticks)) / HOURS_PER_DAY;
    const revenue = computeRevenue(state, cargo, distanceTiles, days);
    state.cash += revenue;
    addRevenue(state, cargo, revenue);
    state.pendingDeliveries.push({ stationId: station.id, cargoType: cargo, revenue });
  }

  car.loaded = false;
  delete car.loadedTile;
  delete car.loadedTick;

  for (const industryId of industriesConsuming(state, station, cargo)) {
    const econ = getOrCreateIndustryEconomy(state, industryId);
    econ.inputStock[cargo] = (econ.inputStock[cargo] ?? 0) + CARLOAD_UNITS;
  }
}

function applyLoad(state: GameState, train: Train, station: Station, carIndex: number): void {
  const car = train.cars[carIndex];
  if (!car) return;
  const pile = state.stationCargo.get(station.id);
  const entry: StationCargoPile | undefined = pile?.[car.cargoType];
  if (!entry || entry.amount < CARLOAD_UNITS) return;

  entry.amount -= CARLOAD_UNITS;
  entry.waitingDays = 0;
  car.loaded = true;
  car.loadedTile = station.tile;
  car.loadedTick = state.ticks;
}

/** Advances one tick of a "loading" stop at `station`; returns true once the train is ready to
 * depart (its `currentOrderIndex` should then advance and it can resume moving). */
export function stepLoading(state: GameState, train: Train, station: Station): boolean {
  const order = train.orders[train.currentOrderIndex];
  if (!order || order.rule === "passThrough") return true;

  if (train.loadTicksLeft < 0) {
    const plan = planLoadUnload(state, train, station, order);
    train.loadTicksLeft = computeDwellTicks(state, train, station, plan);
  }
  if (train.loadTicksLeft > 0) {
    train.loadTicksLeft--;
    return false;
  }

  const plan = planLoadUnload(state, train, station, order);
  for (const i of plan.unload) applyUnload(state, train, station, i);
  for (const i of plan.load) applyLoad(state, train, station, i);

  if (order.rule === "fullLoad") {
    const allFull = train.cars.every((c) => c.loaded);
    const maxWait = order.maxWaitDays ?? DEFAULT_FULL_LOAD_MAX_WAIT_DAYS;
    if (!allFull && train.loadExtraWaitDays < maxWait) {
      train.loadExtraWaitDays++;
      train.loadTicksLeft = HOURS_PER_DAY;
      return false;
    }
  }

  train.loadTicksLeft = -1;
  return true;
}
