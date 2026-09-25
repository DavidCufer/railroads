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
  /** Industry dynamics multiplier (SPEC §8.2, Phase 9), only meaningful for raw (terrain-placed)
   * producers — clamped to [0.5, 3] by src/sim/economy/industryDynamics.ts. Undefined/absent means
   * 1 (never grown or shrunk yet). */
  growthMult?: number;
}

/** Per-city growth accumulator (SPEC §8.3, Phase 9), keyed by `City.id` in
 * `GameState.cityGrowth` — see src/sim/economy/cityGrowth.ts. */
export interface CityGrowthState {
  /** Accumulated "growth points" toward the next population step — never reset, only drawn down
   * when a step fires (src/sim/economy/cityGrowth.ts's `applyMonthlyGrowth`). */
  points: number;
  /** Raw delivered-cargo score accumulated so far *this* month (SPEC §8.3's growthScore inputs),
   * drained into `points` at the month boundary — see `accrueCityGrowthScore`. */
  monthlyScore: number;
  /** Sim tick of this city's last Civic Investment (SPEC §8.3: "once per 5 years per city"),
   * or undefined if it's never had one. */
  lastCivicInvestmentTick?: number;
  /** Whether last month's accumulated score cleared `CITY_SERVED_SCORE_THRESHOLD` — used only for
   * the City panel's growth trend arrow (SPEC §10.2), not the growth math itself. */
  lastServed?: boolean;
}
