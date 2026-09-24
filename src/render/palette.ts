/** Terrain visual palette (SPEC §10.3). Render-only; not game balance data. */
import type { Terrain } from "../sim/map/terrain";

export const TERRAIN_COLORS: Record<Terrain, string> = {
  plain: "#9DBA6A",
  // Lighter "clearing" ground tone — the darker canopy reads as discrete trees on top, not a
  // flat dark tile (see FOREST_CANOPY_COLOR / FOREST_SHADOW_COLOR below).
  forest: "#7FA85C",
  hills: "#A9A46A",
  mountain: "#8C8272",
  desert: "#D8C48A",
  swamp: "#6F8A6A",
  water: "#2E5E8C",
  // river tiles are land with a river running through them — base fill reads as plain,
  // the blue river line is drawn on top.
  river: "#96B569",
};

export const FOREST_CANOPY_COLOR = "#4C7A3E";
export const FOREST_SHADOW_COLOR = "rgba(20, 40, 20, 0.35)";

export const SNOWCAP_COLOR = "#EDEDE8";
export const WATER_DEEP_COLOR = "#2E5E8C";
export const WATER_SHALLOW_COLOR = "#4F86B5";
export const RIVER_LINE_COLOR = "#4A7FB0";

export const SNOWCAP_MIN_ELEVATION = 9;
