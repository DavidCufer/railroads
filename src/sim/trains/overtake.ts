/**
 * Overtaking at a passing place (SPEC §7.5, Phase 55). Real practice is "putting the slow train inside": a train ready
 * to leave a station or passing loop holds if a faster train heading the same way will catch it before the next
 * station, and departs once that train has gone through. Pure: no state is changed; `tryEnterSection` in movement.ts
 * applies the answer. Running times use the caller's speed estimate (movement.ts passes `computeTargetSpeed` scaled
 * by headway.ts's average-speed share), not a fixed rule.
 */
import { edgeLengthTiles } from "./geometry";
import { reversesAtOrder, stopDwellHours } from "./headway";
import type { GameState } from "../state";
import type { Train } from "./types";

/** Off only in the bench and tests that measure what the rule is worth (never in a real game). */
export const overtaking = { enabled: true };

export interface OvertakeContext {
  stationTiles: ReadonlySet<number>;
  /** Tiles an hour `train` covers on the edge a -> b once under way. */
  tilesPerHour(train: Train, a: number, b: number): number;
}

function routeTiles(state: GameState, route: readonly number[], from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const edge = state.trackGraph.getEdge(route[i] as number, route[i + 1] as number);
    if (edge) sum += edgeLengthTiles(edge);
  }
  return sum;
}

/** Hours until `f` is through station tile `s` heading out along `exit`, or undefined if it is not going that way
 * (or is not a train that can be counted on: only a `moving` train approaching, or one loading at `s`). */
function hoursUntilThrough(
  state: GameState,
  ctx: OvertakeContext,
  f: Train,
  s: number,
  exit: number,
): { hours: number; speed: number } | undefined {
  if (f.inYardOf !== undefined || f.breakdownTicksLeft > 0) return undefined;
  const here = f.route[f.routeIndex] as number;
  const standingAt = here === s && f.edgeProgress === 0 && f.speed === 0;
  if (standingAt && (f.status === "loading" || f.status === "moving")) {
    // Standing at `s`: loading its stop, or just done. Its way on is its route if it has one, else straight on
    // (a straight station has two edges: it leaves by the one it did not come in by) unless it turns round here.
    let out = f.route[f.routeIndex + 1];
    if (out === undefined) {
      const edges = state.trackGraph.neighborsOf(s);
      if (edges.length !== 2 || f.lastApproachNode < 0) return undefined;
      if (reversesAtOrder(f.orders, f.currentOrderIndex)) return undefined;
      out = edges.find((n) => n !== f.lastApproachNode);
    }
    if (out !== exit) return undefined;
    const left =
      f.status === "loading" ? (f.loadTicksLeft >= 0 ? f.loadTicksLeft : stopDwellHours(f)) : 0;
    return { hours: left, speed: ctx.tilesPerHour(f, s, exit) };
  }
  if (f.status !== "moving") return undefined;
  const k = f.route.indexOf(s, f.routeIndex + 1);
  if (k < 0) return undefined;
  // Through `s` along `exit`, or ending its run at `s` and (a straight station, not turning) carrying straight on.
  const last = k === f.route.length - 1;
  if (last) {
    if (state.trackGraph.neighborsOf(s).length !== 2) return undefined;
    if (reversesAtOrder(f.orders, f.currentOrderIndex)) return undefined;
    if (f.route[k - 1] === exit) return undefined;
  } else if (f.route[k + 1] !== exit) return undefined;
  const a = f.route[f.routeIndex] as number;
  const b = f.route[f.routeIndex + 1] as number;
  const speed = ctx.tilesPerHour(f, a, b);
  const first = state.trackGraph.getEdge(a, b);
  const tiles =
    routeTiles(state, f.route, f.routeIndex, k) -
    (first ? edgeLengthTiles(first) * f.edgeProgress : 0);
  const stops = last ? (f.loadTicksLeft >= 0 ? f.loadTicksLeft : stopDwellHours(f)) : 0;
  return { hours: tiles / speed + stops, speed: ctx.tilesPerHour(f, s, exit) };
}

/** The one train `train` should let by before leaving, if any: a train that gets through this station before it would
 * be ready to leave, runs faster, and would therefore catch it before the next station. It picks the soonest such
 * train, never one that is itself waiting (only `moving` or `loading` trains count), so no chain of holds can form. */
export function overtakeBlocker(
  state: GameState,
  ctx: OvertakeContext,
  train: Train,
): Train | undefined {
  const here = train.route[train.routeIndex] as number;
  const exit = train.route[train.routeIndex + 1];
  if (!overtaking.enabled) return undefined;
  if (exit === undefined || train.edgeProgress !== 0 || !ctx.stationTiles.has(here))
    return undefined;
  let end = -1;
  for (let i = train.routeIndex + 1; i < train.route.length; i++)
    if (ctx.stationTiles.has(train.route[i] as number)) {
      end = i;
      break;
    }
  if (end < 0) return undefined;
  const sectionTiles = routeTiles(state, train.route, train.routeIndex, end);
  const mine = ctx.tilesPerHour(train, here, exit);
  let best: { f: Train; hours: number } | undefined;
  for (const f of state.trains) {
    if (f.id === train.id) continue;
    const through = hoursUntilThrough(state, ctx, f, here, exit);
    if (!through || through.speed <= mine) continue;
    // F is through at `hours`; it then runs the section faster than `train`, which left now: F catches it first.
    if (through.hours + sectionTiles / through.speed >= sectionTiles / mine) continue;
    if (!best || through.hours < best.hours) best = { f, hours: through.hours };
  }
  return best?.f;
}
