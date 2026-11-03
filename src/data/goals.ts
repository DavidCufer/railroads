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
 * Phase 73: the era row is the REGION'S start year (gb 1830, central-eu 1840, us-west 1860), never the goal's own year: Central
 * Europe's gold was "profit $170k by 1930", the cautious 1930 bot's number, in a game that starts in 1840, and the owner
 * reached it in 1851. A gold goal asks the strong player's year-16 level, with a deadline about twice that. Phase 77: the
 * reference operator (`tests/sim/referenceOperator.ts`) now plays at the V2 strong player's level (its medians), so year 16
 * is allowed again by `goalCalibration`'s unchanged bounds (gold 0.8-3x, silver 0.3-1.5x); the hand-set revenue goals
 * follow the same medians (silver year 12, gold year 16).
 * Rounded down to two significant figures. Operating profit is the Finance overview's: revenue minus running costs
 * (`ledgerOperatingProfit`), no construction.
 */
export type GoalMetric = "profit" | "revenue";

/** Phase 80: the medians below are re-benched with passenger fares x0.92 (`docs/bench/phase80.md`, same bot, seeds and
 * method; the Phase 77 figures are in `docs/bench/phase77.md`). Strong player V2 (Phase 77, `tools/bench/strongPlayer.ts`), Normal, medians ($M, completed years 5 / 10 / 16;
 * `docs/bench/phase77.md`, run on the merged branch with Phases 76 and 78, 10 seeds per era, the runs still alive), after the travellers' game scale of 0.8
 * (`TRIPS_GAME_SCALE`). Replaces the Phase 69 medians (the Phase 59-69 bot, kept as `strongPlayerV1.ts`). 1930: 8 of the 10
 * runs live through the 1931 crisis (the old bot: 3 of 10, so the Phase 69 row was the cautious bot's); these are the
 * survivors' medians, as for every era. */
export const STRONG_PLAYER_MEDIANS: ReadonlyArray<{
  era: number;
  revenue: readonly [number, number, number];
  profit: readonly [number, number, number];
}> = [
  { era: 1840, revenue: [0.69, 1.57, 6.31], profit: [0.29, 0.82, 3.7] },
  { era: 1870, revenue: [1.63, 5.98, 10.66], profit: [0.96, 3.34, 5.92] },
  { era: 1900, revenue: [1.68, 3.54, 6.83], profit: [0.85, 1.48, 2.42] },
  { era: 1930, revenue: [0.78, 0.77, 0.8], profit: [0.23, 0.11, 0.14] },
  { era: 1950, revenue: [2.63, 2.61, 3.42], profit: [0.88, 0.46, 0.5] },
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
    {
      tier: "silver",
      def: {
        type: "annualRevenue",
        amount: strongPlayerAmount("revenue", 12, 1880, 1830),
        byYear: 1880,
      },
    },
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
        amount: strongPlayerAmount("profit", 16, 1865, 1830),
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
        amount: strongPlayerAmount("profit", 16, 1875, 1840),
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
        amount: strongPlayerAmount("revenue", 12, 1880, 1860),
        byYear: 1880,
      },
    },
    {
      tier: "gold",
      def: {
        type: "annualRevenue",
        amount: strongPlayerAmount("revenue", 16, 1900, 1860),
        byYear: 1900,
      },
    },
  ],
};
