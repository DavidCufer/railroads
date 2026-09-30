/**
 * The sim's single per-hour entrypoint (SPEC §3: 1 tick = 1 in-game hour), shared by the real-time
 * game loop (src/main.ts) and anything driving the sim directly (debug hooks, tests). Bundles
 * train movement with the daily/monthly/yearly economy and finance steps so callers don't have to
 * re-derive the boundary checks themselves.
 */
import { LOCOMOTIVES } from "../data/trains";
import { refreshStationEconomy } from "./commands";
import { monthlyDiscoveryStep } from "./economy/discoveries";
import { monthlyFrontierStep } from "./economy/frontier";
import { accrueDailyCargo } from "./economy/cargoFlow";
import { monthlyCityGrowthStep } from "./economy/cityGrowth";
import { yearlyCityFoundingStep } from "./economy/founding";
import { dailyGoalsStep, yearlyCargoDeliveredRollover } from "./economy/goalTracking";
import { monthlyIndustryDynamicsStep } from "./economy/industryDynamics";
import { monthlyIndustryStep } from "./economy/processing";
import { COMPETITION_NEWS_YEARS } from "../data/economy";
import { monthlyFinanceStep, yearlyFinanceRollover } from "./finance/ledger";
import { pushNews } from "./news";
import type { GameState } from "./state";
import { calendarFromTicks, isDayBoundary, isMonthBoundary, isYearBoundary } from "./time";
import { monthlyBreakdownStep } from "./trains/breakdown";
import { yearlyWashoutStep } from "./track/washout";
import { stepTrains } from "./trains";
import { dailyUndeliverableStep } from "./trains/undeliverable";

/** Locomotives newly available in `year` (SPEC §7.7: "when a new model becomes available: news
 * message + card in the yearly report"). Excludes anything already available at the scenario's
 * start year, since those were never "announced" — the player just had them from day one.
 * Exported for the yearly report's technology section. */
export function newlyAvailableLocomotives(state: GameState, year: number) {
  return LOCOMOTIVES.filter((l) => l.introYear === year && l.introYear !== state.startYear);
}

export function advanceOneHour(state: GameState): void {
  state.ticks++;
  stepTrains(state);

  if (isDayBoundary(state.ticks)) {
    accrueDailyCargo(state);
    dailyGoalsStep(state);
    dailyUndeliverableStep(state);
  }

  if (isMonthBoundary(state.ticks)) {
    monthlyIndustryStep(state);
    // Industry dynamics reads this month's `stationCargo` waitingDays (before accrual's next
    // pass touches it again) and may change a raw producer's growthMult or spawn a new industry —
    // either way the next line's refresh needs to run after it, same reasoning as monthlyIndustryStep.
    monthlyIndustryDynamicsStep(state);
    monthlyCityGrowthStep(state);
    monthlyDiscoveryStep(state);
    monthlyFrontierStep(state);
    // Processed cargo's supply figures just changed (monthlyOutput), so the cached per-station
    // supply/accept map needs refreshing before tomorrow's accrual reads it.
    refreshStationEconomy(state);
    monthlyFinanceStep(state);
    monthlyBreakdownStep(state);
  }

  if (isYearBoundary(state.ticks)) {
    // The calendar has just rolled into this new year (SPEC §7.7: announce as soon as a model
    // "becomes available" — it's already purchasable the instant the year turns, so the
    // announcement fires here too, not a year later once that year's own report comes around).
    const year = calendarFromTicks(state.startYear, state.ticks).year;
    for (const loco of newlyAvailableLocomotives(state, year)) {
      pushNews(state, { kind: "newLocomotive", locoId: loco.id });
    }
    for (const mode of ["road", "truck", "air"] as const) {
      if (COMPETITION_NEWS_YEARS[mode] === year) pushNews(state, { kind: "competition", mode });
    }
    yearlyWashoutStep(state);
    yearlyFinanceRollover(state);
    yearlyCargoDeliveredRollover(state);
    yearlyCityFoundingStep(state);
  }
}
