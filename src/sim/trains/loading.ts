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
import { DIFFICULTY } from "../../data/finance";
import { competitionLoss, fareIndex } from "../../data/economy";
import { KM_PER_TILE } from "../../data/scale";
import { INDUSTRIES, inputStorageCap } from "../../data/industries";
import {
  COLD_STORAGE_REVENUE_MULT,
  HOTEL_PASSENGER_REVENUE_MULT,
  POST_OFFICE_MAIL_REVENUE_MULT,
  STATION_TYPE_DEFS,
} from "../../data/stations";
import {
  DEFAULT_FULL_LOAD_MAX_WAIT_DAYS,
  MIN_LOADING_TICKS,
  SERVICE_DELAY_TICKS,
  OVERLENGTH_SLOWDOWN_MULT,
  locomotiveById,
  TICKS_PER_CAR_HANDLED,
} from "../../data/trains";
import { addRevenue } from "../finance/ledger";
import { boardable, takeBoarders } from "../stations/boarding";
import { recordDelivered, recordLoadedRevenue, recordSent } from "../stations/flow";
import { recordTrainRevenue } from "./profit";
import { accrueCityGrowthScore } from "../economy/cityGrowth";
import { cityTileAcceptance } from "../economy/cityStats";
import { getOrCreateIndustryEconomy, inputFull } from "../economy/processing";
import { calendarFromTicks, HOURS_PER_DAY } from "../time";
import type { DeliveryEvent, GameState, StationCargoPile } from "../state";
import type { Station } from "../stations/types";
import { hasImprovement, stationLoadSpeedMult, transferStorageCap } from "../stations/improvements";
import { stationAtTile, stationCatchmentTiles } from "../stations/placement";
import { tileXY } from "./geometry";
import type { Train, TrainCar, TrainOrder } from "./types";

/** A train waits at most this many headways for its departure slot (a queue of trains cannot stall for ever). */
const HEADWAY_QUEUE_MAX = 4;

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
  return Math.max(0, transferStorageCap(station, cargo) - transferUnits(state, station.id, cargo));
}

function accepts(state: GameState, stationId: number, cargo: CargoType): boolean {
  if (!(state.stationEconomy.get(stationId)?.accepts.includes(cargo) ?? false)) return false;
  return !refusedByFullProcessors(state, stationId, cargo);
}

/** True when the only takers of `cargo` here are processors whose stockpile is full (PLAYTEST-3 B2): the cargo is
 * not unloaded, not paid, and not loaded for this stop. A city tile that accepts it (lumber, steel) still does. */
function refusedByFullProcessors(state: GameState, stationId: number, cargo: CargoType): boolean {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return false;
  const consumers = industriesConsuming(state, station, cargo);
  if (consumers.length === 0) return false;
  for (const id of consumers) {
    const industry = state.industries[id];
    if (industry && !inputFull(state, industry, cargo)) return false;
  }
  const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  for (const tile of stationCatchmentTiles(state.map, station.tile, radius)) {
    const cityId = state.map.cityId[tile] as number;
    const city = cityId >= 0 ? state.cities[cityId] : undefined;
    if (city && cityTileAcceptance(city.tier, year)[cargo] !== undefined) return false;
  }
  return true;
}

/** Whether `cargo` is accepted at some *other* stop in the train's order list — the "Auto"/"Wait
 * for full load" rule only loads cargo this train can actually deliver somewhere (SPEC §7.2). */
function acceptedAtAnotherStop(state: GameState, train: Train, cargo: CargoType): boolean {
  return acceptedOnRoute(state, train.orders, train.currentOrderIndex, cargo, 1);
}

/** Whether some stop of the train's orders (all of them) takes `cargo`, or a transfer stop at a
 * Warehouse hub would keep it — false means a car carrying it can never be delivered. */
export function acceptedAtAnyStop(state: GameState, train: Train, cargo: CargoType): boolean {
  return acceptedOnRoute(state, train.orders, train.currentOrderIndex, cargo, 0);
}

/** Same question for an order list that no train owns yet (the Buy Train route step, Phase 33). */
export function acceptedByOrders(
  state: GameState,
  orders: readonly TrainOrder[],
  cargo: CargoType,
): boolean {
  return acceptedOnRoute(state, orders, 0, cargo, 0);
}

function acceptedOnRoute(
  state: GameState,
  orders: readonly TrainOrder[],
  current: number,
  cargo: CargoType,
  from: number,
): boolean {
  const n = orders.length;
  for (let step = from; step < n; step++) {
    const order = orders[(current + step) % n] as TrainOrder;
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

  // Bug 1 (PLAYTEST-2): "Wait for full load" re-plans on every extra wait day. Cars are only
  // unloaded on the first pass of a stop, and never at the station they were loaded at.
  const firstPass = train.loadExtraWaitDays === 0 && !train.headwayHold;
  train.cars.forEach((car, i) => {
    if (car.loadedUnits <= 0 || !firstPass) return;
    if (car.loadedTile === station.tile) return;
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
      const waiting = pile?.[car.cargoType];
      const available =
        (waiting ? boardable(waiting, train, station.id) : 0) +
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

/** Transit days after which a delivery of `cargo` over `distanceTiles` still gets its full fare (no time bonus or
 * penalty), as `computeRevenue` reckons it. */
export function expectedTransitDays(cargo: CargoType, distanceTiles: number): number {
  return (distanceTiles / EXPECTED_TILES_PER_DAY) * CARGO[cargo].urgency + 2;
}

export function computeRevenue(
  state: GameState,
  cargo: CargoType,
  distanceTiles: number,
  days: number,
  /** Top speed of the carrying locomotive, km/h: fast trains win back passengers from road and air. */
  trainKmh = 0,
): number {
  const def = CARGO[cargo];
  const expected = expectedTransitDays(cargo, distanceTiles);
  const timeFactor =
    days <= expected
      ? 1 + 0.25 * (1 - days / expected)
      : Math.max(0.2, 1 - (days - expected) / (def.decayDays * 2));
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  return (
    def.baseRate *
    (distanceTiles / REVENUE_DISTANCE_TILES) *
    timeFactor *
    fareIndex(year, cargo) *
    (1 - competitionLoss(year, cargo, distanceTiles * KM_PER_TILE, trainKmh)) *
    DIFFICULTY[state.difficulty].revenueMult
  );
}

function tileDistance(mapWidth: number, a: number, b: number): number {
  const [ax, ay] = tileXY(a, mapWidth);
  const [bx, by] = tileXY(b, mapWidth);
  return Math.hypot(ax - bx, ay - by);
}

/** Phase 40: where the ore behind the long-haul chain's final cargo `cargo` was loaded — the origin its processor
 * recorded from the last delivery of ore, found through the processors in `station`'s catchment that make it. */
function chainOreOrigin(state: GameState, station: Station, cargo: CargoType): number | undefined {
  const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
  const tiles = new Set(stationCatchmentTiles(state.map, station.tile, radius));
  for (const industry of state.industries) {
    if (!tiles.has(industry.y * state.map.width + industry.x)) continue;
    const def = INDUSTRIES[industry.type];
    if ((def.produces[cargo] ?? 0) <= 0 || Object.keys(def.consumes).length === 0) continue;
    const origin = state.industryEconomy.get(industry.id)?.oreOriginTile;
    if (origin !== undefined) return origin;
  }
  return undefined;
}

/** Empties a car's load record. */
function clearLoad(car: TrainCar): void {
  car.loadedUnits = 0;
  delete car.loadedTile;
  delete car.loadedTick;
  delete car.oreOriginTile;
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

/** Queues a delivery event, folding it into the event already queued for the same train, station,
 * cargo type and tick (one unload pass) — a mixed train produces one label per cargo type, not one
 * per car (PLAN Phase 25A). */
function queueDelivery(state: GameState, train: Train, event: DeliveryEvent): void {
  const same = state.pendingDeliveries.find(
    (e) =>
      e.trainId === train.id &&
      e.tick === state.ticks &&
      e.stationId === event.stationId &&
      e.cargoType === event.cargoType &&
      !!e.transferred === !!event.transferred,
  );
  if (same) {
    same.revenue += event.revenue;
    if (event.units !== undefined) same.units = (same.units ?? 0) + event.units;
    return;
  }
  state.pendingDeliveries.push({ ...event, trainId: train.id, tick: state.ticks });
}

function settleUnload(state: GameState, train: Train, station: Station, car: TrainCar): void {
  const cargo = car.cargoType;
  const unitsDelivered = car.loadedUnits;
  // Phase 40: a chain's final cargo pays by the distance from its ore's origin; its ore (the intermediate leg) pays
  // nothing and only hands its origin on to the processor.
  const origin = car.oreOriginTile ?? car.loadedTile;
  const distanceTiles =
    origin !== undefined ? tileDistance(state.map.width, origin, station.tile) : 0;
  const pays = CARGO[cargo].chainLeg !== "intermediate";

  let deliveredRevenue = 0;
  if (pays && distanceTiles >= MIN_REVENUE_DISTANCE_TILES && unitsDelivered > 0) {
    const days = (state.ticks - (car.loadedTick ?? state.ticks)) / HOURS_PER_DAY;
    // `computeRevenue` is still "per full carload" (SPEC §8.1's `base` rate) — PLAN Phase 16 pays
    // per unit instead, i.e. that same per-carload figure scaled by the fraction of a car actually
    // delivered (1.0 for a full car, same result as before real per-cargo capacities existed).
    let revenue =
      computeRevenue(
        state,
        cargo,
        distanceTiles,
        days,
        locomotiveById(train.locoModelId)?.maxSpeedKmh ?? 0,
      ) *
      (unitsDelivered / CARGO[cargo].capacity);

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

    deliveredRevenue = revenue;
    state.cash += revenue;
    addRevenue(state, cargo, revenue);
    if (loadedStation) recordLoadedRevenue(state, loadedStation.id, cargo, unitsDelivered, revenue);
    recordTrainRevenue(train, revenue);
    queueDelivery(state, train, {
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

  if (unitsDelivered > 0)
    recordDelivered(state, station.id, cargo, unitsDelivered, deliveredRevenue);

  clearLoad(car);

  for (const industryId of industriesConsuming(state, station, cargo)) {
    const econ = getOrCreateIndustryEconomy(state, industryId);
    if (!pays && unitsDelivered > 0 && origin !== undefined) econ.oreOriginTile = origin;
    const industry = state.industries[industryId];
    const cap = industry ? inputStorageCap(INDUSTRIES[industry.type], cargo) : Infinity;
    econ.inputStock[cargo] = Math.min(cap, (econ.inputStock[cargo] ?? 0) + unitsDelivered);
    const month = (econ.receivedMonth ??= {});
    month[cargo] = (month[cargo] ?? 0) + unitsDelivered;
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
      l.oreOriginTile === car.oreOriginTile &&
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
      ...(car.oreOriginTile !== undefined ? { oreOriginTile: car.oreOriginTile } : {}),
      depositedByTrainId: train.id,
      ...(stationAtTile(state.stations, originTile)
        ? { originStationId: (stationAtTile(state.stations, originTile) as Station).id }
        : {}),
    });
  }
  state.stationTransfer.set(station.id, lots);
  car.loadedUnits -= units;
  if (car.loadedUnits <= 0) clearLoad(car);
  queueDelivery(state, train, {
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
      if (lot.oreOriginTile !== undefined) car.oreOriginTile = lot.oreOriginTile;
      else delete car.oreOriginTile;
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
    clearLoad(car);
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

  const amount = Math.min(boardable(entry, train, station.id), room);
  if (amount <= 0) return;
  takeBoarders(entry, train, station.id, amount);
  entry.waitingDays = 0;
  if (car.loadedUnits === 0) {
    car.loadedTile = station.tile;
    car.loadedTick = state.ticks;
    const ore =
      CARGO[car.cargoType].chainLeg === "final"
        ? chainOreOrigin(state, station, car.cargoType)
        : undefined;
    if (ore !== undefined) car.oreOriginTile = ore;
    else delete car.oreOriginTile;
  }
  car.loadedUnits += amount;
  recordSent(state, station.id, car.cargoType, amount);
}

/** Advances one tick of a "loading" stop at `station`; returns true once the train is ready to
 * depart (its `currentOrderIndex` should then advance and it can resume moving). */
export function stepLoading(state: GameState, train: Train, station: Station): boolean {
  const order = train.orders[train.currentOrderIndex];
  if (!order || order.rule === "passThrough") return true;

  if (train.loadTicksLeft < 0) {
    const plan = planLoadUnload(state, train, station, order);
    train.loadTicksLeft =
      computeDwellTicks(state, train, station, plan) +
      (train.servicePending ? SERVICE_DELAY_TICKS : 0);
    delete train.servicePending;
  }
  if (train.loadTicksLeft > 0) {
    train.loadTicksLeft--;
    return false;
  }

  const plan = planLoadUnload(state, train, station, order);
  for (const i of plan.unload) applyUnload(state, train, station, i);
  for (const i of plan.transfer) applyTransfer(state, train, station, i);

  // Departure spacing (Phase 30A): hold the train — already unloaded, not yet loaded, so the people keep
  // collecting for the train that actually leaves — until the headway since the last departure has passed.
  if (order.minGapDays !== undefined && order.minGapDays > 0) {
    const sinceLast =
      station.lastDepartureTick === undefined
        ? Infinity
        : (state.ticks - station.lastDepartureTick) / HOURS_PER_DAY;
    const waited = train.headwayWaitTicks ?? 0;
    if (
      sinceLast < order.minGapDays &&
      waited < order.minGapDays * HOURS_PER_DAY * HEADWAY_QUEUE_MAX
    ) {
      train.headwayHold = true;
      train.headwayWaitTicks = waited + 1;
      train.loadTicksLeft = 0;
      return false;
    }
  }
  delete train.headwayHold;
  delete train.headwayWaitTicks;

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
  station.lastDepartureTick = state.ticks;
  return true;
}
