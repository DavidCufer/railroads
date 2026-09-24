/** City and industry instances placed on a generated map (SPEC §4.2 steps 4–5, §8.2, §8.3). */
import type { CityTier } from "../../data/cities";
import type { IndustryType } from "../../data/industries";

export interface City {
  id: number;
  name: string;
  tier: CityTier;
  population: number;
  /** Anchor tile (where the city was founded from) — footprint grows outward from here. */
  anchorX: number;
  anchorY: number;
  /** All tile indices (`y * map.width + x`) occupied by this city's footprint. */
  tiles: number[];
  /** True if any footprint tile is adjacent to water. */
  coastal: boolean;
}

export interface Industry {
  id: number;
  type: IndustryType;
  x: number;
  y: number;
}
