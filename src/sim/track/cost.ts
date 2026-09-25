/**
 * Track cost calculator (SPEC §5.3): per-edge terrain/diagonal/grade cost for plain track, and
 * bridge pricing for river/water crossings. Shared by the A* pathfinder (which needs the cost of
 * a not-yet-built edge) and `buildTrack`/`upgradeTrack` (which charge it).
 */
import { eraInflation } from "../../data/finance";
import {
  BRIDGE_COSTS,
  DIAGONAL_FACTOR,
  DOUBLE_TRACK_BRIDGE_MULTIPLIER,
  DOUBLE_TRACK_BRIDGE_UPGRADE_MULTIPLIER,
  DOUBLE_TRACK_MULTIPLIER,
  DOUBLE_TRACK_UPGRADE_MULTIPLIER,
  ELECTRIFICATION_COST_PER_EDGE,
  ELECTRIFICATION_DOUBLE_SURCHARGE,
  GRADE_SURCHARGE_PER_ELEVATION,
  TERRAIN_COST_MULTIPLIER,
  TRACK_BASE_COST_PER_TILE,
  type BridgeType,
} from "../../data/track";
import { tileIndex } from "../map/grid";
import { terrainAt } from "../map/terrain";
import type { GameMap } from "../map/types";

export interface CostContext {
  year: number;
  /** Difficulty build-cost multiplier (SPEC §9.6): Easy 0.8, Normal 1.0, Hard 1.2. */
  buildCostMult: number;
}

export type ObstacleKind = "river" | "water";

/** Chebyshev (grid) distance between two tiles, given the map width to decode x/y. */
export function chebyshevDistance(map: GameMap, a: number, b: number): number {
  const ax = a % map.width;
  const ay = Math.floor(a / map.width);
  const bx = b % map.width;
  const by = Math.floor(b / map.width);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function isLand(map: GameMap, tile: number): boolean {
  const t = terrainAt(map, tile % map.width, Math.floor(tile / map.width));
  return t !== "water" && t !== "river";
}

/** Cost of a plain (non-bridge) edge between two adjacent land tiles. */
export function normalEdgeCost(map: GameMap, a: number, b: number, ctx: CostContext): number {
  const ax = a % map.width;
  const ay = Math.floor(a / map.width);
  const bx = b % map.width;
  const by = Math.floor(b / map.width);
  const terrainA = terrainAt(map, ax, ay);
  const terrainB = terrainAt(map, bx, by);
  const multiplier = Math.max(
    TERRAIN_COST_MULTIPLIER[terrainA] ?? 1,
    TERRAIN_COST_MULTIPLIER[terrainB] ?? 1,
  );
  const diagonal = ax !== bx && ay !== by ? DIAGONAL_FACTOR : 1;
  const elevA = map.elevation[tileIndex(map, ax, ay)] as number;
  const elevB = map.elevation[tileIndex(map, bx, by)] as number;
  const grade = GRADE_SURCHARGE_PER_ELEVATION * Math.abs(elevA - elevB);
  const base = TRACK_BASE_COST_PER_TILE * multiplier * diagonal + grade;
  return base * eraInflation(ctx.year) * ctx.buildCostMult;
}

/** Cost of a bridge spanning `spanTiles` river/water tiles, for a given type. */
export function bridgeCost(
  type: BridgeType,
  kind: ObstacleKind,
  spanTiles: number,
  ctx: CostContext,
): number {
  const def = BRIDGE_COSTS[type];
  const base =
    kind === "river" ? (def.riverCost ?? Infinity) : (def.waterCostPerTile ?? Infinity) * spanTiles;
  return base * eraInflation(ctx.year) * ctx.buildCostMult;
}

/** Bridge types that can legally span `spanTiles` of `kind` obstacle in `year`, cheapest first. */
export function validBridgeTypes(
  kind: ObstacleKind,
  spanTiles: number,
  year: number,
): BridgeType[] {
  const types: BridgeType[] = [];
  for (const type of ["wood", "stone", "steel"] as const) {
    const def = BRIDGE_COSTS[type];
    if (def.era > year) continue;
    if (kind === "river") {
      if (spanTiles === 1 && def.riverCost !== null) types.push(type);
    } else {
      if (def.waterCostPerTile !== null && spanTiles <= def.maxWaterSpan) types.push(type);
    }
  }
  return types.sort((x, y) => {
    const cx =
      kind === "river" ? (BRIDGE_COSTS[x].riverCost ?? 0) : (BRIDGE_COSTS[x].waterCostPerTile ?? 0);
    const cy =
      kind === "river" ? (BRIDGE_COSTS[y].riverCost ?? 0) : (BRIDGE_COSTS[y].waterCostPerTile ?? 0);
    return cx - cy;
  });
}

/** Cheapest legal bridge type for this crossing, or null if none are available (blocked). */
export function cheapestBridgeType(
  kind: ObstacleKind,
  spanTiles: number,
  year: number,
): BridgeType | null {
  return validBridgeTypes(kind, spanTiles, year)[0] ?? null;
}

export interface PathStep {
  a: number;
  b: number;
  cost: number;
  bridge: BridgeType | null;
  bridgeKind: ObstacleKind | null;
  bridgeSpan: number[];
  /** True if a step is present but no legal bridge type exists for it (path is invalid). */
  blocked: boolean;
}

/** Classifies and prices every step of a path of land-tile nodes (see track/pathfind.ts for how
 * such paths are built: consecutive entries are either grid-adjacent, or the two land ends of a
 * straight bridge with the spanned water/river tiles skipped). `preferredBridgeType`, when given
 * and legal for a particular crossing, is used instead of the cheapest type — the confirm bar's
 * tap-to-cycle-bridge-type control (SPEC §5.3). */
export function evaluatePath(
  map: GameMap,
  path: readonly number[],
  ctx: CostContext,
  preferredBridgeType?: BridgeType,
): PathStep[] {
  const steps: PathStep[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i] as number;
    const b = path[i + 1] as number;
    const distance = chebyshevDistance(map, a, b);
    if (distance === 1) {
      steps.push({
        a,
        b,
        cost: normalEdgeCost(map, a, b, ctx),
        bridge: null,
        bridgeKind: null,
        bridgeSpan: [],
        blocked: false,
      });
      continue;
    }
    const span = spanTilesBetween(map, a, b);
    const kind: ObstacleKind = span.every(
      (t) => terrainAt(map, t % map.width, Math.floor(t / map.width)) === "river",
    )
      ? "river"
      : "water";
    const valid = validBridgeTypes(kind, span.length, ctx.year);
    const type =
      preferredBridgeType && valid.includes(preferredBridgeType)
        ? preferredBridgeType
        : (valid[0] ?? null);
    steps.push({
      a,
      b,
      cost: type ? bridgeCost(type, kind, span.length, ctx) : 0,
      bridge: type,
      bridgeKind: kind,
      bridgeSpan: span,
      blocked: type === null,
    });
  }
  return steps;
}

/** Tile indices strictly between `a` and `b`, which must be aligned along one of the 8 compass
 * directions (straight line). */
export function spanTilesBetween(map: GameMap, a: number, b: number): number[] {
  const ax = a % map.width;
  const ay = Math.floor(a / map.width);
  const bx = b % map.width;
  const by = Math.floor(b / map.width);
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  const tiles: number[] = [];
  for (let s = 1; s < steps; s++) {
    tiles.push(tileIndex(map, ax + dx * s, ay + dy * s));
  }
  return tiles;
}

export function pathTotalCost(steps: readonly PathStep[]): number {
  return steps.reduce((sum, s) => sum + s.cost, 0);
}

export function pathIsValid(steps: readonly PathStep[]): boolean {
  return steps.length > 0 && steps.every((s) => !s.blocked);
}

/** Cost to upgrade an existing single-track edge to double (SPEC §5.3: 0.6× a fresh edge's cost,
 * 0.8× over a bridge). */
export function doubleUpgradeCost(edge: { cost: number; bridge: string | null }): number {
  const mult = edge.bridge
    ? DOUBLE_TRACK_BRIDGE_UPGRADE_MULTIPLIER
    : DOUBLE_TRACK_UPGRADE_MULTIPLIER;
  return edge.cost * mult;
}

/** Cost of building an edge as double from scratch (fresh single-track cost × multiplier). */
export function freshDoubleCost(singleCost: number, isBridge: boolean): number {
  return singleCost * (isBridge ? DOUBLE_TRACK_BRIDGE_MULTIPLIER : DOUBLE_TRACK_MULTIPLIER);
}

/** Cost to electrify an existing edge (SPEC §5.3: "$6,000 per edge (+50% on double track)"). */
export function electrifyCost(edge: { double: boolean }, ctx: CostContext): number {
  const base =
    ELECTRIFICATION_COST_PER_EDGE * (edge.double ? 1 + ELECTRIFICATION_DOUBLE_SURCHARGE : 1);
  return base * eraInflation(ctx.year) * ctx.buildCostMult;
}
