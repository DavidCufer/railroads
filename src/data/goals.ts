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
 * - Every region's SPEC example list gives only 2-3 goals, not always a full bronze/silver/gold
 *   trio, and several omit a target year entirely (e.g. gb's "Deliver 1,000 carloads of coal in a
 *   year", us-east's "Chicago reaches Metropolis"). Where SPEC gives no year, one was chosen that
 *   fits the region's era; where SPEC gives only 2 goals, a third (gold) goal was added using the
 *   same six types to fill out the bronze/silver/gold structure PLAN.md asks for.
 */
import type { CargoType } from "./cargo";
import type { CityTier } from "./cities";
import type { RegionId } from "../sim/regions/types";

export type GoalTier = "bronze" | "silver" | "gold";

/** Author-time goal def — cities by name, not yet resolved to ids. */
export type GoalDefByName =
  | { type: "connect"; cities: string[]; byYear: number }
  | { type: "annualRevenue"; amount: number; byYear: number }
  | { type: "netWorth"; amount: number; byYear: number }
  | { type: "cityTier"; city: string; tier: CityTier; byYear: number }
  | { type: "delivered"; cargo: CargoType; amount: number; withinYear: number }
  | { type: "electrifiedTiles"; amount: number; byYear: number };

export interface RegionGoalDef {
  tier: GoalTier;
  def: GoalDefByName;
}

export const REGION_GOALS: Record<RegionId, RegionGoalDef[]> = {
  "us-east": [
    { tier: "bronze", def: { type: "connect", cities: ["New York", "Chicago"], byYear: 1860 } },
    { tier: "silver", def: { type: "annualRevenue", amount: 5_000_000, byYear: 1880 } },
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
    { tier: "gold", def: { type: "netWorth", amount: 5_000_000, byYear: 1870 } },
  ],
  "central-eu": [
    { tier: "bronze", def: { type: "connect", cities: ["Munich", "Milan"], byYear: 1875 } },
    { tier: "silver", def: { type: "electrifiedTiles", amount: 200, byYear: 1930 } },
    { tier: "gold", def: { type: "netWorth", amount: 30_000_000, byYear: 1930 } },
  ],
  "us-west": [
    {
      tier: "bronze",
      def: { type: "connect", cities: ["Sacramento", "Salt Lake City"], byYear: 1870 },
    },
    { tier: "silver", def: { type: "netWorth", amount: 50_000_000, byYear: 1920 } },
    { tier: "gold", def: { type: "annualRevenue", amount: 10_000_000, byYear: 1900 } },
  ],
};
