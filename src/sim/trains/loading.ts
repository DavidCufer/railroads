/**
 * Loading/unloading and revenue (SPEC §7.2, §8.1). `stepLoading` is called once per tick while a
 * train's status is `"loading"` (src/sim/trains/movement.ts); it lazily computes the stop's dwell
 * time on first use, decrements it, and performs the actual unload/load batch (and, for "Wait for
 * full load", may loop for extra days) once it reaches zero.
 */
import {
  CARGO,
  cargoUnitFactor,
  EXPECTED_TILES_PER_DAY,
  MIN_REVENUE_DISTANCE_TILES,
  REVENUE_DISTANCE_TILES,
  type CargoType,
} from "../../data/cargo";
import { DIFFICULTY, eraInflation } from "../../data/finance";
import { INDUSTRIES } from "../../data/industries";
import {
  COLD_STORAGE_REVENUE_MULT,
  HOTEL_PASSENGER_REVENUE_MULT,
  POST_OFFICE_MAIL_REVENUE_MULT,
  STATION_TYPE_DEFS,
} from "../../data/stations";
import {
  DEFAULT_FULL_LOAD_MAX_WAIT_DAYS,
  MIN_LOADING_TICKS,
  OVERLENGTH_SLOWDOWN_MULT,
  TICKS_PER_CAR_HANDLED,
} from "../../data/trains";
import { addRevenue } from "../finance/ledger";
import { recordTrainRevenue } from "./profit";
import { accrueCityGrowthScore } from "../economy/cityGrowth";
import { getOrCreateIndustryEconomy } from "../economy/processing";
import { calendarFromTicks, HOURS_PER_DAY } from "../time";
import type { GameState, StationCargoPile } from "../state";
import type { Station } from "../stations/types";
import { hasImprovement, stationLoadSpeedMult, stationStorageCap } from "../stations/improvements";
import { stationAtTile, stationCatchmentTiles } from "../stations/placement";
import { tileXY } from "./geometry";
import type { Train, TrainCar, TrainOrder } from "./types";

interface LoadPlan {
  unload: number[];
  /** Cars whose cargo goes into the station's transfer stock (Warehouse hub, PLAN Phase 18 C). */
  transfer: number[];
  load: number[];
}

/** Units of `cargo` already in `station`'s transfer stock. */
export function transferUnits(state: GameState, stationId: number, cargo: CargoType): number {
  let total = 0;
  for (const lot of state.stationTransfer.get(stationId) ?? []) {
    if (lot.cargoType === cargo) total += lot.units;
  }
  return total;
}

/** Room left in a Warehouse's transfer stock for `cargo` (same per-cargo cap as its waiting pile). */
function transferRoom(state: GameState, station: Station, cargo: CargoType): number {
  if (!hasImprovement(station, "warehouse")) return 0;
  return Math.max(0, stationStorageCap(station, cargo) - transferUnits(state, station.id, cargo));
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
    // A "transfer" stop at a Warehouse takes any cargo (PLAN Phase 18 C): that is the whole point of
    // a feeder line, so the feeder must be willing to load what the hub itself doesn't demand.
    if (order.rule === "transfer") {
      const hub = state.stations.find((st) => st.id === order.stationId);
      if (hub && hasImprovement(hub, "warehouse")) return true;
    }
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
  const transfer: number[] = [];
  const load: number[] = [];
  const pile = state.stationCargo.get(station.id);
  const warehouse = hasImprovement(station, "warehouse");

  train.cars.forEach((car, i) => {
    if (car.loadedUnits <= 0) return;
    const demanded = accepts(state, station.id, car.cargoType);
    // Warehouse hub (PLAN Phase 18 C): a car goes into transfer stock when the stop is set to
    // "transfer", or when nothing here demands the cargo and no later stop of this train does
    // either (so it could never be delivered by this train). Overflow stays on the train.
    const toHub =
      warehouse &&
      transferRoom(state, station, car.cargoType) > 0 &&
      (order.rule === "transfer" ||
        (!demanded && !acceptedAtAnotherStop(state, train, car.cargoType)));
    if (toHub) transfer.push(i);
    else if (demanded) unload.push(i);
  });

  if (order.rule !== "unloadOnly") {
    train.cars.forEach((car, i) => {
      // A car being unloaded here is empty by the time loading runs (stepLoading applies all
      // unloads first), so it can be refilled at the same stop — otherwise every two-way route
      // (passenger/mail shuttles) left each station with the just-emptied cars running empty.
      const loadedAfterUnload = unload.includes(i) || transfer.includes(i) ? 0 : car.loadedUnits;
      // "Wait for full load" re-runs this plan on each extra wait day, so a partially loaded car
      // keeps topping up until it's full or the stop gives up (SPEC §7.2).
      if (loadedAfterUnload >= CARGO[car.cargoType].capacity) return;
      // Livestock Pens (SPEC §6.2): required to *load* livestock at this station (unaffected for
      // unloading/delivering it elsewhere).
      if (car.cargoType === "livestock" && !hasImprovement(station, "livestockPens")) return;
      const available =
        (pile?.[car.cargoType]?.amount ?? 0) +
        loadableTransfer(state, train, station, car.cargoType);
      // PLAN Phase 16 ("partial loading"): Auto loads whatever is waiting, not just a full carload
      // — a small town's trickle of supply used to never reach a full car and always left empty
      // (see PROGRESS.md's Phase 16 entry).
      if (available <= 0) return;
      if (!acceptedAtAnotherStop(state, train, car.cargoType)) return;
      load.push(i);
    });
  }

  return { unload, transfer, load };
}

/** Transfer stock at `station` this train may pick up (never its own drop). */
function loadableTransfer(
  state: GameState,
  train: Train,
  station: Station,
  cargo: CargoType,
): number {
  let total = 0;
  for (const lot of state.stationTransfer.get(station.id) ?? []) {
    if (lot.cargoType === cargo && lot.depositedByTrainId !== train.id) total += lot.units;
  }
  return total;
}

function computeDwellTicks(
  state: GameState,
  train: Train,
  station: Station,
  plan: LoadPlan,
): number {
  const handled = plan.unload.length + plan.transfer.length + plan.load.length;
  const overlength = train.cars.length > STATION_TYPE_DEFS[station.type].maxTrainLength;
  const perCar =
    TICKS_PER_CAR_HANDLED *
    stationLoadSpeedMult(station) *
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
  const expected = (distanceTiles / EXPECTED_TILES_PER_DAY) * def.urgency + 2;
  const timeFactor =
    days <= expected
      ? 1 + 0.25 * (1 - days / expected)
      : Math.max(0.2, 1 - (days - expected) / (def.decayDays * 2));
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  return (
    def.baseRate *
    (distanceTiles / REVENUE_DISTANCE_TILES) *
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

/** Normalizes `units` of `cargo` to the old cargo-agnostic 20-unit carload scale (see
 * `CARLOAD_UNITS`'s doc comment) — used only for goal/growth-score accounting, so a full car of
 * *any* cargo still counts the same as it did before Phase 16's real per-cargo capacities, and a
 * partial load counts proportionally. */
function carloadEquivalent(cargo: CargoType, units: number): number {
  return units / cargoUnitFactor(cargo);
}

function settleUnload(state: GameState, train: Train, station: Station, car: TrainCar): void {
  const cargo = car.cargoType;
  const unitsDelivered = car.loadedUnits;
  const distanceTiles =
    car.loadedTile !== undefined ? tileDistance(state.map.width, car.loadedTile, station.tile) : 0;

  if (distanceTiles >= MIN_REVENUE_DISTANCE_TILES && unitsDelivered > 0) {
    const days = (state.ticks - (car.loadedTick ?? state.ticks)) / HOURS_PER_DAY;
    // `computeRevenue` is still "per full carload" (SPEC §8.1's `base` rate) — PLAN Phase 16 pays
    // per unit instead, i.e. that same per-carload figure scaled by the fraction of a car actually
    // delivered (1.0 for a full car, same result as before real per-cargo capacities existed).
    let revenue =
      computeRevenue(state, cargo, distanceTiles, days) * (unitsDelivered / CARGO[cargo].capacity);

    // Post Office/Cold Storage (SPEC §6.2): bonus depends on where the cargo was *loaded*, not
    // where it's being delivered.
    const loadedStation =
      car.loadedTile !== undefined ? stationAtTile(state.stations, car.loadedTile) : undefined;
    if (cargo === "mail" && loadedStation && hasImprovement(loadedStation, "postOffice")) {
      revenue *= POST_OFFICE_MAIL_REVENUE_MULT;
    }
    if (
      (cargo === "food" || cargo === "livestock") &&
      loadedStation &&
      hasImprovement(loadedStation, "coldStorage")
    ) {
      revenue *= COLD_STORAGE_REVENUE_MULT;
    }
    // Hotel (SPEC §6.2): bonus depends on where it's *delivered* — this station.
    if (cargo === "passengers" && hasImprovement(station, "hotel")) {
      revenue *= HOTEL_PASSENGER_REVENUE_MULT;
    }

    state.cash += revenue;
    addRevenue(state, cargo, revenue);
    recordTrainRevenue(train, revenue);
    state.pendingDeliveries.push({
      stationId: station.id,
      cargoType: cargo,
      revenue,
      units: unitsDelivered,
    });
    const carloads = carloadEquivalent(cargo, unitsDelivered);
    accrueCityGrowthScore(state, station, cargo, carloads);
    // SPEC §11's `delivered` goal ("Deliver 1,000 carloads of coal in a year") counts a carload
    // the same moment it earns revenue — a delivery too short to pay out doesn't count either.
    state.cargoDeliveredThisYear[cargo] = (state.cargoDeliveredThisYear[cargo] ?? 0) + carloads;
  }

  car.loadedUnits = 0;
  delete car.loadedTile;
  delete car.loadedTick;

  for (const industryId of industriesConsuming(state, station, cargo)) {
    const econ = getOrCreateIndustryEconomy(state, industryId);
    econ.inputStock[cargo] = (econ.inputStock[cargo] ?? 0) + unitsDelivered;
  }
}

function applyUnload(state: GameState, train: Train, station: Station, carIndex: number): void {
  const car = train.cars[carIndex];
  if (!car) return;
  settleUnload(state, train, station, car);
}

/** Moves (as much as fits of) a car's cargo into the station's transfer stock. No revenue: the trip
 * is only paid when the cargo is finally delivered to a stop that demands it. */
function applyTransfer(state: GameState, train: Train, station: Station, carIndex: number): void {
  const car = train.cars[carIndex];
  if (!car || car.loadedUnits <= 0) return;
  const units = Math.min(car.loadedUnits, transferRoom(state, station, car.cargoType));
  if (units <= 0) return;
  const lots = state.stationTransfer.get(station.id) ?? [];
  const originTile = car.loadedTile ?? station.tile;
  const loadedTick = car.loadedTick ?? state.ticks;
  const same = lots.find(
    (l) =>
      l.cargoType === car.cargoType &&
      l.originTile === originTile &&
      l.loadedTick === loadedTick &&
      l.depositedByTrainId === train.id,
  );
  if (same) same.units += units;
  else {
    lots.push({
      cargoType: car.cargoType,
      units,
      originTile,
      loadedTick,
      depositedByTrainId: train.id,
      ...(stationAtTile(state.stations, originTile)
        ? { originStationId: (stationAtTile(state.stations, originTile) as Station).id }
        : {}),
    });
  }
  state.stationTransfer.set(station.id, lots);
  car.loadedUnits -= units;
  if (car.loadedUnits <= 0) {
    car.loadedUnits = 0;
    delete car.loadedTile;
    delete car.loadedTick;
  }
  state.pendingDeliveries.push({
    stationId: station.id,
    cargoType: car.cargoType,
    revenue: 0,
    units,
    transferred: true,
  });
}

/** Loads an empty car from the oldest transfer lots (not the train's own drop), so the car carries
 * the lot's original pickup tile and tick for the delivery revenue. */
function loadFromTransfer(state: GameState, train: Train, station: Station, car: TrainCar): void {
  const lots = state.stationTransfer.get(station.id);
  if (!lots || car.loadedUnits > 0) return;
  const capacity = CARGO[car.cargoType].capacity;
  for (const lot of lots) {
    if (lot.cargoType !== car.cargoType || lot.depositedByTrainId === train.id) continue;
    const amount = Math.min(lot.units, capacity - car.loadedUnits);
    if (amount <= 0) break;
    if (car.loadedUnits === 0) {
      car.loadedTile = lot.originTile;
      car.loadedTick = lot.loadedTick;
    }
    car.loadedUnits += amount;
    lot.units -= amount;
    break; // one origin per car: a car never mixes two different trips
  }
  const left = lots.filter((l) => l.units > 0.0001);
  if (left.length > 0) state.stationTransfer.set(station.id, left);
  else state.stationTransfer.delete(station.id);
}

/** Cargo left in a car removed by the "Edit cars" command (PLAN Phase 15: "dropped at the station —
 * counts as unloaded without payment unless accepted there"). Reuses the normal paid-delivery path
 * when the station happens to accept that cargo; otherwise just clears the load with no revenue or
 * side effects, since there's nowhere for it to go. */
export function dropCarCargo(
  state: GameState,
  train: Train,
  station: Station,
  car: TrainCar,
): void {
  if (car.loadedUnits <= 0) return;
  if (accepts(state, station.id, car.cargoType)) {
    settleUnload(state, train, station, car);
  } else {
    car.loadedUnits = 0;
    delete car.loadedTile;
    delete car.loadedTick;
  }
}

/** Installs a consist change queued by `editConsist` (src/sim/commands.ts) the moment the train
 * next stops at any station (PLAN Phase 15: "applied at the next station stop"), dropping cargo
 * from any car the change removes first. A no-op when nothing is queued. */
export function applyPendingConsist(state: GameState, train: Train, station: Station): void {
  const pending = train.pendingConsist;
  if (!pending) return;
  for (const car of pending.removedLoaded) dropCarCargo(state, train, station, car);
  train.cars = pending.cars;
  delete train.pendingConsist;
}

/** PLAN Phase 16: loads whatever is waiting, up to however much room is left in the car — not just
 * a full carload — so a station whose supply never piles up to a full car (a small town's trickle
 * of passengers, say) still gets picked up instead of leaving the car empty forever. */
function applyLoad(state: GameState, train: Train, station: Station, carIndex: number): void {
  const car = train.cars[carIndex];
  if (!car) return;
  loadFromTransfer(state, train, station, car);
  const capacity = CARGO[car.cargoType].capacity;
  const room = capacity - car.loadedUnits;
  if (room <= 0) return;
  const pile = state.stationCargo.get(station.id);
  const entry: StationCargoPile | undefined = pile?.[car.cargoType];
  if (!entry || entry.amount <= 0) return;

  const amount = Math.min(entry.amount, room);
  entry.amount -= amount;
  entry.waitingDays = 0;
  if (car.loadedUnits === 0) {
    car.loadedTile = station.tile;
    car.loadedTick = state.ticks;
  }
  car.loadedUnits += amount;
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
  for (const i of plan.transfer) applyTransfer(state, train, station, i);
  for (const i of plan.load) applyLoad(state, train, station, i);

  if (order.rule === "fullLoad") {
    const allFull = train.cars.every((c) => c.loadedUnits >= CARGO[c.cargoType].capacity);
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
