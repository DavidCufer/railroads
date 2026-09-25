/** Renders a `Goal` (SPEC §11) as a human-readable one-line description — shared by the Goals
 * panel, the celebration dialog, and the news toast, so all three describe a goal identically. */
import { CARGO } from "../data/cargo";
import type { GameState } from "../sim/state";
import type { Goal } from "../sim/goals/types";
import { formatMoney } from "./format";
import { strings } from "./strings";

function cityName(state: GameState, cityId: number): string {
  return state.cities[cityId]?.name ?? "?";
}

export function describeGoal(state: GameState, goal: Goal): string {
  const def = goal.def;
  switch (def.type) {
    case "connect":
      return strings.goals.types.connect(def.cityIds.map((id) => cityName(state, id)).join(" – "));
    case "annualRevenue":
      return strings.goals.types.annualRevenue(formatMoney(def.amount));
    case "netWorth":
      return strings.goals.types.netWorth(formatMoney(def.amount));
    case "cityTier":
      return strings.goals.types.cityTier(
        cityName(state, def.cityId),
        strings.city.tierNames[def.tier],
      );
    case "delivered":
      return strings.goals.types.delivered(def.amount, CARGO[def.cargo].name);
    case "electrifiedTiles":
      return strings.goals.types.electrifiedTiles(def.amount);
  }
}

export function goalTargetYear(goal: Goal): number {
  return goal.def.type === "delivered" ? goal.def.withinYear : goal.def.byYear;
}
