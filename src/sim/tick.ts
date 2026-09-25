/**
 * The sim's single per-hour entrypoint (SPEC §3: 1 tick = 1 in-game hour), shared by the real-time
 * game loop (src/main.ts) and anything driving the sim directly (debug hooks, tests). Bundles
 * train movement with the daily/monthly/yearly economy and finance steps so callers don't have to
 * re-derive the boundary checks themselves.
 */
import { LOCOMOTIVES } from "../data/trains";
import { refreshStationEconomy } from "./commands";
import { accrueDailyCargo } from "./economy/cargoFlow";
import { monthlyIndustryStep } from "./economy/processing";
import { monthlyFinanceStep, yearlyFinanceRollover } from "./finance/ledger";
import { pushNews } from "./news";
import type { GameState } from "./state";
import { calendarFromTicks, isDayBoundary, isMonthBoundary, isYearBoundary } from "./time";
import { monthlyBreakdownStep } from "./trains/breakdown";
import { yearlyWashoutStep } from "./track/washout";
import { stepTrains } from "./trains";

/** Locomotives newly available in the year that just ended (SPEC §7.7: "when a new model becomes
 * available: news message + card in the yearly report"). Excludes anything already available at
 * the scenario's start year, since those were never "announced" — the player just had them from
 * day one. Exported for the yearly report's technology section. */
export function newlyAvailableLocomotives(state: GameState, endedYear: number) {
  return LOCOMOTIVES.filter((l) => l.introYear === endedYear && l.introYear !== state.startYear);
}

export function advanceOneHour(state: GameState): void {
  state.ticks++;
  stepTrains(state);

  if (isDayBoundary(state.ticks)) accrueDailyCargo(state);

  if (isMonthBoundary(state.ticks)) {
    monthlyIndustryStep(state);
    // Processed cargo's supply figures just changed (monthlyOutput), so the cached per-station
    // supply/accept map needs refreshing before tomorrow's accrual reads it.
    refreshStationEconomy(state);
    monthlyFinanceStep(state);
    monthlyBreakdownStep(state);
  }

  if (isYearBoundary(state.ticks)) {
    const endedYear = calendarFromTicks(state.startYear, state.ticks).year - 1;
    for (const loco of newlyAvailableLocomotives(state, endedYear)) {
      pushNews(state, { kind: "newLocomotive", locoId: loco.id });
    }
    yearlyWashoutStep(state);
    yearlyFinanceRollover(state);
  }
}
