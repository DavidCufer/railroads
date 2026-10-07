/** Financial panics (Phase 39): real crashes that hit railway companies. Each one happens in its year (the month and
 * the depth are drawn from the game's seed, so a seed always has the same history); the difficulty table says how
 * likely, how deep and how long (src/data/finance.ts). */
import type { RegionId } from "../sim/regions/types";

export interface PanicDef {
  year: number;
  /** Name for the news item. */
  name: string;
  /** Regions it hit; absent = all. */
  regions?: readonly RegionId[];
  /** Oil shock (Phase 42): fuel for steam and diesel costs this much more (0.6 = +60 %) while the panic lasts. */
  fuelRise?: number;
}

export const PANICS: readonly PanicDef[] = [
  { year: 1837, name: "Panic of 1837" },
  { year: 1847, name: "Railway mania crash", regions: ["gb", "central-eu"] },
  { year: 1857, name: "Panic of 1857" },
  { year: 1866, name: "Overend Gurney crisis", regions: ["gb", "central-eu"] },
  { year: 1873, name: "Panic of 1873" },
  { year: 1884, name: "Panic of 1884" },
  { year: 1893, name: "Panic of 1893" },
  { year: 1907, name: "Panic of 1907" },
  { year: 1920, name: "Post-war slump" },
  { year: 1929, name: "Crash of 1929" },
  { year: 1931, name: "Banking crisis of 1931" },
  { year: 1937, name: "Recession of 1937" },
  { year: 1948, name: "Recession of 1948" },
  { year: 1953, name: "Recession of 1953" },
  { year: 1957, name: "Suez oil shock and recession", fuelRise: 0.25 },
  { year: 1960, name: "Recession of 1960" },
  { year: 1973, name: "Oil crisis", fuelRise: 0.6 },
  { year: 1979, name: "Second oil crisis", fuelRise: 0.5 },
  { year: 1981, name: "Recession of 1981" },
];

/** Base fall in passenger and freight demand: drawn between these (before the difficulty's depth factor). */
export const PANIC_DEPTH_RANGE: readonly [number, number] = [0.2, 0.4];
export const PANIC_DEPTH_MAX = 0.6;
/** Base length in months: drawn between these (before the difficulty's duration factor). */
export const PANIC_MONTHS_RANGE: readonly [number, number] = [12, 24];
/** Demand comes back over the last this-many months of a panic. */
export const PANIC_RECOVERY_MONTHS = 6;
/** No panic starts in the first this-many months of a game. */
export const PANIC_QUIET_MONTHS = 12;
