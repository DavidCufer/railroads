/**
 * The smallest legal connection (PLAN Phase 33 item 2). A 90° change of direction needs two 45° bends, and a
 * junction needs room for its turnout curve; a player who drags a connection that breaks those rules used to get
 * only a red refusal. This proposes the cheapest build, from the drag's start and near its end, that the build rules
 * accept — ending on a track tile lets it pick the legal join point nearby. Pure.
 */
import { WORLD_SCALE } from "../data/scale";
import { computeBuildPlan, type BuildPlan } from "./commands";
import type { BridgeType } from "../data/track";
import type { GameState } from "./state";
import { findBuildPath } from "./track/pathfind";
import { landPrices } from "./economy/land";

export interface LegalSuggestion {
  path: number[];
  plan: BuildPlan;
}

/** How far (tiles, Chebyshev) the suggested join may sit from where the finger started/ended. */
export const SUGGEST_JOIN_RADIUS = 4;
const MAX_ATTEMPTS = 120;
/** Charge per tile the suggestion ends away from what the player asked for, in new-track tiles. */
const MISS_WEIGHT = 2;

function nearby(state: GameState, tile: number, radius: number, trackOnly: boolean): number[] {
  const w = state.map.width;
  const x = tile % w;
  const y = Math.floor(tile / w);
  const out: Array<{ t: number; d: number }> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= state.map.height) continue;
      const t = ny * w + nx;
      if (trackOnly && state.trackGraph.edgesAt(t).length === 0) continue;
      out.push({
        t,
        d: Math.max(Math.abs(dx), Math.abs(dy)) + (Math.abs(dx) + Math.abs(dy)) / 100,
      });
    }
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.t);
}

function tileDistance(w: number, a: number, b: number): number {
  return Math.hypot((a % w) - (b % w), Math.floor(a / w) - Math.floor(b / w));
}

export function suggestLegalConnection(
  state: GameState,
  start: number,
  goal: number,
  year: number,
  bridge?: BridgeType,
): LegalSuggestion | null {
  if (start === goal) return null;
  const graph = state.trackGraph;
  const stationTiles = new Set(state.stations.map((s) => s.tile));
  const w = state.map.width;
  const land = landPrices(state);
  // Where a finger starts/ends on track, any track tile near it is a candidate join point; off track, the drag's own
  // tile comes first and its neighbours are the fallbacks.
  const starts = [start, ...nearby(state, start, SUGGEST_JOIN_RADIUS, true)].filter(
    (t, i, a) => a.indexOf(t) === i,
  );
  const goals = [
    goal,
    ...nearby(
      state,
      goal,
      graph.edgesAt(goal).length > 0 ? SUGGEST_JOIN_RADIUS : 2,
      graph.edgesAt(goal).length > 0,
    ),
  ].filter((t, i, a) => a.indexOf(t) === i);

  const pairs: Array<{ s: number; g: number; miss: number }> = [];
  for (const s of starts.slice(0, 10)) {
    for (const g of goals.slice(0, 14)) {
      if (s === g) continue;
      pairs.push({ s, g, miss: tileDistance(w, s, start) + tileDistance(w, g, goal) });
    }
  }
  pairs.sort((a, b) => a.miss - b.miss);

  let best: { suggestion: LegalSuggestion; score: number } | null = null;
  for (const { s, g, miss } of pairs.slice(0, MAX_ATTEMPTS)) {
    if (best && miss * MISS_WEIGHT >= best.score) break; // later pairs only miss by more
    const path = findBuildPath(state.map, s, g, year, {
      respectTurns: { graph, stationTiles },
      land,
      searchPadding: 6 * WORLD_SCALE,
    });
    if (!path || path.length < 2) continue;
    const plan = computeBuildPlan(state, path, bridge);
    if (!plan.valid || plan.toBuild.length === 0) continue;
    const score = plan.toBuild.length + miss * MISS_WEIGHT;
    if (!best || score < best.score) best = { suggestion: { path, plan }, score };
  }
  return best?.suggestion ?? null;
}
