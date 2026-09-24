/**
 * The sim's single per-hour entrypoint (SPEC §3: 1 tick = 1 in-game hour), shared by the real-time
 * game loop (src/main.ts) and anything driving the sim directly (debug hooks, tests). Bundles
 * train movement with the daily/monthly/yearly economy and finance steps so callers don't have to
 * re-derive the boundary checks themselves.
 */
import { refreshStationEconomy } from "./commands";
import { accrueDailyCargo } from "./economy/cargoFlow";
import { monthlyIndustryStep } from "./economy/processing";
import { monthlyFinanceStep, yearlyFinanceRollover } from "./finance/ledger";
import type { GameState } from "./state";
import { isDayBoundary, isMonthBoundary, isYearBoundary } from "./time";
import { stepTrains } from "./trains";

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
  }

  if (isYearBoundary(state.ticks)) yearlyFinanceRollover(state);
}
