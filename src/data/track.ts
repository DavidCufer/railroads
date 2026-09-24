/** Track building balance numbers (SPEC §5.3, §5.4). Logic lives in src/sim/track. */
import type { Terrain } from "../sim/map/terrain";

export type BridgeType = "wood" | "stone" | "steel";

export const TRACK_BASE_COST_PER_TILE = 4_000;

/** SPEC §5.3: "use the more expensive of the two tiles". Water/river aren't listed — those
 * edges are priced as bridges instead (see BRIDGE costs below), never through this table. */
export const TERRAIN_COST_MULTIPLIER: Partial<Record<Terrain, number>> = {
  plain: 1.0,
  desert: 1.2,
  forest: 1.5,
  swamp: 2.0,
  hills: 2.0,
  mountain: 4.0,
};

export const DIAGONAL_FACTOR = 1.41;
export const GRADE_SURCHARGE_PER_ELEVATION = 2_000;

/** Double track: 1.6× a fresh single-track edge's cost; upgrading existing single track costs
 * the 0.6× delta. Over a bridge the fresh-build multiplier is 1.8× (SPEC §5.3), so the upgrade
 * delta there is 0.8×. */
export const DOUBLE_TRACK_MULTIPLIER = 1.6;
export const DOUBLE_TRACK_UPGRADE_MULTIPLIER = DOUBLE_TRACK_MULTIPLIER - 1.0;
export const DOUBLE_TRACK_BRIDGE_MULTIPLIER = 1.8;
export const DOUBLE_TRACK_BRIDGE_UPGRADE_MULTIPLIER = DOUBLE_TRACK_BRIDGE_MULTIPLIER - 1.0;

export const ELECTRIFICATION_COST_PER_EDGE = 6_000;
export const ELECTRIFICATION_DOUBLE_SURCHARGE = 0.5;
export const ELECTRIFICATION_ERA = 1905;

/**
 * River bridges cross exactly one river tile (rivers are generated one tile wide) at a flat
 * price. Water bridges price per water tile spanned, with a max span per type. Interpretation
 * (SPEC §5.1 describes edges as connecting adjacent tiles; §5.3's "per water tile, max N tiles"
 * pricing only makes sense for a single structure spanning several tiles) — a bridge is a jump
 * edge directly connecting the land tile on each side of the obstacle, in one of the 8 compass
 * directions; the spanned tiles are not graph nodes, just tiles the structure passes over.
 */
export interface BridgeCostDef {
  /** Flat cost for a single-tile river crossing. */
  riverCost: number | null;
  /** Cost per tile for a water crossing, or null if this type can't cross open water. */
  waterCostPerTile: number | null;
  /** Max number of consecutive water tiles this type can span. */
  maxWaterSpan: number;
  /** First year this bridge type is available. */
  era: number;
}

export const BRIDGE_TYPES: readonly BridgeType[] = ["wood", "stone", "steel"];

export const BRIDGE_COSTS: Record<BridgeType, BridgeCostDef> = {
  wood: { riverCost: 20_000, waterCostPerTile: null, maxWaterSpan: 0, era: 1830 },
  stone: { riverCost: 45_000, waterCostPerTile: 60_000, maxWaterSpan: 3, era: 1840 },
  steel: { riverCost: 80_000, waterCostPerTile: 110_000, maxWaterSpan: 8, era: 1870 },
};

/** Wooden bridges can't carry a "heavy" weight-class locomotive (SPEC §5.3) — used from Phase 6. */
export const WOODEN_BRIDGE_MAX_WEIGHT_CLASS = "medium";
/** Yearly chance a wooden bridge washes out in a flood event (SPEC §5.3) — used from Phase 8. */
export const WOODEN_BRIDGE_WASHOUT_CHANCE_PER_YEAR = 0.01;

/** Monthly maintenance (SPEC §5.4), scaled by era inflation. */
export const MAINTENANCE_SINGLE = 10;
export const MAINTENANCE_DOUBLE = 16;
export const MAINTENANCE_ELECTRIFIED_SURCHARGE = 5;
export const MAINTENANCE_BRIDGE: Record<BridgeType, number> = {
  wood: 50,
  stone: 30,
  steel: 40,
};

/** Bulldoze refunds 25% of the edge's recorded build cost (SPEC §5.2). */
export const BULLDOZE_REFUND_FRACTION = 0.25;
