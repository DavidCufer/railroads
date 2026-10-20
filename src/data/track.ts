/** Track building balance numbers (SPEC §5.3, §5.4). Logic lives in src/sim/track. */
import { KM_PER_TILE, WORLD_SCALE } from "./scale";
import { TRACK_LABOUR_SHARE, WAGE_1830 } from "./economy";
import type { Terrain } from "../sim/map/terrain";

export type BridgeType = "wood" | "stone" | "steel";

export const TRACK_BASE_COST_PER_TILE = 4_000 / WORLD_SCALE;

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
export const GRADE_SURCHARGE_PER_ELEVATION = 2_000 / WORLD_SCALE;

/** Double track: 1.75× a fresh single-track edge's cost; upgrading existing single track costs
 * the 0.75× delta (Phase 55, was 1.6×/0.6×). Real basis: the second line needs a wider formation, cuttings and
 * embankments, so it costs most of a new line. Over a bridge the fresh-build multiplier is 1.8× (SPEC §5.3), so the
 * upgrade delta there is 0.8×. */
export const DOUBLE_TRACK_MULTIPLIER = 1.75;
export const DOUBLE_TRACK_UPGRADE_MULTIPLIER = DOUBLE_TRACK_MULTIPLIER - 1.0;
export const DOUBLE_TRACK_BRIDGE_MULTIPLIER = 1.8;
export const DOUBLE_TRACK_BRIDGE_UPGRADE_MULTIPLIER = DOUBLE_TRACK_BRIDGE_MULTIPLIER - 1.0;

export const ELECTRIFICATION_COST_PER_EDGE = 6_000 / WORLD_SCALE;
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
  stone: {
    riverCost: 45_000,
    waterCostPerTile: 60_000 / WORLD_SCALE,
    maxWaterSpan: 3 * WORLD_SCALE,
    era: 1840,
  },
  steel: {
    riverCost: 80_000,
    waterCostPerTile: 110_000 / WORLD_SCALE,
    maxWaterSpan: 8 * WORLD_SCALE,
    era: 1870,
  },
};

/** Wooden bridges can't carry a "heavy" weight-class locomotive (SPEC §5.3) — used from Phase 6. */
export const WOODEN_BRIDGE_MAX_WEIGHT_CLASS = "medium";
/** Yearly chance a wooden bridge washes out in a flood event (SPEC §5.3) — used from Phase 8. */
export const WOODEN_BRIDGE_WASHOUT_CHANCE_PER_YEAR = 0.01;

/** Monthly maintenance (SPEC §5.4), scaled by the wage and price indices (`trackEdgeMonthlyCost`).
 * Phase 59: the fixed part of track upkeep is the section gang. Track was kept by a gang under a foreman that walked and
 * kept up one section, and the gang followed the workload: "as few as four men but as many as thirty", a section five to
 * seven miles of single track or three to four of double on busy lines, up to ten to fifteen miles for a gang on a quiet
 * one (a Ma & Pa Railroad foreman and five to seven men to about ten miles; a Canadian National section of about ten;
 * Alabama gangs of ten to fifteen; bridges left to a separate gang). The fixed charge is the lightest of those, four men
 * to fifteen miles (24 km), at the era's wage plus the materials' share (`TRACK_LABOUR_SHARE`); what heavy traffic adds
 * (the bigger gang, the rail and sleeper renewal) is the track wear charge. Before this the fixed upkeep was 5 a month a
 * tile, a fortieth of the real maintenance of way (US railroads spent 211 million dollars on way and structures in 1900
 * on 193,346 miles of line, about 1,090 dollars a mile a year; see PROGRESS Phase 59 for the sources). Double track needs
 * a gang for a shorter section (three to four miles against five to seven: 1.6 times the men per mile); electrification
 * adds a half. */
export const SECTION_GANG_MEN = 4;
export const SECTION_LENGTH_KM = 24;
export const MAINTENANCE_SINGLE =
  (((SECTION_GANG_MEN * KM_PER_TILE) / SECTION_LENGTH_KM) * WAGE_1830) / 12 / TRACK_LABOUR_SHARE;
export const MAINTENANCE_DOUBLE = MAINTENANCE_SINGLE * 1.6;
export const MAINTENANCE_ELECTRIFIED_SURCHARGE = MAINTENANCE_SINGLE * 0.5;
export const MAINTENANCE_BRIDGE: Record<BridgeType, number> = {
  wood: 50,
  stone: 30,
  steel: 40,
};

/** Bulldoze refunds 25% of the edge's recorded build cost (SPEC §5.2). */
export const BULLDOZE_REFUND_FRACTION = 0.25;
