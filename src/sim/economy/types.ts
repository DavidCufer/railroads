/** City and industry instances placed on a generated map (SPEC §4.2 steps 4–5, §8.2, §8.3). */
import type { CargoType } from "../../data/cargo";
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

/** Per-industry processing state (SPEC §8.2), keyed by `Industry.id` in `GameState.industryEconomy`.
 * Raw producers (and Port) have no `consumes`, so their `monthlyOutput` is always their static
 * `produces` table; processors accumulate delivered inputs here and `monthlyOutput` is recomputed
 * from them at each month boundary (src/sim/economy/processing.ts). */
export interface IndustryEconomyState {
  /** Units of each consumed cargo delivered and not yet processed. */
  inputStock: Partial<Record<CargoType, number>>;
  /** This month's actual production capacity per produced cargo — what
   * src/sim/stations/economy.ts distributes to covering stations as daily supply. */
  monthlyOutput: Partial<Record<CargoType, number>>;
}
