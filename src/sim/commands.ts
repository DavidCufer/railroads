/**
 * All player-triggered state changes go through here (CLAUDE.md hard rule; SPEC §12). Each
 * command validates money/terrain/era and returns `{ok: true, cost}` or `{ok: false, reason}` —
 * `reason` is a code, not user-facing text (src/sim must stay DOM/UI-free); the UI maps it to a
 * string from `ui/strings.ts` and shows it as a toast. `cost` is the cash delta applied: positive
 * when charged, negative when refunded (bulldoze).
 *
 * The `compute*Plan` functions are the pure, non-mutating halves of each command — the UI reuses
 * them to price the live drag preview (SPEC §5.2's floating cost label) without side effects.
 */
import { DIFFICULTY } from "../data/finance";
import { BULLDOZE_REFUND_FRACTION, type BridgeType } from "../data/track";
import { STATION_UPGRADE_ORDER, type StationType } from "../data/stations";
import { calendarFromTicks } from "./time";
import type { GameState } from "./state";
import { directionIndex } from "./track/graph";
import {
  doubleUpgradeCost,
  evaluatePath,
  pathIsValid,
  type CostContext,
  type PathStep,
} from "./track/cost";
import type { TrackEdge } from "./track/types";
import { canPlaceStationAt, stationAtTile } from "./stations/placement";
import { stationCost, stationUpgradeCost } from "./stations/cost";
import { defaultStationName } from "./stations/naming";
import { computeStationEconomies } from "./stations/economy";
import type { Station } from "./stations/types";
import { CARGO, type CargoType } from "../data/cargo";
import { locomotiveById, SELL_REFUND_FRACTION } from "../data/trains";
import { eraInflation } from "../data/finance";
import { tileXY } from "./trains/geometry";
import type { Train, TrainOrder } from "./trains/types";

export type CommandReasonCode =
  | "no-path"
  | "blocked"
  | "cant-afford"
  | "no-track-to-upgrade"
  | "nothing-to-bulldoze"
  | "station-no-track"
  | "station-occupied"
  | "invalid-station-upgrade"
  | "invalid-station-name"
  | "no-engine-shed"
  | "invalid-locomotive"
  | "too-many-cars"
  | "invalid-train"
  | "invalid-orders";

export type CommandResult = { ok: true; cost: number } | { ok: false; reason: CommandReasonCode };

export function costContext(state: GameState): CostContext {
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  return { year, buildCostMult: DIFFICULTY[state.difficulty].buildCostMult };
}

function edgeDirection(state: GameState, a: number, b: number): number {
  const width = state.map.width;
  const ax = a % width;
  const ay = Math.floor(a / width);
  const bx = b % width;
  const by = Math.floor(b / width);
  return directionIndex(Math.sign(bx - ax), Math.sign(by - ay));
}

export interface BuildPlan {
  steps: PathStep[];
  /** Steps not already built — these are what will actually be charged/added. */
  toBuild: PathStep[];
  cost: number;
  valid: boolean;
}

/** Prices `path` as a Track-mode build (SPEC §5.3), without mutating state. Edges that already
 * exist are free (re-dragging over existing track is forgiving, matching `buildTrack`). */
export function computeBuildPlan(
  state: GameState,
  path: readonly number[],
  preferredBridgeType?: BridgeType,
): BuildPlan {
  if (path.length < 2) return { steps: [], toBuild: [], cost: 0, valid: false };
  const steps = evaluatePath(state.map, path, costContext(state), preferredBridgeType);
  const valid = pathIsValid(steps);
  const toBuild = steps.filter((s) => !state.trackGraph.hasEdge(s.a, s.b));
  const cost = toBuild.reduce((sum, s) => sum + s.cost, 0);
  return { steps, toBuild, cost, valid };
}

export interface UpgradePlan {
  edges: TrackEdge[];
  cost: number;
  /** False if any step of the path has no existing single track to upgrade. */
  valid: boolean;
}

/** Prices `path` as a Double-mode upgrade, without mutating state. */
export function computeUpgradePlan(state: GameState, path: readonly number[]): UpgradePlan {
  if (path.length < 2) return { edges: [], cost: 0, valid: false };
  const edges: TrackEdge[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i] as number;
    const b = path[i + 1] as number;
    const edge = state.trackGraph.getEdge(a, b);
    if (!edge) return { edges: [], cost: 0, valid: false };
    if (!edge.double) edges.push(edge);
  }
  const cost = edges.reduce((sum, e) => sum + doubleUpgradeCost(e), 0);
  return { edges, cost, valid: true };
}

export interface BulldozePlan {
  edges: TrackEdge[];
  refund: number;
  valid: boolean;
}

/** Prices `path` (the raw tiles a bulldoze drag passed over, not a built-track path) as a
 * Bulldoze-mode removal, without mutating state. Collects every edge incident to any dragged
 * tile — not just edges between *consecutive* tiles in `path` — so a bridge (whose endpoints are
 * graph nodes but whose spanned tiles aren't) is still removed as long as the drag crosses either
 * shore, and so is every edge at a junction the drag passes through. */
export function computeBulldozePlan(state: GameState, path: readonly number[]): BulldozePlan {
  if (path.length < 2) return { edges: [], refund: 0, valid: false };
  const seen = new Set<string>();
  const edges: TrackEdge[] = [];
  for (const tile of path) {
    for (const edge of state.trackGraph.edgesAt(tile)) {
      const key = `${edge.a}|${edge.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(edge);
    }
  }
  const refund = edges.reduce((sum, e) => sum + e.cost * BULLDOZE_REFUND_FRACTION, 0);
  return { edges, refund, valid: edges.length > 0 };
}

/** Builds plain single track along `path` (a sequence of ≥2 tile indices, as produced by
 * track/pathfind.ts). Edges that already exist are skipped (free, not an error) so re-dragging
 * over existing track is forgiving. */
export function buildTrack(
  state: GameState,
  path: readonly number[],
  preferredBridgeType?: BridgeType,
): CommandResult {
  if (path.length < 2) return { ok: false, reason: "no-path" };
  const plan = computeBuildPlan(state, path, preferredBridgeType);
  if (!plan.valid) return { ok: false, reason: "blocked" };
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  for (const step of plan.toBuild) {
    const a = Math.min(step.a, step.b);
    const b = Math.max(step.a, step.b);
    const edge: TrackEdge = {
      a,
      b,
      direction: edgeDirection(state, a, b),
      double: false,
      electrified: false,
      bridge: step.bridge,
      bridgeSpan: step.bridgeSpan,
      cost: step.cost,
    };
    state.trackGraph.addEdge(edge);
  }
  state.cash -= plan.cost;
  if (plan.toBuild.length > 0) state.trackVersion++;
  return { ok: true, cost: plan.cost };
}

/** Upgrades existing single track along `path` to double (Double mode drag, SPEC §5.2/§5.3).
 * Edges already double are skipped (free, not an error). */
export function upgradeTrack(state: GameState, path: readonly number[]): CommandResult {
  if (path.length < 2) return { ok: false, reason: "no-path" };
  const plan = computeUpgradePlan(state, path);
  if (!plan.valid) return { ok: false, reason: "no-track-to-upgrade" };
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  for (const edge of plan.edges) {
    edge.cost += doubleUpgradeCost(edge);
    edge.double = true;
  }
  state.cash -= plan.cost;
  if (plan.edges.length > 0) state.trackVersion++;
  return { ok: true, cost: plan.cost };
}

/** Removes track along `path`'s edges, refunding 25% of each edge's recorded build cost
 * (SPEC §5.2). Edges not present are skipped silently (dragging past bare ground is fine). */
export function bulldoze(state: GameState, path: readonly number[]): CommandResult {
  if (path.length < 2) return { ok: false, reason: "no-path" };
  const plan = computeBulldozePlan(state, path);
  if (!plan.valid) return { ok: false, reason: "nothing-to-bulldoze" };

  for (const edge of plan.edges) state.trackGraph.removeEdge(edge.a, edge.b);
  state.cash += plan.refund;
  if (plan.edges.length > 0) state.trackVersion++;
  return { ok: true, cost: -plan.refund };
}

// --- Stations (SPEC §6.1, §6.3) --------------------------------------------------------------

/** Recomputes every station's cached supply/acceptance (SPEC §6.3) — call after any command that
 * changes `state.stations` (a new station or overlapping catchment changes what each one draws). */
export function refreshStationEconomy(state: GameState): void {
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  state.stationEconomy = computeStationEconomies(
    state.map,
    state.cities,
    state.industries,
    state.stations,
    year,
  );
}

export interface StationBuildPlan {
  cost: number;
  /** False if the tile can't take a station at all (wrong track shape or already occupied) —
   * distinct from affordability, which the UI checks separately against `cost`. */
  valid: boolean;
}

/** Prices building a `type` station at `tile`, without mutating state. */
export function computeStationBuildPlan(
  state: GameState,
  tile: number,
  type: StationType,
): StationBuildPlan {
  const valid =
    canPlaceStationAt(state.map, state.trackGraph, tile) && !stationAtTile(state.stations, tile);
  return { cost: stationCost(type, costContext(state)), valid };
}

/** Builds a `type` station at `tile` (SPEC §6.1: on a straight/diagonal through-track tile or a
 * dead-end, one per tile). Name defaults per SPEC §6.1; the first station built ever gets a free
 * Engine Shed (SPEC §6.2, flag only — Phase 6 reads it to gate where trains can be bought). */
export function buildStation(state: GameState, tile: number, type: StationType): CommandResult {
  if (stationAtTile(state.stations, tile)) return { ok: false, reason: "station-occupied" };
  if (!canPlaceStationAt(state.map, state.trackGraph, tile)) {
    return { ok: false, reason: "station-no-track" };
  }
  const cost = stationCost(type, costContext(state));
  if (cost > state.cash) return { ok: false, reason: "cant-afford" };

  const existingNames = new Set(state.stations.map((s) => s.name));
  const name = defaultStationName(
    state.map,
    state.trackGraph,
    state.cities,
    state.industries,
    tile,
    type,
    existingNames,
  );
  const station: Station = {
    id: state.nextStationId++,
    tile,
    type,
    name,
    hasEngineShed: state.stations.length === 0,
  };
  state.stations.push(station);
  state.cash -= cost;
  state.trackVersion++; // a station is a block boundary (SPEC §7.5) — splits whatever block it sits in
  refreshStationEconomy(state);
  return { ok: true, cost };
}

export interface StationUpgradePlan {
  cost: number;
  valid: boolean;
}

/** Prices upgrading `stationId` to `type` (must be strictly above its current type in
 * Depot→Station→Terminal order), without mutating state. */
export function computeStationUpgradePlan(
  state: GameState,
  stationId: number,
  type: StationType,
): StationUpgradePlan {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return { cost: 0, valid: false };
  if (STATION_UPGRADE_ORDER.indexOf(type) <= STATION_UPGRADE_ORDER.indexOf(station.type)) {
    return { cost: 0, valid: false };
  }
  return { cost: stationUpgradeCost(station.type, type, costContext(state)), valid: true };
}

/** Upgrades `stationId` in place to `type`, paying the difference (SPEC §6.1). */
export function upgradeStation(
  state: GameState,
  stationId: number,
  type: StationType,
): CommandResult {
  const plan = computeStationUpgradePlan(state, stationId, type);
  if (!plan.valid) return { ok: false, reason: "invalid-station-upgrade" };
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  const station = state.stations.find((s) => s.id === stationId) as Station;
  station.type = type;
  state.cash -= plan.cost;
  refreshStationEconomy(state);
  return { ok: true, cost: plan.cost };
}

/** Renames a station (SPEC §6.1's default name is just that — a default). Free, always succeeds
 * unless the trimmed name is empty. */
export function renameStation(state: GameState, stationId: number, name: string): CommandResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "invalid-station-name" };
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return { ok: false, reason: "invalid-station-name" };
  station.name = trimmed;
  return { ok: true, cost: 0 };
}

// --- Trains (SPEC §7.1, §7.2) -----------------------------------------------------------------

export interface BuyTrainPlan {
  cost: number;
  valid: boolean;
}

/** Prices buying `locoModelId` with `cars` at the current year, without mutating state. Doesn't
 * check the engine-shed/cash gates — those are cheap and only meaningful against a specific
 * station/cash balance, so `buyTrain` checks them itself. */
export function computeBuyTrainPlan(
  state: GameState,
  locoModelId: string,
  cars: readonly CargoType[],
): BuyTrainPlan {
  const loco = locomotiveById(locoModelId);
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  if (!loco || loco.introYear > year) return { cost: 0, valid: false };
  if (cars.length > loco.maxCars) return { cost: 0, valid: false };
  if (loco.passengerMailOnly && cars.some((c) => c !== "passengers" && c !== "mail")) {
    return { cost: 0, valid: false };
  }
  const ctx = costContext(state);
  const mult = eraInflation(ctx.year) * ctx.buildCostMult;
  const cost = loco.cost * mult + cars.reduce((sum, c) => sum + CARGO[c].carCost * mult, 0);
  return { cost, valid: true };
}

/** Buys a new train at `stationId` (must have an Engine Shed, SPEC §7's "must be at a station with
 * an Engine Shed") with the given locomotive and cars. The train starts empty-ordered (`loading`
 * with no orders) — set its route with `setOrders`. */
export function buyTrain(
  state: GameState,
  stationId: number,
  locoModelId: string,
  cars: readonly CargoType[],
): CommandResult {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return { ok: false, reason: "invalid-train" };
  if (!station.hasEngineShed) return { ok: false, reason: "no-engine-shed" };

  const plan = computeBuyTrainPlan(state, locoModelId, cars);
  if (!plan.valid) {
    return {
      ok: false,
      reason:
        cars.length > (locomotiveById(locoModelId)?.maxCars ?? 0)
          ? "too-many-cars"
          : "invalid-locomotive",
    };
  }
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  const [tx, ty] = tileXY(station.tile, state.map.width);
  const centerX = tx + 0.5;
  const centerY = ty + 0.5;
  const id = state.nextTrainId++;
  const train: Train = {
    id,
    name: `Train ${id + 1}`,
    locoModelId,
    cars: cars.map((cargoType) => ({ cargoType })),
    orders: [],
    currentOrderIndex: 0,
    status: "loading",
    route: [station.tile],
    routeIndex: 0,
    edgeProgress: 0,
    speed: 0,
    direction: -1,
    waitTicks: 0,
    routeTrackVersion: state.trackVersion,
    heldBlocks: [],
    blockPenalties: new Map(),
    renderFromX: centerX,
    renderFromY: centerY,
    renderToX: centerX,
    renderToY: centerY,
  };
  state.trains.push(train);
  state.cash -= plan.cost;
  return { ok: true, cost: plan.cost };
}

/** Sets `trainId`'s orders (SPEC §7.2: "an ordered list of 2–8 stations, looping"). Resets progress
 * to the top of the new list — the train picks up its route toward `orders[0]` once it next
 * finishes loading (or immediately, if it was idle for lack of orders). */
export function setOrders(
  state: GameState,
  trainId: number,
  orders: readonly TrainOrder[],
): CommandResult {
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return { ok: false, reason: "invalid-train" };
  if (orders.length < 2 || orders.length > 8) return { ok: false, reason: "invalid-orders" };
  const stationIds = new Set(state.stations.map((s) => s.id));
  if (orders.some((o) => !stationIds.has(o.stationId)))
    return { ok: false, reason: "invalid-orders" };

  train.orders = orders.map((o) => ({ ...o }));
  train.currentOrderIndex = 0;
  return { ok: true, cost: 0 };
}

export interface SellTrainPlan {
  refund: number;
  valid: boolean;
}

export function computeSellTrainPlan(state: GameState, trainId: number): SellTrainPlan {
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return { refund: 0, valid: false };
  const loco = locomotiveById(train.locoModelId);
  if (!loco) return { refund: 0, valid: false };
  const ctx = costContext(state);
  const mult = eraInflation(ctx.year) * ctx.buildCostMult;
  const value =
    loco.cost * mult + train.cars.reduce((sum, c) => sum + CARGO[c.cargoType].carCost * mult, 0);
  return { refund: value * SELL_REFUND_FRACTION, valid: true };
}

/** Sells `trainId` for 50% of its current (era-adjusted) locomotive + cars value (SPEC §7,
 * placeholder rate — a real depreciation model arrives with Phase 8's trade-in mechanics). */
export function sellTrain(state: GameState, trainId: number): CommandResult {
  const plan = computeSellTrainPlan(state, trainId);
  if (!plan.valid) return { ok: false, reason: "invalid-train" };
  const index = state.trains.findIndex((t) => t.id === trainId);
  state.trains.splice(index, 1);
  state.cash += plan.refund;
  return { ok: true, cost: -plan.refund };
}
