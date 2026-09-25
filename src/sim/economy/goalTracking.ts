/**
 * Daily goal re-check (SPEC §11: "Goals panel shows progress; reaching gold shows a celebration
 * dialog; game continues"). Goals never hard-fail, so this only ever needs to notice a goal going
 * from incomplete to complete — `GameState.goalsCompleted` remembers which ids have already been
 * announced so a re-check doesn't re-fire the news/celebration for one that's already done.
 */
import { evaluateGoals } from "../goals/evaluate";
import { pushNews } from "../news";
import type { GameState } from "../state";

export function dailyGoalsStep(state: GameState): void {
  if (state.goals.length === 0) return;
  for (const status of evaluateGoals(state)) {
    if (!status.complete || state.goalsCompleted.has(status.goal.id)) continue;
    state.goalsCompleted.add(status.goal.id);
    state.pendingGoalCelebrations.push(status.goal);
    pushNews(state, { kind: "goalCompleted", goalId: status.goal.id, tier: status.goal.tier });
  }
}

/** Rolls this year's per-cargo delivered totals into the all-time best-year record (SPEC §11's
 * `delivered` goal — "in a year"), then resets the running counter for the new year. Called at the
 * year boundary, mirroring `yearlyFinanceRollover`'s this-year/last-year pattern. */
export function yearlyCargoDeliveredRollover(state: GameState): void {
  for (const [cargo, amount] of Object.entries(state.cargoDeliveredThisYear)) {
    if (amount === undefined) continue;
    const key = cargo as keyof typeof state.cargoDeliveredBestYear;
    state.cargoDeliveredBestYear[key] = Math.max(state.cargoDeliveredBestYear[key] ?? 0, amount);
  }
  state.cargoDeliveredThisYear = {};
}
