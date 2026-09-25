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
import { DIFFICULTY, LOAN_INCREMENT } from "../data/finance";
import { BULLDOZE_REFUND_FRACTION, ELECTRIFICATION_ERA, type BridgeType } from "../data/track";
import {
  STATION_IMPROVEMENTS,
  STATION_TYPE_DEFS,
  STATION_UPGRADE_ORDER,
  WATER_TOWER_COST,
  type StationImprovementType,
  type StationType,
} from "../data/stations";
import {
  CITY_TIERS,
  CIVIC_INVESTMENT_COOLDOWN_YEARS,
  CIVIC_INVESTMENT_COST_PER_TIER,
  CIVIC_INVESTMENT_POP_BOOST,
} from "../data/cities";
import { calendarFromTicks } from "./time";
import type { GameState } from "./state";
import { applyCivicInvestmentGrowth, getOrCreateCityGrowth } from "./economy/cityGrowth";
import type { City } from "./economy/types";
import { pushNews } from "./news";
import { directionIndex } from "./track/graph";
import {
  doubleUpgradeCost,
  electrifyCost,
  evaluatePath,
  pathIsValid,
  type CostContext,
  type PathStep,
} from "./track/cost";
import type { TrackEdge } from "./track/types";
import { canPlaceStationAt, stationAtTile, stationCatchmentTiles } from "./stations/placement";
import { stationCost, stationUpgradeCost } from "./stations/cost";
import { defaultStationName } from "./stations/naming";
import { computeStationEconomies } from "./stations/economy";
import type { Station } from "./stations/types";
import { CARGO, type CargoType } from "../data/cargo";
import {
  locomotiveById,
  SELL_REFUND_FRACTION,
  STEAM_PHASE_OUT_YEAR,
  TRADE_IN_AGE_REDUCTION_PER_YEAR,
  TRADE_IN_BASE_FRACTION,
  TRADE_IN_MIN_FRACTION,
} from "../data/trains";
import { eraInflation } from "../data/finance";
import { addExpense, computeCreditLimit } from "./finance/ledger";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "./time";
import { tileXY } from "./trains/geometry";
import type { Train, TrainOrder } from "./trains/types";

export type CommandReasonCode =
  | "no-path"
  | "blocked"
  | "cant-afford"
  | "no-track-to-upgrade"
  | "not-era-available"
  | "already-improved"
  | "nothing-to-bulldoze"
  | "station-no-track"
  | "station-occupied"
  | "invalid-station-upgrade"
  | "invalid-station-name"
  | "no-engine-shed"
  | "invalid-locomotive"
  | "steam-phased-out"
  | "too-many-cars"
  | "invalid-train"
  | "invalid-orders"
  | "invalid-loan-amount"
  | "credit-limit-exceeded"
  | "invalid-city"
  | "city-not-connected"
  | "civic-investment-cooldown";

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
  state.finance.capitalInvested += plan.cost;
  addExpense(state, "construction", plan.cost);
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
  state.finance.capitalInvested += plan.cost;
  addExpense(state, "construction", plan.cost);
  if (plan.edges.length > 0) state.trackVersion++;
  return { ok: true, cost: plan.cost };
}

export interface ElectrifyPlan {
  edges: TrackEdge[];
  cost: number;
  valid: boolean;
}

/** Prices `path` as an Electrify-mode upgrade (SPEC §5.2/§5.3: drag along existing single or double
 * track), without mutating state. Era-gated from `ELECTRIFICATION_ERA` (1905). */
export function computeElectrifyPlan(state: GameState, path: readonly number[]): ElectrifyPlan {
  if (path.length < 2) return { edges: [], cost: 0, valid: false };
  const ctx = costContext(state);
  if (ctx.year < ELECTRIFICATION_ERA) return { edges: [], cost: 0, valid: false };
  const edges: TrackEdge[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i] as number;
    const b = path[i + 1] as number;
    const edge = state.trackGraph.getEdge(a, b);
    if (!edge) return { edges: [], cost: 0, valid: false };
    if (!edge.electrified) edges.push(edge);
  }
  const cost = edges.reduce((sum, e) => sum + electrifyCost(e, ctx), 0);
  return { edges, cost, valid: true };
}

/** Electrifies existing track along `path` (Electrify mode drag). Edges already electrified are
 * skipped (free, not an error), matching Double mode's re-drag behavior. */
export function electrifyTrack(state: GameState, path: readonly number[]): CommandResult {
  if (path.length < 2) return { ok: false, reason: "no-path" };
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  if (year < ELECTRIFICATION_ERA) return { ok: false, reason: "not-era-available" };
  const plan = computeElectrifyPlan(state, path);
  if (!plan.valid) return { ok: false, reason: "no-track-to-upgrade" };
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  for (const edge of plan.edges) edge.electrified = true;
  state.cash -= plan.cost;
  state.finance.capitalInvested += plan.cost;
  addExpense(state, "construction", plan.cost);
  // Electrified-ness gates electric-loco routing (src/sim/trains/route.ts) — bump so any train
  // already routed (or parked `noRoute`) recomputes against the newly electrified edges.
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
  state.finance.capitalInvested -= plan.edges.reduce((sum, e) => sum + e.cost, 0);
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
    state.industryEconomy,
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
    hasWaterTower: false,
    improvements: [],
  };
  state.stations.push(station);
  state.cash -= cost;
  state.finance.capitalInvested += cost;
  addExpense(state, "construction", cost);
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
  state.finance.capitalInvested += plan.cost;
  addExpense(state, "construction", plan.cost);
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

/** Prices building a Water Tower at `stationId` (SPEC §6.2), without mutating state. */
export function computeWaterTowerPlan(
  state: GameState,
  stationId: number,
): { cost: number; valid: boolean } {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station || station.hasWaterTower) return { cost: 0, valid: false };
  return { cost: WATER_TOWER_COST * eraInflation(costContext(state).year), valid: true };
}

/** Builds a Water Tower at `stationId` (SPEC §6.2: refills steam locomotives stopping here). */
export function buildWaterTower(state: GameState, stationId: number): CommandResult {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return { ok: false, reason: "invalid-station-name" };
  if (station.hasWaterTower) return { ok: false, reason: "already-improved" };
  const plan = computeWaterTowerPlan(state, stationId);
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  station.hasWaterTower = true;
  state.cash -= plan.cost;
  state.finance.capitalInvested += plan.cost;
  addExpense(state, "construction", plan.cost);
  return { ok: true, cost: plan.cost };
}

export interface ImprovementBuildPlan {
  cost: number;
  valid: boolean;
}

/** Prices building `type` at `stationId` (SPEC §6.2's remaining improvement roster: Post Office,
 * Hotel, Warehouse, Cold Storage, Freight Yard, Livestock Pens — Engine Shed/Water Tower keep their
 * own bespoke commands above), without mutating state. */
export function computeImprovementPlan(
  state: GameState,
  stationId: number,
  type: StationImprovementType,
): ImprovementBuildPlan {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station || station.improvements.includes(type)) return { cost: 0, valid: false };
  const def = STATION_IMPROVEMENTS[type];
  const year = costContext(state).year;
  if (def.availableYear !== undefined && year < def.availableYear) {
    return { cost: 0, valid: false };
  }
  return { cost: def.cost * eraInflation(year), valid: true };
}

/** Builds improvement `type` at `stationId`, once per station (SPEC §6.2). */
export function buildImprovement(
  state: GameState,
  stationId: number,
  type: StationImprovementType,
): CommandResult {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return { ok: false, reason: "invalid-station-name" };
  if (station.improvements.includes(type)) return { ok: false, reason: "already-improved" };
  const plan = computeImprovementPlan(state, stationId, type);
  if (!plan.valid) return { ok: false, reason: "not-era-available" };
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  station.improvements.push(type);
  state.cash -= plan.cost;
  state.finance.capitalInvested += plan.cost;
  addExpense(state, "construction", plan.cost);
  // Post Office changes this station's mail supply figure (SPEC §6.2) — refresh so it's reflected
  // before tomorrow's cargo accrual reads it.
  refreshStationEconomy(state);
  return { ok: true, cost: plan.cost };
}

// --- Cities (SPEC §8.3) -------------------------------------------------------------------------

/** A city counts as "connected by rail" (SPEC §8.3's Civic Investment gate) once some built
 * station's catchment covers at least one of its footprint tiles — the same coverage concept SPEC
 * §6.3 already uses for supply/acceptance splitting. */
function cityIsRailConnected(state: GameState, city: City): boolean {
  const cityTiles = new Set(city.tiles);
  for (const station of state.stations) {
    const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
    for (const tile of stationCatchmentTiles(state.map, station.tile, radius)) {
      if (cityTiles.has(tile)) return true;
    }
  }
  return false;
}

export interface CivicInvestmentPlan {
  cost: number;
  valid: boolean;
}

/** Prices a Civic Investment in `cityId` (SPEC §8.3: "$100k × tier, once per 5 years per city"),
 * without mutating state. Tier rank is 1 (Village) through 4 (Metropolis). */
export function computeCivicInvestmentPlan(state: GameState, cityId: number): CivicInvestmentPlan {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { cost: 0, valid: false };
  if (!cityIsRailConnected(state, city)) return { cost: 0, valid: false };
  const growth = state.cityGrowth.get(cityId);
  if (growth?.lastCivicInvestmentTick !== undefined) {
    const yearsSince =
      (state.ticks - growth.lastCivicInvestmentTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
    if (yearsSince < CIVIC_INVESTMENT_COOLDOWN_YEARS) return { cost: 0, valid: false };
  }
  const tierRank = CITY_TIERS.indexOf(city.tier) + 1;
  const cost = CIVIC_INVESTMENT_COST_PER_TIER * tierRank * eraInflation(costContext(state).year);
  return { cost, valid: true };
}

/** Civic Investment (SPEC §8.3): the player pays into a connected city for +15% population and a
 * one-off growth tick (footprint/tier updates included), "the upgrading cities lever". */
export function civicInvestment(state: GameState, cityId: number): CommandResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: "invalid-city" };
  if (!cityIsRailConnected(state, city)) return { ok: false, reason: "city-not-connected" };
  const plan = computeCivicInvestmentPlan(state, cityId);
  if (!plan.valid) return { ok: false, reason: "civic-investment-cooldown" };
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  applyCivicInvestmentGrowth(state, city, CIVIC_INVESTMENT_POP_BOOST);
  getOrCreateCityGrowth(state, cityId).lastCivicInvestmentTick = state.ticks;
  state.cash -= plan.cost;
  state.finance.capitalInvested += plan.cost;
  addExpense(state, "construction", plan.cost);
  pushNews(state, { kind: "civicInvestment", cityId });
  return { ok: true, cost: plan.cost };
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
  // SPEC §7.6: "steam models can't be bought after 1960" (existing steam trains already in service
  // keep running — this only blocks new purchases).
  if (loco.type === "steam" && year > STEAM_PHASE_OUT_YEAR) return { cost: 0, valid: false };
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
    const loco = locomotiveById(locoModelId);
    const year = calendarFromTicks(state.startYear, state.ticks).year;
    return {
      ok: false,
      reason:
        cars.length > (loco?.maxCars ?? 0)
          ? "too-many-cars"
          : loco && loco.type === "steam" && year > STEAM_PHASE_OUT_YEAR
            ? "steam-phased-out"
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
    cars: cars.map((cargoType) => ({ cargoType, loaded: false })),
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
    lastApproachNode: -1,
    heldBlocks: [],
    blockPenalties: new Map(),
    loadTicksLeft: -1,
    loadExtraWaitDays: 0,
    purchasePrice: plan.cost,
    purchaseTick: state.ticks,
    breakdownTicksLeft: 0,
    lastServicedTick: state.ticks, // bought at a station with an Engine Shed — freshly serviced
    tilesSinceWaterTower: 0,
    renderFromX: centerX,
    renderFromY: centerY,
    renderToX: centerX,
    renderToY: centerY,
  };
  state.trains.push(train);
  state.cash -= plan.cost;
  addExpense(state, "rollingStock", plan.cost);
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
 * placeholder rate — replacing just the locomotive with a trade-in credit, SPEC §7.6, is
 * `replaceLocomotive` below instead). */
export function sellTrain(state: GameState, trainId: number): CommandResult {
  const plan = computeSellTrainPlan(state, trainId);
  if (!plan.valid) return { ok: false, reason: "invalid-train" };
  const index = state.trains.findIndex((t) => t.id === trainId);
  state.trains.splice(index, 1);
  state.cash += plan.refund;
  addExpense(state, "rollingStock", -plan.refund);
  return { ok: true, cost: -plan.refund };
}

export interface ReplaceLocoPlan {
  /** New loco price minus the trade-in credit — may be negative (a refund) when trading down. */
  netCost: number;
  newLocoCost: number;
  tradeInValue: number;
  valid: boolean;
}

/** Prices replacing `trainId`'s locomotive with `newLocoModelId` (SPEC §7.6: "pay new loco price
 * minus 30% trade-in of the old loco's price, reduced 3%/year of age, min 10%"), without mutating
 * state. Cars and orders are kept, so the new locomotive must still fit them (max cars,
 * passenger/mail-only). */
export function computeReplaceLocoPlan(
  state: GameState,
  trainId: number,
  newLocoModelId: string,
): ReplaceLocoPlan {
  const invalid = { netCost: 0, newLocoCost: 0, tradeInValue: 0, valid: false };
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return invalid;
  const oldLoco = locomotiveById(train.locoModelId);
  const newLoco = locomotiveById(newLocoModelId);
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  if (!oldLoco || !newLoco || newLoco.introYear > year) return invalid;
  if (newLoco.type === "steam" && year > STEAM_PHASE_OUT_YEAR) return invalid;
  if (train.cars.length > newLoco.maxCars) return invalid;
  if (
    newLoco.passengerMailOnly &&
    train.cars.some((c) => c.cargoType !== "passengers" && c.cargoType !== "mail")
  ) {
    return invalid;
  }

  const ctx = costContext(state);
  const mult = eraInflation(ctx.year) * ctx.buildCostMult;
  const ageYears = (state.ticks - train.purchaseTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
  const fraction = Math.max(
    TRADE_IN_MIN_FRACTION,
    TRADE_IN_BASE_FRACTION - TRADE_IN_AGE_REDUCTION_PER_YEAR * ageYears,
  );
  const tradeInValue = oldLoco.cost * mult * fraction;
  const newLocoCost = newLoco.cost * mult;
  return { netCost: newLocoCost - tradeInValue, newLocoCost, tradeInValue, valid: true };
}

/** Replaces `trainId`'s locomotive, paying the price difference after trade-in (SPEC §7.6). Resets
 * the train's age (purchase tick, service/water-tower/breakdown state) to the new locomotive's —
 * cars, their loads, and orders are untouched. */
export function replaceLocomotive(
  state: GameState,
  trainId: number,
  newLocoModelId: string,
): CommandResult {
  const plan = computeReplaceLocoPlan(state, trainId, newLocoModelId);
  if (!plan.valid) return { ok: false, reason: "invalid-locomotive" };
  if (plan.netCost > state.cash) return { ok: false, reason: "cant-afford" };

  const train = state.trains.find((t) => t.id === trainId) as Train;
  const ctx = costContext(state);
  const mult = eraInflation(ctx.year) * ctx.buildCostMult;
  const carsValue = train.cars.reduce((sum, c) => sum + CARGO[c.cargoType].carCost * mult, 0);

  train.locoModelId = newLocoModelId;
  train.purchasePrice = plan.newLocoCost + carsValue;
  train.purchaseTick = state.ticks;
  train.breakdownTicksLeft = 0;
  train.lastServicedTick = state.ticks;
  train.tilesSinceWaterTower = 0;
  state.cash -= plan.netCost;
  addExpense(state, "rollingStock", plan.netCost);
  return { ok: true, cost: plan.netCost };
}

// --- Loans (SPEC §9.1) --------------------------------------------------------------------------

/** Credit limit: 50% of net worth, min $500k (SPEC §9.1) — exposed so the Finance panel can show
 * how much more the player can still borrow. */
export function creditLimit(state: GameState): number {
  return computeCreditLimit(state);
}

/** Borrows `amount` (must be a positive multiple of $100k, SPEC §9.1) up to the credit limit. */
export function takeLoan(state: GameState, amount: number): CommandResult {
  if (amount <= 0 || amount % LOAN_INCREMENT !== 0) {
    return { ok: false, reason: "invalid-loan-amount" };
  }
  if (state.finance.loans + amount > computeCreditLimit(state)) {
    return { ok: false, reason: "credit-limit-exceeded" };
  }
  state.finance.loans += amount;
  state.cash += amount;
  return { ok: true, cost: -amount };
}

/** Repays `amount` (a positive multiple of $100k) of the outstanding loan balance. */
export function repayLoan(state: GameState, amount: number): CommandResult {
  if (amount <= 0 || amount % LOAN_INCREMENT !== 0) {
    return { ok: false, reason: "invalid-loan-amount" };
  }
  const payment = Math.min(amount, state.finance.loans);
  if (payment > state.cash) return { ok: false, reason: "cant-afford" };
  state.finance.loans -= payment;
  state.cash -= payment;
  return { ok: true, cost: payment };
}
