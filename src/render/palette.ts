/** Terrain visual palette (SPEC §10.3). Render-only; not game balance data. */
import type { Terrain } from "../sim/map/terrain";

export const TERRAIN_COLORS: Record<Terrain, string> = {
  plain: "#9DBA6A",
  forest: "#5E8A4A",
  hills: "#A9A46A",
  mountain: "#8C8272",
  desert: "#D8C48A",
  swamp: "#6F8A6A",
  water: "#2E5E8C",
  // river tiles are land with a river running through them — base fill reads as plain,
  // the blue river line is drawn on top.
  river: "#96B569",
};

export const SNOWCAP_COLOR = "#EDEDE8";
export const WATER_DEEP_COLOR = "#2E5E8C";
export const WATER_SHALLOW_COLOR = "#4F86B5";
export const RIVER_LINE_COLOR = "#4A7FB0";

export const SNOWCAP_MIN_ELEVATION = 9;
