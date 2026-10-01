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
import { addRoute, registerBuildRoutes, removeRoute, snapshotLegs } from "./track/routes";
import { DIFFICULTY, LOAN_INCREMENT } from "../data/finance";
import { BULLDOZE_REFUND_FRACTION, ELECTRIFICATION_ERA, type BridgeType } from "../data/track";
import {
  STATION_IMPROVEMENTS,
  STATION_TYPE_DEFS,
  STATION_UPGRADE_ORDER,
  ENGINE_SHED_COST,
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
import { clearNews, pushNews } from "./news";
import { directionIndex } from "./track/graph";
import { edgeWearRatio, relayCost, relayEdge, wornEdges } from "./track/condition";
import { LOCO_OVERHAUL_DAYS, RELAY_OFFER_RATIO } from "../data/economy";
import { computeOverhaulPlan, mechanicalAgeYears } from "./trains/ageing";
import { findLayoutViolations, type LayoutViolation } from "./track/layout";
import { findSharpSteps } from "./track/turn";
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
import { passingLoopCost, stationCost, stationUpgradeCost } from "./stations/cost";
import { defaultStationName } from "./stations/naming";
import { computeStationEconomies } from "./stations/economy";
import { destinationCounts } from "./stations/destinations";
import type { Station } from "./stations/types";
import { CARGO, type CargoType } from "../data/cargo";
import {
  CONSIST_EDIT_REFUND_FRACTION,
  locomotiveById,
  SELL_REFUND_FRACTION,
  STEAM_PHASE_OUT_YEAR,
  TRADE_IN_AGE_REDUCTION_PER_YEAR,
  TRADE_IN_BASE_FRACTION,
  TRADE_IN_MIN_FRACTION,
} from "../data/trains";
import { eraInflation } from "../data/finance";
import { addExpense, computeCreditLimit } from "./finance/ledger";
import { emptyTrainProfit, recordTrainRepair } from "./trains/profit";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "./time";
import { dropCarCargo } from "./trains/loading";
import { tileXY } from "./trains/geometry";
import type { LoadingRule, Train, TrainCar, TrainOrder } from "./trains/types";

export type CommandReasonCode =
  | "no-path"
  | "blocked"
  | "sharpTurn"
  | "midTileCrossing"
  | "junctionOnBend"
  | "tooManyBranches"
  | "junctionsTooClose"
  | "cant-afford"
  | "no-track-to-upgrade"
  | "no-track-to-relay"
  | "overhaul-not-needed"
  | "not-era-available"
  | "already-improved"
  | "nothing-to-bulldoze"
  | "station-no-track"
  | "station-occupied"
  | "invalid-station"
  | "station-in-use"
  | "last-engine-shed"
  | "invalid-station-upgrade"
  | "invalid-station-name"
  | "no-engine-shed"
  | "invalid-locomotive"
  | "steam-phased-out"
  | "too-many-cars"
  | "invalid-consist"
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
  /** New steps that would meet track at a turn sharper than 45° (PLAN Phase 18 A) — a subset of
   * `toBuild`; non-empty makes the plan invalid. */
  sharpSteps: PathStep[];
  /** Junction layout rules the build would break (PLAN Phase 27 A, `track/layout.ts`); non-empty makes the
   * plan invalid. The violation `kind` is also the refusal reason. */
  layoutViolations: LayoutViolation[];
}

/** Prices `path` as a Track-mode build (SPEC §5.3), without mutating state. Edges that already
 * exist are free (re-dragging over existing track is forgiving, matching `buildTrack`). */
export function computeBuildPlan(
  state: GameState,
  path: readonly number[],
  preferredBridgeType?: BridgeType,
): BuildPlan {
  if (path.length < 2)
    return { steps: [], toBuild: [], cost: 0, valid: false, sharpSteps: [], layoutViolations: [] };
  const steps = evaluatePath(state.map, path, costContext(state), preferredBridgeType);
  const toBuild = steps.filter((s) => !state.trackGraph.hasEdge(s.a, s.b));
  const sharpSteps = findSharpSteps(
    state.trackGraph,
    state.map.width,
    new Set(state.stations.map((st) => st.tile)),
    toBuild,
  );
  const layoutViolations = findLayoutViolations(
    state.trackGraph,
    state.map.width,
    new Set(state.stations.map((st) => st.tile)),
    toBuild,
  );
  const valid = pathIsValid(steps) && sharpSteps.length === 0 && layoutViolations.length === 0;
  const cost = toBuild.reduce((sum, s) => sum + s.cost, 0);
  return { steps, toBuild, cost, valid, sharpSteps, layoutViolations };
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
  /** Exactly the edges the drag removes (Phase 28B, Bug 5): those the path runs along. */
  edges: TrackEdge[];
  /** Stations left with no track at all once `edges` are gone — removed with it. */
  stations: Station[];
  refund: number;
  valid: boolean;
}

/** Prices `path` (the tiles a bulldoze drag ran along the existing track) as a Bulldoze-mode removal,
 * without mutating state. An edge is removed only when the path runs along it: its two tiles are
 * consecutive in `path` (ordinary edges) or both on `path` (a bridge, whose spanned tiles aren't graph
 * nodes). Edges merely meeting the path at a junction stay — dragging a one-tile stub beside a station
 * no longer takes the main line with it (PLAYTEST-1 Bug 5). */
export function computeBulldozePlan(state: GameState, path: readonly number[]): BulldozePlan {
  const none: BulldozePlan = { edges: [], stations: [], refund: 0, valid: false };
  if (path.length < 2) return none;
  const width = state.map.width;
  const indexOf = new Map<number, number>();
  path.forEach((tile, i) => indexOf.set(tile, i));
  const seen = new Set<string>();
  const edges: TrackEdge[] = [];
  path.forEach((tile, i) => {
    for (const n of state.trackGraph.neighborsOf(tile)) {
      const j = indexOf.get(n);
      if (j === undefined) continue;
      const adjacent =
        Math.abs((tile % width) - (n % width)) <= 1 &&
        Math.abs(Math.floor(tile / width) - Math.floor(n / width)) <= 1;
      if (adjacent && Math.abs(i - j) !== 1) continue;
      const edge = state.trackGraph.getEdge(tile, n);
      if (!edge) continue;
      const key = `${edge.a}|${edge.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(edge);
    }
  });
  if (edges.length === 0) return none;
  const removedAt = new Map<number, number>();
  for (const e of edges) {
    removedAt.set(e.a, (removedAt.get(e.a) ?? 0) + 1);
    removedAt.set(e.b, (removedAt.get(e.b) ?? 0) + 1);
  }
  const stations = state.stations.filter(
    (st) =>
      (removedAt.get(st.tile) ?? 0) > 0 &&
      removedAt.get(st.tile) === state.trackGraph.edgesAt(st.tile).length,
  );
  const refund =
    edges.reduce((sum, e) => sum + e.cost * BULLDOZE_REFUND_FRACTION, 0) +
    stations.reduce((sum, st) => sum + stationRefund(state, st), 0);
  return { edges, stations, refund, valid: true };
}

/** What removing `station` pays back: a fraction of its current build price (improvements are lost). */
export function stationRefund(state: GameState, station: Station): number {
  const price = station.passingLoop
    ? passingLoopCost(costContext(state))
    : stationCost(station.type, costContext(state));
  return price * BULLDOZE_REFUND_FRACTION;
}

/** Why `station` can't be removed right now, or null: trains still stop there, or it is the last Engine Shed. */
export function stationRemovalBlocker(
  state: GameState,
  station: Station,
): { reason: "station-in-use" | "last-engine-shed"; trainNames: string[] } | null {
  const users = state.trains.filter((t) => t.orders.some((o) => o.stationId === station.id));
  if (users.length > 0) return { reason: "station-in-use", trainNames: users.map((t) => t.name) };
  if (station.hasEngineShed && state.stations.filter((s) => s.hasEngineShed).length <= 1) {
    return { reason: "last-engine-shed", trainNames: [] };
  }
  return null;
}

function dropStation(state: GameState, station: Station): void {
  state.stations.splice(state.stations.indexOf(station), 1);
  state.stationEconomy.delete(station.id);
  state.stationCargo.delete(station.id);
  state.stationTransfer.delete(station.id);
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
  if (plan.sharpSteps.length > 0) return { ok: false, reason: "sharpTurn" };
  if (plan.layoutViolations.length > 0)
    return { ok: false, reason: (plan.layoutViolations[0] as LayoutViolation).kind };
  if (!plan.valid) return { ok: false, reason: "blocked" };
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  const routeSnapshot = snapshotLegs(
    state.trackGraph,
    plan.toBuild.flatMap((s) => [s.a, s.b]),
  );
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
      laid: costContext(state).year,
    };
    state.trackGraph.addEdge(edge);
  }
  registerBuildRoutes(state.trackGraph, routeSnapshot, path);
  state.cash -= plan.cost;
  state.finance.capitalInvested += plan.cost;
  addExpense(state, "construction", plan.cost);
  if (plan.toBuild.length > 0) state.trackVersion++;
  return { ok: true, cost: plan.cost };
}

/** Turns the route between two legs of a junction on or off (Track mode, tap a node): e.g. a crossing gets a slip,
 * or loses one. Legs are the neighbour tiles of `node`; a route must respect the ≤45° rule. */
export function setNodeRoute(
  state: GameState,
  node: number,
  legA: number,
  legB: number,
  enabled: boolean,
): CommandResult {
  const g = state.trackGraph;
  if (!g.hasEdge(node, legA) || !g.hasEdge(node, legB) || legA === legB)
    return { ok: false, reason: "no-path" };
  if (enabled) {
    if (!addRoute(g, node, legA, legB)) return { ok: false, reason: "sharpTurn" };
  } else removeRoute(g, node, legA, legB);
  state.trackVersion++;
  return { ok: true, cost: 0 };
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

export interface RelayPlan {
  edges: TrackEdge[];
  cost: number;
  valid: boolean;
}

/** Prices relaying the worn track along `path` (every edge of the path at or above the offer threshold); with no
 * path, all worn track on the map. Without mutating state. */
export function computeRelayPlan(state: GameState, path?: readonly number[]): RelayPlan {
  const edges: TrackEdge[] = [];
  if (path) {
    for (let i = 0; i + 1 < path.length; i++) {
      const edge = state.trackGraph.getEdge(path[i] as number, path[i + 1] as number);
      if (edge && edgeWearRatio(state, edge) >= RELAY_OFFER_RATIO) edges.push(edge);
    }
  } else {
    for (const w of wornEdges(state)) edges.push(w.edge);
  }
  const cost = edges.reduce((sum, e) => sum + relayCost(state, e), 0);
  return { edges, cost, valid: edges.length > 0 };
}

/** Relays worn track (Phase 30A): new rail and sleepers of the current year's quality, at the renewal share of the
 * wear they took. Along `path`, or everywhere that needs it. The cost is track wear in the ledger. */
export function relayTrack(state: GameState, path?: readonly number[]): CommandResult {
  const plan = computeRelayPlan(state, path);
  if (!plan.valid) return { ok: false, reason: "no-track-to-relay" };
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };
  const year = costContext(state).year;
  for (const edge of plan.edges) relayEdge(edge, year);
  state.cash -= plan.cost;
  addExpense(state, "trackWear", plan.cost);
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

/** Removes the track the drag ran along, refunding 25% of each edge's recorded build cost (SPEC §5.2),
 * plus any station left with no track (refused while trains stop there — see `stationRemovalBlocker`). */
export function bulldoze(state: GameState, path: readonly number[]): CommandResult {
  if (path.length < 2) return { ok: false, reason: "no-path" };
  const plan = computeBulldozePlan(state, path);
  if (!plan.valid) return { ok: false, reason: "nothing-to-bulldoze" };
  for (const station of plan.stations) {
    const blocker = stationRemovalBlocker(state, station);
    if (blocker) return { ok: false, reason: blocker.reason };
  }

  for (const edge of plan.edges) state.trackGraph.removeEdge(edge.a, edge.b);
  for (const station of plan.stations) dropStation(state, station);
  state.cash += plan.refund;
  state.finance.capitalInvested -= plan.edges.reduce((sum, e) => sum + e.cost, 0);
  state.trackVersion++;
  if (plan.stations.length > 0) refreshStationEconomy(state);
  return { ok: true, cost: -plan.refund };
}

/** Removes a station (Bulldoze tool, tap a station) and refunds part of its price; the track stays. */
export function removeStation(state: GameState, stationId: number): CommandResult {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return { ok: false, reason: "invalid-station" };
  const blocker = stationRemovalBlocker(state, station);
  if (blocker) return { ok: false, reason: blocker.reason };
  const refund = stationRefund(state, station);
  dropStation(state, station);
  state.cash += refund;
  state.trackVersion++; // the station no longer splits its block
  refreshStationEconomy(state);
  return { ok: true, cost: -refund };
}

/**
 * Demolishes a station from its panel (PLAN Phase 29 B): unlike the Bulldoze tap it does not refuse while trains
 * stop there — every such stop is taken out of the trains' orders (a train left with fewer than two stops shows up
 * in the stuck indicator), cargo waiting at the station is lost, the track stays and part of the price is refunded.
 * Refused only for the last Engine Shed.
 */
export function demolishStation(state: GameState, stationId: number): CommandResult {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return { ok: false, reason: "invalid-station" };
  if (station.hasEngineShed && state.stations.filter((s) => s.hasEngineShed).length <= 1)
    return { ok: false, reason: "last-engine-shed" };
  let affected = 0;
  for (const train of state.trains) {
    const removedHere = (i: number): boolean => train.orders[i]?.stationId === stationId;
    const touched = train.orders.some((o) => o.stationId === stationId);
    if (touched) {
      affected++;
      let index = train.currentOrderIndex;
      for (let i = 0; i < train.currentOrderIndex; i++) if (removedHere(i)) index--;
      train.orders = train.orders.filter((o) => o.stationId !== stationId);
      train.currentOrderIndex = train.orders.length > 0 ? index % train.orders.length : 0;
    }
    const atDemolished =
      train.inYardOf === stationId || train.route[train.routeIndex] === station.tile;
    if (train.inYardOf === stationId) {
      delete train.inYardOf;
      delete train.yardSince;
    }
    if (train.waitingForStationId === stationId) delete train.waitingForStationId;
    if (train.sectionTargetStationId === stationId) delete train.sectionTargetStationId;
    if (train.noRouteReportedStationId === stationId) delete train.noRouteReportedStationId;
    if (train.waitingOn?.stationId === stationId) delete train.waitingOn;
    // A train standing at (loading in) the station leaves for its next stop from the same tile.
    if (atDemolished && train.status === "loading") {
      train.route = [train.route[train.routeIndex] as number];
      train.routeIndex = 0;
      train.edgeProgress = 0;
      train.status = "moving";
      train.waitTicks = 0;
      train.loadTicksLeft = -1;
      train.loadExtraWaitDays = 0;
      delete train.headwayHold;
      delete train.headwayWaitTicks;
    }
  }
  const refund = stationRefund(state, station);
  pushNews(state, {
    kind: "stationDemolished",
    name: station.name,
    trains: affected,
  });
  dropStation(state, station);
  state.cash += refund;
  state.trackVersion++;
  refreshStationEconomy(state);
  return { ok: true, cost: -refund };
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
    destinationCounts(state.trains),
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

/** Prices a passing loop at `tile` (a plain single-track tile between two other tiles, not a station), without
 * mutating state. `valid` is false on a double track, a bridge, a junction, a bend, a dead end or a station. */
export function computePassingLoopPlan(state: GameState, tile: number): StationBuildPlan {
  const edges = state.trackGraph.edgesAt(tile);
  const straight =
    edges.length === 2 &&
    canPlaceStationAt(state.map, state.trackGraph, tile) &&
    !stationAtTile(state.stations, tile);
  const plain = edges.every((e) => !e.double && !e.bridge);
  return { cost: passingLoopCost(costContext(state)), valid: straight && plain };
}

/** Builds a passing loop at `tile` (Phase 30A, PLAYTEST-2 Top 10 #6): the cheap way to let trains meet on a single
 * line. Trains reserve the line from loop to loop instead of end to end (SPEC §7.5), so opposing trains can wait
 * in the loop instead of at the far terminal. */
export function buildPassingLoop(state: GameState, tile: number): CommandResult {
  const plan = computePassingLoopPlan(state, tile);
  if (!plan.valid) {
    return {
      ok: false,
      reason: stationAtTile(state.stations, tile) ? "station-occupied" : "station-no-track",
    };
  }
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };
  const station: Station = {
    id: state.nextStationId++,
    tile,
    type: "depot",
    name: defaultLoopName(state),
    hasEngineShed: false,
    hasWaterTower: false,
    improvements: [],
    passingLoop: true,
  };
  state.stations.push(station);
  state.cash -= plan.cost;
  state.finance.capitalInvested += plan.cost;
  addExpense(state, "construction", plan.cost);
  state.trackVersion++;
  refreshStationEconomy(state);
  return { ok: true, cost: plan.cost };
}

function defaultLoopName(state: GameState): string {
  const n = state.stations.filter((s) => s.passingLoop).length + 1;
  return `Passing loop ${n}`;
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
  if (station.passingLoop) return { cost: 0, valid: false };
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
  if (!station || station.passingLoop || station.hasWaterTower) return { cost: 0, valid: false };
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

/** Prices building an Engine Shed at `stationId` (SPEC §6.2), without mutating state. */
export function computeEngineShedPlan(
  state: GameState,
  stationId: number,
): { cost: number; valid: boolean } {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station || station.passingLoop || station.hasEngineShed) return { cost: 0, valid: false };
  const ctx = costContext(state);
  return { cost: ENGINE_SHED_COST * eraInflation(ctx.year) * ctx.buildCostMult, valid: true };
}

/** Builds an Engine Shed at `stationId` (PLAN Phase 28A): trains can be bought and serviced there, and repair
 * crews dispatch from the nearest shed. */
export function buildEngineShed(state: GameState, stationId: number): CommandResult {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return { ok: false, reason: "invalid-station-name" };
  if (station.hasEngineShed) return { ok: false, reason: "already-improved" };
  const plan = computeEngineShedPlan(state, stationId);
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };

  station.hasEngineShed = true;
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
  if (!station || station.passingLoop || station.improvements.includes(type)) {
    return { cost: 0, valid: false };
  }
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
    cars: cars.map((cargoType) => ({ cargoType, loadedUnits: 0 })),
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
    distanceTraveled: 0,
    blockPenalties: new Map(),
    loadTicksLeft: -1,
    loadExtraWaitDays: 0,
    purchasePrice: plan.cost,
    purchaseTick: state.ticks,
    breakdownTicksLeft: 0,
    lastServicedTick: state.ticks, // bought at a station with an Engine Shed — freshly serviced
    tilesSinceWaterTower: 0,
    lifetimeRevenue: 0,
    profit: emptyTrainProfit(),
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
  // A passing loop is not a stop (Phase 30A).
  if (orders.some((o) => state.stations.find((s) => s.id === o.stationId)?.passingLoop))
    return { ok: false, reason: "invalid-orders" };

  train.orders = orders.map((o) => ({ ...o }));
  train.currentOrderIndex = 0;
  // (the destination bonus follows the orders at the next monthly economy refresh)
  return { ok: true, cost: 0 };
}

/** Changes only the loading rule of one stop of `trainId`'s orders, keeping its progress through the
 * list (unlike `setOrders`, which restarts at the top). Train panel: tap a stop's rule chip. */
export function setOrderRule(
  state: GameState,
  trainId: number,
  orderIndex: number,
  rule: LoadingRule,
): CommandResult {
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return { ok: false, reason: "invalid-train" };
  const order = train.orders[orderIndex];
  if (!order) return { ok: false, reason: "invalid-orders" };
  order.rule = rule;
  return { ok: true, cost: 0 };
}

/** Matches a new car list against the train's current cars by cargo type, in order, so cars that
 * persist keep their existing load rather than being treated as sold-and-rebought (PLAN Phase 15's
 * "Edit consist on an existing train"). Greedy: the first `newTypes[i]` of a given type reuses the
 * oldest still-unmatched old car of that type. `addedTypes` are the new-list entries with no old car
 * left to match (charged full price); `removedCars` are old cars nothing in the new list matched
 * (refunded, cargo dropped). */
function reconcileConsist(
  oldCars: readonly TrainCar[],
  newTypes: readonly CargoType[],
): { cars: TrainCar[]; addedTypes: CargoType[]; removedCars: TrainCar[] } {
  const pools = new Map<CargoType, TrainCar[]>();
  for (const car of oldCars) {
    const list = pools.get(car.cargoType) ?? [];
    list.push(car);
    pools.set(car.cargoType, list);
  }
  const cars: TrainCar[] = [];
  const addedTypes: CargoType[] = [];
  for (const type of newTypes) {
    const existing = pools.get(type)?.shift();
    if (existing) cars.push(existing);
    else {
      cars.push({ cargoType: type, loadedUnits: 0 });
      addedTypes.push(type);
    }
  }
  const removedCars = Array.from(pools.values()).flat();
  return { cars, addedTypes, removedCars };
}

export interface EditConsistPlan {
  /** `addedCost - refund` — may be negative (a net refund) when the edit removes more than it adds. */
  netCost: number;
  addedCost: number;
  refund: number;
  valid: boolean;
}

/** Prices an "Edit cars" change on an existing train (PLAN Phase 15) without mutating state — cars
 * that persist (same cargo type, matched in order by `reconcileConsist`) are free; a genuinely new
 * car is charged at car price (era-adjusted, like `buyTrain`); a removed car refunds
 * `CONSIST_EDIT_REFUND_FRACTION` of its price. */
export function computeEditConsistPlan(
  state: GameState,
  trainId: number,
  cars: readonly CargoType[],
): EditConsistPlan {
  const invalid = { netCost: 0, addedCost: 0, refund: 0, valid: false };
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return invalid;
  const loco = locomotiveById(train.locoModelId);
  if (!loco) return invalid;
  if (cars.length > loco.maxCars) return invalid;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  if (cars.some((c) => CARGO[c].era > year)) return invalid;
  if (loco.passengerMailOnly && cars.some((c) => c !== "passengers" && c !== "mail")) {
    return invalid;
  }

  const { addedTypes, removedCars } = reconcileConsist(train.cars, cars);
  const ctx = costContext(state);
  const mult = eraInflation(ctx.year) * ctx.buildCostMult;
  const addedCost = addedTypes.reduce((sum, c) => sum + CARGO[c].carCost * mult, 0);
  const refund = removedCars.reduce(
    (sum, c) => sum + CARGO[c.cargoType].carCost * mult * CONSIST_EDIT_REFUND_FRACTION,
    0,
  );
  return { netCost: addedCost - refund, addedCost, refund, valid: true };
}

/** Applies an "Edit cars" change (PLAN Phase 15): pays/refunds immediately. If the train is
 * currently at a station (`status === "loading"`) the new consist applies right away — cargo in any
 * removed car is dropped there (paid if the station accepts it, wasted otherwise, SPEC-equivalent
 * to a normal unload). Otherwise the change is queued on `train.pendingConsist` and applied at the
 * train's next stop (`applyPendingConsist` in loading.ts), same cargo-drop rule, at whichever
 * station that turns out to be. */
export function editConsist(
  state: GameState,
  trainId: number,
  cars: readonly CargoType[],
): CommandResult {
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return { ok: false, reason: "invalid-train" };
  const plan = computeEditConsistPlan(state, trainId, cars);
  if (!plan.valid) return { ok: false, reason: "invalid-consist" };
  if (plan.netCost > state.cash) return { ok: false, reason: "cant-afford" };

  const { cars: reconciledCars, removedCars } = reconcileConsist(train.cars, cars);
  state.cash -= plan.netCost;
  addExpense(state, "rollingStock", plan.netCost);

  // Keyed off the train's actual position rather than its orders — a train that's `"loading"`
  // but has no orders yet (just bought, before `setOrders`) is still genuinely at a station.
  const currentStation =
    train.status === "loading"
      ? state.stations.find((s) => s.tile === train.route[train.routeIndex])
      : undefined;
  if (currentStation) {
    for (const car of removedCars) dropCarCargo(state, train, currentStation, car);
    train.cars = reconciledCars;
    delete train.pendingConsist;
    train.loadTicksLeft = -1; // recompute this stop's dwell time for the new car count
  } else {
    train.pendingConsist = {
      cars: reconciledCars,
      removedLoaded: removedCars.filter((c) => c.loadedUnits > 0),
    };
  }
  return { ok: true, cost: plan.netCost };
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

/** Empties the news history (News panel "Clear all"). */
export function clearAllNews(state: GameState): CommandResult {
  clearNews(state);
  return { ok: true, cost: 0 };
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

export interface OverhaulCommandPlan {
  cost: number;
  ageAfter: number;
  /** False when the engine is too young to need it, or is not standing at a station with an Engine Shed. */
  valid: boolean;
}

/** Prices a general overhaul of `trainId`'s locomotive (Phase 30A) without mutating state. It happens in an Engine
 * Shed, so the train must be standing (loading) at a station that has one. */
export function computeOverhaulCommandPlan(state: GameState, trainId: number): OverhaulCommandPlan {
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return { cost: 0, ageAfter: 0, valid: false };
  const plan = computeOverhaulPlan(state, train);
  const tile = train.route[train.routeIndex];
  const station = tile === undefined ? undefined : stationAtTile(state.stations, tile);
  const inShed = !!station?.hasEngineShed && train.status === "loading" && !train.inYardOf;
  return { cost: plan.cost, ageAfter: plan.ageAfter, valid: plan.valid && inShed };
}

/** Overhauls `trainId`'s locomotive in the shed it is standing in: pays `LOCO_OVERHAUL_COST_SHARE` of its price, takes
 * `LOCO_OVERHAUL_DAYS` out of service, and takes `LOCO_OVERHAUL_AGE_RESET` off its mechanical age. */
export function overhaulLocomotive(state: GameState, trainId: number): CommandResult {
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return { ok: false, reason: "invalid-train" };
  const plan = computeOverhaulCommandPlan(state, trainId);
  if (!plan.valid) {
    const tile = train.route[train.routeIndex];
    const station = tile === undefined ? undefined : stationAtTile(state.stations, tile);
    return {
      ok: false,
      reason:
        station?.hasEngineShed && train.status === "loading"
          ? "overhaul-not-needed"
          : "no-engine-shed",
    };
  }
  if (plan.cost > state.cash) return { ok: false, reason: "cant-afford" };
  train.ageCreditYears =
    (train.ageCreditYears ?? 0) + (mechanicalAgeYears(state, train) - plan.ageAfter);
  delete train.wornOutNoticed;
  train.breakdownTicksLeft = LOCO_OVERHAUL_DAYS * HOURS_PER_DAY;
  train.inOverhaul = true;
  train.lastServicedTick = state.ticks;
  state.cash -= plan.cost;
  addExpense(state, "breakdownRepairs", plan.cost);
  recordTrainRepair(train, plan.cost);
  return { ok: true, cost: plan.cost };
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
  delete train.ageCreditYears;
  train.serviceOdometerTiles = train.distanceTraveled;
  delete train.wornOutNoticed;
  train.breakdownTicksLeft = 0;
  delete train.inOverhaul;
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
