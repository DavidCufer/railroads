/**
 * Track condition (Phase 30A, PLAYTEST-2 Top 10 #4): rail and sleepers are a wasting asset. Every train that runs over
 * an edge wears it by `wearUnitsPerTile` (tonnage × speed, SPEC §9.5b item 2); the edge's *wear ratio* is its wear
 * per tile and lane divided by what rail laid in that year lasts. Above `SLOW_ORDER_START_RATIO` the track gets a
 * speed restriction (a "slow order") that deepens until the player relays it (`relayTrack`), which costs the
 * renewal share of the wear it has accumulated, at today's prices.
 */
import {
  RAIL_LIFE_UNITS,
  RELAY_OFFER_RATIO,
  SLOW_ORDER_FLOOR_RATIO,
  SLOW_ORDER_MIN_SPEED_MULT,
  SLOW_ORDER_START_RATIO,
  WEAR_ROUTINE_SHARE,
} from "../../data/economy";
import { edgeLengthTiles } from "../trains/geometry";
import { wearCostPerUnit } from "../finance/costs";
import { pushNews } from "../news";
import { calendarFromTicks } from "../time";
import type { GameState } from "../state";
import type { TrackEdge } from "./types";

export function railLifeUnits(laidYear: number): number {
  let life = (RAIL_LIFE_UNITS[0] as { life: number }).life;
  for (const step of RAIL_LIFE_UNITS) if (laidYear >= step.fromYear) life = step.life;
  return life;
}

export function edgeLaidYear(state: GameState, edge: TrackEdge): number {
  return edge.laid ?? state.startYear;
}

/** Wear used up, as a fraction of the rail's life (0 = new, 1 = life expired). Double track shares the traffic. */
export function edgeWearRatio(state: GameState, edge: TrackEdge): number {
  const perTileLane = (edge.wear ?? 0) / (edgeLengthTiles(edge) * (edge.double ? 2 : 1));
  return perTileLane / railLifeUnits(edgeLaidYear(state, edge));
}

/** Speed multiplier a worn edge imposes (1 = none). */
export function slowOrderMult(ratio: number): number {
  if (ratio <= SLOW_ORDER_START_RATIO) return 1;
  const t = Math.min(
    1,
    (ratio - SLOW_ORDER_START_RATIO) / (SLOW_ORDER_FLOOR_RATIO - SLOW_ORDER_START_RATIO),
  );
  return 1 - t * (1 - SLOW_ORDER_MIN_SPEED_MULT);
}

/** Adds the wear of `tilesRun` tiles at `unitsPerTile` to `edge` (called from the train step). */
export function addEdgeWear(edge: TrackEdge, tilesRun: number, unitsPerTile: number): void {
  edge.wear = (edge.wear ?? 0) + tilesRun * unitsPerTile;
}

/** What relaying `edge` costs now: the renewal share of the wear it has taken, at today's price of wear. */
export function relayCost(state: GameState, edge: TrackEdge): number {
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  return (edge.wear ?? 0) * (1 - WEAR_ROUTINE_SHARE) * wearCostPerUnit(year);
}

export interface WornEdge {
  edge: TrackEdge;
  ratio: number;
  cost: number;
}

/** Every edge at or above `minRatio` of its life, worst first (the "relay" list and the slow-order map). */
export function wornEdges(state: GameState, minRatio = RELAY_OFFER_RATIO): WornEdge[] {
  const out: WornEdge[] = [];
  for (const edge of state.trackGraph.allEdges()) {
    const ratio = edgeWearRatio(state, edge);
    if (ratio >= minRatio) out.push({ edge, ratio, cost: relayCost(state, edge) });
  }
  return out.sort((x, y) => y.ratio - x.ratio);
}

/** Edges whose wear currently restricts speed. */
export function slowOrderEdges(state: GameState): WornEdge[] {
  return wornEdges(state, SLOW_ORDER_START_RATIO);
}

/** Resets `edge` to new rail laid in `year`. */
export function relayEdge(edge: TrackEdge, year: number): void {
  edge.wear = 0;
  edge.laid = year;
}

/** Once a year, tells the player how much of the line is under a slow order (one item, not one per edge). */
export function yearlyTrackConditionStep(state: GameState): void {
  const slow = slowOrderEdges(state);
  if (slow.length === 0) return;
  const worst = slow[0] as WornEdge;
  pushNews(state, { kind: "slowOrders", tile: worst.edge.a, edges: slow.length });
}
