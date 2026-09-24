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

export type CommandReasonCode =
  "no-path" | "blocked" | "cant-afford" | "no-track-to-upgrade" | "nothing-to-bulldoze";

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
  return { ok: true, cost: -plan.refund };
}
