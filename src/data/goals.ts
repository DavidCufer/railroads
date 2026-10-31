/**
 * Per-region goal sets (SPEC §11): one bronze/silver/gold set per shipped region, following SPEC's
 * own example goals as closely as the goal types allow. Author-time format — cities are referenced
 * by name (readable, and robust to a region's city array being re-ordered) and resolved to ids by
 * `src/sim/goals/generate.ts` once a game actually starts.
 *
 * Deviations from SPEC's literal example wording, each because the six goal types don't have an
 * exact-fit representation:
 * - gb's "Connect London-Birmingham-Manchester-Liverpool" names four cities; `connect` is
 *   generalized to accept a list (2+ cities, all mutually reachable by rail) rather than
 *   restricted to SPEC's literal `(cityA, cityB)` pair — see the comment on `GoalDef` in
 *   `src/sim/goals/types.ts`.
 * - central-eu's "connect Munich/Vienna to Milan or Venice/Trieste" is an OR of OR — simplified to
 *   one representative pair (Munich-Milan) rather than adding "any of" logic to the goal system
 *   for a single example.
 * - Phase 28A re-set every money threshold from the Economic model v2 numbers with the reference operator of
 *   `tests/sim/referenceOperator.ts` (an able player compounding the balance report's measured per-train profit,
 *   calibrated to the play-test): gold sits at about 1.2–2× what that operator reaches, silver at about 0.8–1.3×
 *   (`tests/sim/goalCalibration.test.ts` keeps them there). The electrified-tiles goal was 400 tiles (2,000 km).
 * - Every region's SPEC example list gives only 2-3 goals, not always a full bronze/silver/gold
 *   trio, and several omit a target year entirely (e.g. gb's "Deliver 1,000 carloads of coal in a
 *   year", us-east's "Chicago reaches Metropolis"). Where SPEC gives no year, one was chosen that
 *   fits the region's era; where SPEC gives only 2 goals, a third (gold) goal was added using the
 *   same six types to fill out the bronze/silver/gold structure PLAN.md asks for.
 */
import type { CargoType } from "./cargo";
import type { CityTier } from "./cities";
import type { RegionId } from "../sim/regions/types";
import { priceIndex, TRIPS_GAME_SCALE } from "./economy";
import { WORLD_SCALE } from "./scale";

export type GoalTier = "bronze" | "silver" | "gold";

/** Author-time goal def — cities by name, not yet resolved to ids. */
export type GoalDefByName =
  | { type: "connect"; cities: string[]; byYear: number }
  | { type: "annualRevenue"; amount: number; byYear: number }
  | { type: "annualProfit"; amount: number; byYear: number }
  | { type: "cityTier"; city: string; tier: CityTier; byYear: number }
  | { type: "delivered"; cargo: CargoType; amount: number; withinYear: number }
  | { type: "electrifiedTiles"; amount: number; byYear: number };

/**
 * Phase 64: money goals are yearly profit or revenue, never cash or net worth (owner: "we want players to spend money to
 * build things, not hoard it"; net worth counts construction at half, so every dollar of track lowered it).
 *
 * Amounts come from the Phase 65 bench of the strong player (`docs/bench/phase65.md`, Normal, 10 seeds per era, median of
 * the runs still alive), by one formula:
 *
 *   amount = round2( median(metric, era row, year index) x priceIndex(goal year) / priceIndex(year that median was earned) )
 *
 * - `era row`: the latest benched start (1840 / 1870 / 1900 / 1930 / 1950) not after the goal's year, because what a
 *   railway can earn depends on the era's fares and costs it plays in, not on when the company was founded.
 * - `year index`: 16 for a gold goal (a company that has had the strong player's sixteen years to mature, years 5 or 10 for
 *   an earlier tier), the year of the median being start + index - 1.
 * - the inflation factor restates the bench's money in the goal year's money (`priceIndex`, SPEC §9.5).
 * Phase 73: the era row is the REGION'S start year (gb 1830, central-eu 1840, us-west 1860), never the goal's own year: Central
 * Europe's gold was "profit $170k by 1930", the cautious 1930 bot's number, in a game that starts in 1840, and the owner
 * reached it in 1851. A gold goal now asks the strong player's year-14 level, with a deadline about twice that.
 * Rounded down to two significant figures. Operating profit is the Finance overview's: revenue minus running costs
 * (`ledgerOperatingProfit`), no construction.
 */
export type GoalMetric = "profit" | "revenue";

/** Strong player, Normal, medians of Phase 69 ($M, completed years 5 / 10 / 16; `docs/bench/phase69.md`, 10 seeds per era,
 * the runs still alive), after the travellers' game scale of 0.8 (`TRIPS_GAME_SCALE`). Replaces the Phase 67 medians. */
export const STRONG_PLAYER_MEDIANS: ReadonlyArray<{
  era: number;
  revenue: readonly [number, number, number];
  profit: readonly [number, number, number];
}> = [
  { era: 1840, revenue: [0.73, 1.38, 5.49], profit: [0.33, 0.6, 3.12] },
  { era: 1870, revenue: [1.13, 2.74, 9.45], profit: [0.55, 1.13, 4.73] },
  { era: 1900, revenue: [1.63, 5.04, 9.52], profit: [0.74, 2.15, 2.96] },
  // 1930 is the cautious ("good") bot's Normal medians (revenue 0.77 / 1.00 / 1.14, profit 0.29 / 0.31 / 0.19, 5 of 5 alive),
  // not the strong bot's: 7 of its 10 runs go bankrupt in the 1931 crisis (the owner keeps 1930 hard, 2026-10-30) and the
  // 3 survivors' medians (profit 0.27 / 0.07 / 0.02) are no goal. A 1930 goal is what a careful player who survives earns.
  { era: 1930, revenue: [0.77, 1.0, 1.14], profit: [0.29, 0.31, 0.19] },
  { era: 1950, revenue: [3.06, 3.19, 3.5], profit: [1.08, 0.33, 0.57] },
];

const MEDIAN_YEARS = [5, 10, 16] as const;

/** The yearly profit or revenue (in dollars of `goalYear`) the strong player reached in its year `yearIndex`, in the era
 * of `eraYear` (formula above; the goal's own year for a region's hand-set goals, the company's start year for a random
 * map's generated one, which has no era of its own). Rounded DOWN to two significant figures: a goal never asks for
 * more than the bench showed. */
export function strongPlayerAmount(
  metric: GoalMetric,
  yearIndex: number,
  goalYear: number,
  eraYear: number = goalYear,
): number {
  let row = STRONG_PLAYER_MEDIANS[0] as (typeof STRONG_PLAYER_MEDIANS)[number];
  for (const r of STRONG_PLAYER_MEDIANS) if (r.era <= eraYear) row = r;
  // Phase 67: between the benched years 5, 10 and 16 the median is interpolated linearly (a scenario's 7-year length).
  const upper = MEDIAN_YEARS.findIndex((y) => y >= yearIndex);
  const j = upper < 0 ? 2 : Math.max(1, upper);
  const lo = MEDIAN_YEARS[j - 1] as number;
  const hi = MEDIAN_YEARS[j] as number;
  const t = Math.min(1, Math.max(0, (yearIndex - lo) / (hi - lo)));
  const m = row[metric];
  const median = ((m[j - 1] as number) + ((m[j] as number) - (m[j - 1] as number)) * t) * 1_000_000;
  const raw = (median * priceIndex(goalYear)) / priceIndex(row.era + yearIndex - 1);
  const digits = 10 ** (Math.floor(Math.log10(raw)) - 1);
  return Math.floor(raw / digits) * digits;
}

export interface RegionGoalDef {
  tier: GoalTier;
  def: GoalDefByName;
}

export const REGION_GOALS: Record<RegionId, RegionGoalDef[]> = {
  "us-east": [
    { tier: "bronze", def: { type: "connect", cities: ["New York", "Chicago"], byYear: 1860 } },
    { tier: "silver", def: { type: "annualRevenue", amount: 2_500_000, byYear: 1880 } },
    {
      tier: "gold",
      def: { type: "cityTier", city: "Chicago", tier: "metropolis", byYear: 1900 },
    },
  ],
  gb: [
    {
      tier: "bronze",
      def: {
        type: "connect",
        cities: ["London", "Birmingham", "Manchester", "Liverpool"],
        byYear: 1845,
      },
    },
    { tier: "silver", def: { type: "delivered", cargo: "coal", amount: 1000, withinYear: 1850 } },
    {
      tier: "gold",
      def: {
        type: "annualProfit",
        amount: strongPlayerAmount("profit", 14, 1865, 1830),
        byYear: 1865,
      },
    },
  ],
  "central-eu": [
    { tier: "bronze", def: { type: "connect", cities: ["Munich", "Milan"], byYear: 1875 } },
    { tier: "silver", def: { type: "electrifiedTiles", amount: 60 * WORLD_SCALE, byYear: 1930 } },
    {
      tier: "gold",
      def: {
        type: "annualProfit",
        amount: strongPlayerAmount("profit", 14, 1875, 1840),
        byYear: 1875,
      },
    },
  ],
  "us-west": [
    {
      tier: "bronze",
      def: { type: "connect", cities: ["Sacramento", "Salt Lake City"], byYear: 1870 },
    },
    {
      tier: "silver",
      def: {
        type: "annualRevenue",
        amount: strongPlayerAmount("revenue", 5, 1880, 1860),
        byYear: 1880,
      },
    },
    {
      tier: "gold",
      def: { type: "annualRevenue", amount: 4_500_000 * TRIPS_GAME_SCALE, byYear: 1900 },
    },
  ],
};
