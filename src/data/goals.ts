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
import { priceIndex } from "./economy";
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
 * Rounded down to two significant figures. Operating profit is the Finance overview's: revenue minus running costs
 * (`ledgerOperatingProfit`), no construction.
 */
export type GoalMetric = "profit" | "revenue";

/** Strong player, Normal, medians of Phase 65 ($M, completed years 5 / 10 / 16). The 1930 row is of the 3 of 10 runs
 * that were not bankrupt by then (the 1931 Banking crisis), the 1950 row 8 of 10. */
export const STRONG_PLAYER_MEDIANS: ReadonlyArray<{
  era: number;
  revenue: readonly [number, number, number];
  profit: readonly [number, number, number];
}> = [
  { era: 1840, revenue: [1.25, 3.09, 7.18], profit: [0.69, 1.59, 4.34] },
  { era: 1870, revenue: [1.56, 2.24, 5.13], profit: [0.8, 0.7, 2.05] },
  { era: 1900, revenue: [2.96, 5.77, 10.46], profit: [1.48, 2.1, 2.9] },
  { era: 1930, revenue: [1.25, 1.31, 2.99], profit: [0.48, 0.25, 1.09] },
  { era: 1950, revenue: [4.87, 6.61, 7.87], profit: [2.17, 1.49, 1.11] },
];

const YEAR_INDEX = { 5: 0, 10: 1, 16: 2 } as const;

/** The yearly profit or revenue (in dollars of `goalYear`) the strong player reached in its year `yearIndex`, in the era
 * of `eraYear` (formula above; the goal's own year for a region's hand-set goals, the company's start year for a random
 * map's generated one, which has no era of its own). Rounded DOWN to two significant figures: a goal never asks for
 * more than the bench showed. */
export function strongPlayerAmount(
  metric: GoalMetric,
  yearIndex: 5 | 10 | 16,
  goalYear: number,
  eraYear: number = goalYear,
): number {
  let row = STRONG_PLAYER_MEDIANS[0] as (typeof STRONG_PLAYER_MEDIANS)[number];
  for (const r of STRONG_PLAYER_MEDIANS) if (r.era <= eraYear) row = r;
  const median = row[metric][YEAR_INDEX[yearIndex]] * 1_000_000;
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
      def: { type: "annualProfit", amount: strongPlayerAmount("profit", 16, 1870), byYear: 1870 },
    },
  ],
  "central-eu": [
    { tier: "bronze", def: { type: "connect", cities: ["Munich", "Milan"], byYear: 1875 } },
    { tier: "silver", def: { type: "electrifiedTiles", amount: 60 * WORLD_SCALE, byYear: 1930 } },
    {
      tier: "gold",
      def: { type: "annualProfit", amount: strongPlayerAmount("profit", 16, 1930), byYear: 1930 },
    },
  ],
  "us-west": [
    {
      tier: "bronze",
      def: { type: "connect", cities: ["Sacramento", "Salt Lake City"], byYear: 1870 },
    },
    {
      tier: "silver",
      def: { type: "annualRevenue", amount: strongPlayerAmount("revenue", 5, 1920), byYear: 1920 },
    },
    { tier: "gold", def: { type: "annualRevenue", amount: 4_500_000, byYear: 1900 } },
  ],
};
