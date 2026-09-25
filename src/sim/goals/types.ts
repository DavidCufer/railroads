/**
 * Goals (SPEC §11): data-driven goal types, shared by real-world regions' hand-authored goal sets
 * and random maps' generated ones. A `Goal` is the *resolved* runtime form — city names from
 * `src/data/goals.ts` have already been looked up to concrete `City.id`s (see
 * `src/sim/goals/generate.ts`) — so evaluation never has to re-resolve a name.
 */
import type { CargoType } from "../../data/cargo";
import type { CityTier } from "../../data/cities";
import type { GoalTier } from "../../data/goals";

export type { GoalTier };

/** SPEC §11's six goal types, verbatim, plus a generalization of `connect(cityA, cityB, byYear)`
 * to `cityIds: number[]` (2+ cities that must all be mutually reachable by rail) — needed to
 * express gb's "Connect London-Birmingham-Manchester-Liverpool" example, which names four cities,
 * not two. A 2-element array is exactly SPEC's original pairwise case. */
export type GoalDef =
  | { type: "connect"; cityIds: number[]; byYear: number }
  | { type: "annualRevenue"; amount: number; byYear: number }
  | { type: "netWorth"; amount: number; byYear: number }
  | { type: "cityTier"; cityId: number; tier: CityTier; byYear: number }
  | { type: "delivered"; cargo: CargoType; amount: number; withinYear: number }
  | { type: "electrifiedTiles"; amount: number; byYear: number };

export interface Goal {
  id: string;
  tier: GoalTier;
  def: GoalDef;
}

export interface GoalStatus {
  goal: Goal;
  complete: boolean;
  /** 0-1, clamped — current progress toward `target` (always 0 or 1 for the boolean `connect` goal). */
  progress: number;
  current: number;
  target: number;
  /** The goal's target year (`byYear`/`withinYear`) has passed without it completing — shown as a
   * missed-deadline indicator in the Goals panel. Goals never hard-fail (SPEC: "game continues"),
   * so a goal can still complete after this becomes true. */
  overdue: boolean;
}
