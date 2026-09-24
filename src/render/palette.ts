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

/** Track visuals (SPEC §10.3). */
export const TRACK_COLOR = "#3B3430";
export const TIE_COLOR = "#6B5A4A";
export const JUNCTION_DOT_COLOR = "#2A2521";
export const SHARP_TURN_MARKER_COLOR = "#E05A4F";

/** Bridges are drawn distinctively by type (SPEC §5.3): wood trestle brown, stone arches grey,
 * steel truss dark blue-grey. */
export const BRIDGE_COLORS = {
  wood: { deck: "#8A5A3C", trestle: "#5E3B25" },
  stone: { deck: "#8C8C90", trestle: "#6A6A6E" },
  steel: { deck: "#3F4A57", trestle: "#2A323C" },
};

export const GHOST_BUILDABLE_COLOR = "#5BC27A";
export const GHOST_BLOCKED_COLOR = "#E05A4F";
export const GHOST_BULLDOZE_COLOR = "#E05A4F";
export const GHOST_UPGRADE_COLOR = "#4F86B5";

/** Station catchment preview overlay (SPEC §6.1: "tiles tinted" while choosing a station site). */
export const STATION_CATCHMENT_FILL = "rgba(242, 181, 68, 0.22)";
export const STATION_CATCHMENT_BLOCKED_FILL = "rgba(224, 90, 79, 0.22)";
export const STATION_CATCHMENT_BORDER = "rgba(242, 181, 68, 0.85)";

/** Station building colors (SPEC §6.1: "platform + building, bigger for terminals"). */
export const STATION_BUILDING_COLOR = "#8A6A4A";
export const STATION_BUILDING_ROOF_COLOR = "#5E3B25";
export const STATION_PLATFORM_COLOR = "#B8AA8C";
export const STATION_LABEL_COLOR = "#F4F1E8";

/** Locomotive body colors by type (SPEC §7 rendering: "steam: dark body...; diesel: colored hood;
 * electric: boxy + pantograph"). */
export const LOCO_COLORS = {
  steam: {
    boiler: "#4A453C",
    band: "#B59A5C",
    cab: "#6B3F2E",
    cabRoof: "#4A2A1E",
    tender: "#332F2A",
    chimney: "#1C1A17",
  },
  diesel: { body: "#B5533C", stripe: "#F2B544", trim: "#2A2A2E", window: "#CFE0EA" },
  electric: { body: "#4F86B5", roof: "#345470", window: "#CFE0EA", pantograph: "#DCE4E8" },
};
export const LOCO_SMOKE_COLOR = "rgba(210, 208, 202, 0.6)";
export const CAR_OUTLINE_COLOR = "rgba(20, 18, 16, 0.55)";
/** An empty car (SPEC §7 rendering: "grey when empty"). */
export const CAR_EMPTY_COLOR = "#8A8880";

export const TRAIN_SIGNAL_WAIT_COLOR = "#E05A4F";
export const TRAIN_WARNING_COLOR = "#F2B544";

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
