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

/** City roof colors — red/brown/grey, cycled per building (SPEC §10.3). */
export const CITY_ROOF_COLORS = ["#B5533C", "#8E6B5A", "#7A7A80"];
export const CITY_ROOF_SHADOW = "rgba(20, 15, 10, 0.3)";
export const CITY_WALL_COLOR = "rgba(230, 224, 210, 0.9)";

export const UI_ACCENT = "#F2B544";
export const UI_BG = "rgba(24, 28, 34, 0.88)";
export const UI_GOOD = "#5BC27A";
export const UI_BAD = "#E05A4F";

/** Industry structure colors — kept muted/industrial, distinct from the natural terrain palette. */
export const INDUSTRY_COLORS = {
  timber: "#6B4A2E",
  timberDark: "#4A3320",
  metal: "#5A5A5E",
  metalDark: "#3A3A3E",
  concrete: "#9A9488",
  brick: "#8A5A45",
  smoke: "rgba(220, 220, 220, 0.55)",
  smokeDark: "rgba(150, 150, 150, 0.5)",
  crop: "#C9A63E",
  water: "#4F86B5",
  flame: "#E0863C",
};
