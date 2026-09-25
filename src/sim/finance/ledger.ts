/**
 * Ledger bookkeeping, monthly maintenance/interest/bankruptcy, and net worth (SPEC §9). Called from
 * src/sim/tick.ts at month/year boundaries, and from src/sim/commands.ts and
 * src/sim/trains/loading.ts for individual revenue/expense events.
 */
import {
  BANKRUPTCY_MONTHS,
  CREDIT_LIMIT_FRACTION,
  CREDIT_LIMIT_MIN,
  DIFFICULTY,
  LOCO_DEPRECIATION_MIN_FRACTION,
  LOCO_DEPRECIATION_PER_YEAR,
  NET_WORTH_CONSTRUCTION_FRACTION,
  emptyLedgerPeriod,
  eraInflation,
  type LedgerPeriod,
} from "../../data/finance";
import {
  MAINTENANCE_BRIDGE,
  MAINTENANCE_DOUBLE,
  MAINTENANCE_ELECTRIFIED_SURCHARGE,
  MAINTENANCE_SINGLE,
} from "../../data/track";
import { STATION_TYPE_DEFS } from "../../data/stations";
import {
  locomotiveById,
  OBSOLESCENCE_AGE_YEARS,
  OBSOLESCENCE_MAINTENANCE_MULT,
  STEAM_MAINTENANCE_SURCHARGE_MULT,
  STEAM_MAINTENANCE_SURCHARGE_YEAR,
  type LocomotiveDef,
} from "../../data/trains";
import type { CargoType } from "../../data/cargo";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../time";
import type { GameState } from "../state";
import { NET_WORTH_HISTORY_MAX_SAMPLES } from "./types";

type ExpenseCategory = Exclude<keyof LedgerPeriod, "passengers" | "mail" | "freight">;

export function addRevenue(state: GameState, cargo: CargoType, amount: number): void {
  const bucket: "passengers" | "mail" | "freight" =
    cargo === "passengers" ? "passengers" : cargo === "mail" ? "mail" : "freight";
  state.finance.thisMonth[bucket] += amount;
  state.finance.thisYear[bucket] += amount;
}

export function addExpense(state: GameState, category: ExpenseCategory, amount: number): void {
  state.finance.thisMonth[category] += amount;
  state.finance.thisYear[category] += amount;
}

/** Maintenance multiplier from obsolescence (SPEC §7.6): +50% once a model is more than 25 years
 * past its introduction, and steam pays +50% after 1955 regardless of age — the *higher* of the
 * two applies (not stacked/multiplied together, since SPEC lists them as two separate triggers for
 * the same "maintenance costs more as it ages/the era moves on" idea, not compounding penalties). */
function maintenanceMultiplier(loco: LocomotiveDef, ageYears: number, year: number): number {
  let mult = 1;
  if (ageYears > OBSOLESCENCE_AGE_YEARS) mult = Math.max(mult, OBSOLESCENCE_MAINTENANCE_MULT);
  if (loco.type === "steam" && year > STEAM_MAINTENANCE_SURCHARGE_YEAR) {
    mult = Math.max(mult, STEAM_MAINTENANCE_SURCHARGE_MULT);
  }
  return mult;
}

/** Locomotive/car value, depreciating from purchase price (SPEC §9.3: "5%/year, min 10%"). */
function trainValue(
  state: GameState,
  train: { purchasePrice: number; purchaseTick: number },
): number {
  const ageYears = (state.ticks - train.purchaseTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
  const depreciation = Math.max(
    LOCO_DEPRECIATION_MIN_FRACTION,
    1 - LOCO_DEPRECIATION_PER_YEAR * ageYears,
  );
  return train.purchasePrice * depreciation;
}

/** Net worth (SPEC §9.3). */
export function netWorth(state: GameState): number {
  let rollingStockValue = 0;
  for (const train of state.trains) rollingStockValue += trainValue(state, train);
  return (
    state.cash -
    state.finance.loans +
    NET_WORTH_CONSTRUCTION_FRACTION * state.finance.capitalInvested +
    rollingStockValue
  );
}

/** Credit limit (SPEC §9.1): 50% of net worth, min $500k. */
export function computeCreditLimit(state: GameState): number {
  return Math.max(CREDIT_LIMIT_MIN, netWorth(state) * CREDIT_LIMIT_FRACTION);
}

/** Monthly maintenance, interest, bankruptcy check, and the chart's monthly sample (SPEC §9). */
export function monthlyFinanceStep(state: GameState): void {
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const inflation = eraInflation(year);
  const diff = DIFFICULTY[state.difficulty];

  let trackMaint = 0;
  for (const edge of state.trackGraph.allEdges()) {
    trackMaint += edge.double ? MAINTENANCE_DOUBLE : MAINTENANCE_SINGLE;
    if (edge.electrified) trackMaint += MAINTENANCE_ELECTRIFIED_SURCHARGE;
    if (edge.bridge) trackMaint += MAINTENANCE_BRIDGE[edge.bridge];
  }
  trackMaint *= inflation;

  let stationMaint = 0;
  for (const station of state.stations)
    stationMaint += STATION_TYPE_DEFS[station.type].monthlyMaintenance;
  stationMaint *= inflation;

  let trainMaint = 0;
  for (const train of state.trains) {
    const loco = locomotiveById(train.locoModelId);
    if (!loco) continue;
    const ageYears = (state.ticks - train.purchaseTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
    trainMaint += (loco.maintenancePerYear / 12) * maintenanceMultiplier(loco, ageYears, year);
  }
  trainMaint *= inflation;

  addExpense(state, "trackMaintenance", trackMaint);
  addExpense(state, "stationMaintenance", stationMaint);
  addExpense(state, "trainMaintenance", trainMaint);
  state.cash -= trackMaint + stationMaint + trainMaint;

  if (state.finance.loans > 0) {
    const interest = state.finance.loans * (diff.interestRate / 12);
    addExpense(state, "interest", interest);
    state.cash -= interest;
  }

  if (diff.bankruptcy) {
    if (state.cash < 0) {
      const limit = computeCreditLimit(state);
      const available = Math.max(0, limit - state.finance.loans);
      const forced = Math.min(available, -state.cash);
      if (forced > 0) {
        state.finance.loans += forced;
        state.cash += forced;
      }
      if (state.cash < 0) {
        // Still negative even after borrowing every dollar of remaining credit.
        state.finance.negativeCashMonths++;
        if (state.finance.negativeCashMonths >= BANKRUPTCY_MONTHS) state.finance.bankrupt = true;
      } else {
        state.finance.negativeCashMonths = 0;
      }
    } else {
      state.finance.negativeCashMonths = 0;
    }
  }

  state.finance.netWorthHistory.push({
    tick: state.ticks,
    cash: state.cash,
    netWorth: netWorth(state),
  });
  if (state.finance.netWorthHistory.length > NET_WORTH_HISTORY_MAX_SAMPLES) {
    state.finance.netWorthHistory.shift();
  }

  state.finance.thisMonth = emptyLedgerPeriod();
}

/** Rolls `thisYear` into `lastYear` at the year boundary (SPEC §9.2's "per year"). */
export function yearlyFinanceRollover(state: GameState): void {
  state.finance.lastYear = state.finance.thisYear;
  state.finance.thisYear = emptyLedgerPeriod();
}
