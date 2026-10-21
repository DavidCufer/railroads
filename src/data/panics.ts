/** Financial panics (Phase 39): real crashes that hit railway companies. Each one happens in its year (the month and
 * the depth are drawn from the game's seed, so a seed always has the same history); the difficulty table says how
 * likely, how deep and how long (src/data/finance.ts). */
import type { RegionId } from "../sim/regions/types";

/** How well a panic's figures are backed (Phase 65): sourced = a published series seen while writing this table;
 * derived = worked out from sourced series; recalled = from the AAR/ICC annual totals as remembered, not re-checked
 * (the sources were not reachable from the build container); nearest = no series for this panic, so the nearest
 * sourced panic of its kind. Links and the arithmetic are in docs/PROGRESS.md (Phase 65). */
export type PanicBasis = "sourced" | "derived" | "recalled" | "nearest";

export interface PanicDef {
  year: number;
  /** Name for the news item. */
  name: string;
  /** Regions it hit; absent = all. */
  regions?: readonly RegionId[];
  /** Oil shock (Phase 42): fuel for steam and diesel costs this much more (0.6 = +60 %) while the panic lasts. */
  fuelRise?: number;
  /** Real fall in railway traffic or gross earnings, peak to trough (0.11 = -11 %), before the difficulty's factor. */
  depth: number;
  /** Months from the first fall to traffic being back near its old level (the last PANIC_RECOVERY_MONTHS ease off). */
  months: number;
  basis: PanicBasis;
}

export const PANICS: readonly PanicDef[] = [
  // Pre-1890 US and British panics: no traffic series was reachable. 1873 is the one with evidence (13 big US roads' ton-miles
  // rose 7.48 -> 7.73 bn 1873-74, net earnings flat; the hurt was rates and construction), so the others take the mean of
  // 1873 (0.05) and 1893 (0.11).
  { year: 1837, name: "Panic of 1837", depth: 0.08, months: 24, basis: "nearest" },
  {
    year: 1847,
    name: "Railway mania crash",
    regions: ["gb", "central-eu"],
    depth: 0.05,
    months: 12,
    basis: "nearest",
  },
  { year: 1857, name: "Panic of 1857", depth: 0.08, months: 18, basis: "nearest" },
  {
    year: 1866,
    name: "Overend Gurney crisis",
    regions: ["gb", "central-eu"],
    depth: 0.05,
    months: 12,
    basis: "nearest",
  },
  { year: 1873, name: "Panic of 1873", depth: 0.05, months: 24, basis: "sourced" },
  { year: 1884, name: "Panic of 1884", depth: 0.08, months: 18, basis: "nearest" },
  // US gross earnings, NBER quarterly sums: 1893 $357 M -> 1894 $317 M (-11 %); 1907 $900 M -> 1908 $794 M (-12 %).
  { year: 1893, name: "Panic of 1893", depth: 0.11, months: 24, basis: "sourced" },
  { year: 1907, name: "Panic of 1907", depth: 0.12, months: 18, basis: "sourced" },
  // Operating revenue 1920 $6.23 bn -> 1921 $5.57 bn (-10.6 %) while revenue per freight ton-mile rose 1.07 -> 1.29 cents,
  // so freight volume fell about 26 % (0.894 / 1.206).
  { year: 1920, name: "Post-war slump", depth: 0.26, months: 18, basis: "derived" },
  // US ton-miles 450.2 bn (1929) -> 235.3 bn (1932), -48 %; passenger revenue 1932 48 % below 1930. The fall was spread over
  // three years, so 1929 carries the first part and 1931 the trough (the two run one after the other).
  { year: 1929, name: "Crash of 1929", depth: 0.3, months: 24, basis: "derived" },
  { year: 1931, name: "Banking crisis of 1931", depth: 0.48, months: 30, basis: "sourced" },
  // Ton-miles 362.8 bn (1937) -> 291.9 bn (1938), -19.5 %.
  { year: 1937, name: "Recession of 1937", depth: 0.2, months: 18, basis: "sourced" },
  // Post-war recessions: Class I ton-miles from the AAR totals as remembered (1948-49 -17 %, 1953-54 -10 %, 1957-58 -11 %,
  // 1960-61 -4 %, 1974-75 -12 %, 1979-80 -14 %, 1981-82 -10 %); only the 1980 total (919 bn) was seen again.
  { year: 1948, name: "Recession of 1948", depth: 0.15, months: 15, basis: "recalled" },
  { year: 1953, name: "Recession of 1953", depth: 0.1, months: 12, basis: "recalled" },
  {
    year: 1957,
    name: "Suez oil shock and recession",
    fuelRise: 0.25,
    depth: 0.11,
    months: 15,
    basis: "recalled",
  },
  { year: 1960, name: "Recession of 1960", depth: 0.04, months: 12, basis: "recalled" },
  { year: 1973, name: "Oil crisis", fuelRise: 0.6, depth: 0.12, months: 18, basis: "recalled" },
  {
    year: 1979,
    name: "Second oil crisis",
    fuelRise: 0.5,
    depth: 0.1,
    months: 18,
    basis: "recalled",
  },
  { year: 1981, name: "Recession of 1981", depth: 0.1, months: 18, basis: "recalled" },
];

/** The seeded draw is only noise around the sourced figure: depth and length vary by up to this share either way. */
export const PANIC_NOISE = 0.15;
export const PANIC_DEPTH_MAX = 0.6;
/** Demand comes back over the last this-many months of a panic. */
export const PANIC_RECOVERY_MONTHS = 6;
/** No panic starts in the first this-many months of a game. */
export const PANIC_QUIET_MONTHS = 12;
