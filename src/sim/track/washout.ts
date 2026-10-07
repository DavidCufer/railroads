/**
 * Wooden bridge washouts (SPEC §5.3): "a 1%/year per bridge chance of washout in a flood event". Called once per year from
 * src/sim/tick.ts. Stone/steel bridges never wash out.
 *
 * Phase 30A (PLAYTEST-2 Bug 2): a washout leaves a persistent record (`GameState.washouts`) — the gap in the line, drawn as a
 * marker by the map — until the player rebuilds the bridge (`rebuildBridge`), in wood again or, as the real crews usually
 * did afterwards, in stone or steel. Trains whose route crossed it find no way through (`noRoute`, "line cut at the bridge").
 */
import { WOODEN_BRIDGE_WASHOUT_CHANCE_PER_YEAR } from "../../data/track";
import { terrainAt } from "../map/terrain";
import { pushNews } from "../news";
import { nextFloat } from "../rng";
import type { GameState } from "../state";
import { calendarFromTicks } from "../time";
import type { TrackEdge } from "./types";

/** A bridge the river took, until it is rebuilt. */
export interface Washout {
  id: number;
  /** The two land ends of the missing bridge (`a < b`), as on the edge it was. */
  a: number;
  b: number;
  /** Tiles the bridge spanned (the water or river). */
  span: number[];
  direction: number;
  year: number;
  /** Whether the lost bridge carried double track / catenary — the rebuilt one does again, at the price. */
  double: boolean;
  electrified: boolean;
  kind: "river" | "water";
}

export function yearlyWashoutStep(state: GameState): void {
  const woodenBridges = state.trackGraph.allEdges().filter((e) => e.bridge === "wood");
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  for (const edge of woodenBridges) {
    if (nextFloat(state.rng) >= WOODEN_BRIDGE_WASHOUT_CHANCE_PER_YEAR) continue;
    washOut(state, edge, year);
  }
}

/** Whether a bridge crosses a river or open water, from the terrain under its span. */
export function bridgeKind(state: GameState, edge: TrackEdge): "river" | "water" {
  return edge.bridgeSpan.every(
    (t) => terrainAt(state.map, t % state.map.width, Math.floor(t / state.map.width)) === "river",
  )
    ? "river"
    : "water";
}

/** Removes `edge` (a bridge) from the track and records the gap. Exposed for the debug hook and tests. */
export function washOut(state: GameState, edge: TrackEdge, year?: number): Washout {
  const record: Washout = {
    id: state.nextWashoutId++,
    a: edge.a,
    b: edge.b,
    span: [...edge.bridgeSpan],
    direction: edge.direction,
    year: year ?? calendarFromTicks(state.startYear, state.ticks).year,
    double: edge.double,
    electrified: edge.electrified,
    kind: bridgeKind(state, edge),
  };
  state.trackGraph.removeEdge(edge.a, edge.b);
  state.finance.capitalInvested -= edge.cost;
  state.washouts.push(record);
  state.trackVersion++;
  pushNews(state, { kind: "washout", tile: edge.a });
  return record;
}

/** The washed-out bridges that cut a train off from the station it is heading for: those whose rebuilding would give it
 * a way through (it has none now). Empty when the train is not cut off, or no single rebuilt bridge reconnects it. */
export function washoutsCuttingTrain(
  state: GameState,
  fromTile: number,
  toTile: number,
): Washout[] {
  if (state.washouts.length === 0 || fromTile === toTile) return [];
  const reach = (extra?: Washout): boolean => {
    const seen = new Set<number>([fromTile]);
    const queue = [fromTile];
    for (let i = 0; i < queue.length; i++) {
      const t = queue[i] as number;
      if (t === toTile) return true;
      const next = state.trackGraph.neighborsOf(t);
      if (extra) {
        if (extra.a === t) next.push(extra.b);
        if (extra.b === t) next.push(extra.a);
      }
      for (const n of next) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return false;
  };
  if (reach()) return [];
  return state.washouts.filter((w) => reach(w));
}
