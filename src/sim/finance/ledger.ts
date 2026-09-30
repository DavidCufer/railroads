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
  OPERATING_HISTORY_MONTHS,
  NET_WORTH_CONSTRUCTION_FRACTION,
  emptyLedgerPeriod,
  ledgerOperatingProfit,
  type LedgerPeriod,
} from "../../data/finance";
import { locomotiveById } from "../../data/trains";
import type { CargoType } from "../../data/cargo";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../time";
import type { GameState } from "../state";
import {
  recordTrainRunning,
  recordTrainWages,
  recordTrainWear,
  rollTrainYear,
} from "../trains/profit";
import {
  locoRunningCostPerYear,
  stationMonthlyCost,
  trackEdgeMonthlyCost,
  trainWagesPerYear,
  wearCostPerUnit,
} from "./costs";
import { NET_WORTH_HISTORY_MAX_SAMPLES } from "./types";
import { PROPERTY_TAX_RATE, incomeTaxRate } from "../../data/economy";

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
  const diff = DIFFICULTY[state.difficulty];

  let trackMaint = 0;
  for (const edge of state.trackGraph.allEdges()) trackMaint += trackEdgeMonthlyCost(edge, year);

  let stationMaint = 0;
  for (const station of state.stations)
    stationMaint += stationMonthlyCost(station.type, year).total;

  let trainMaint = 0;
  let crewWages = 0;
  let trackWear = 0;
  for (const train of state.trains) {
    const loco = locomotiveById(train.locoModelId);
    if (!loco) continue;
    const ageYears = (state.ticks - train.purchaseTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
    const running = locoRunningCostPerYear(loco, ageYears, year) / 12;
    const wages = trainWagesPerYear(loco, train.cars.length, year) / 12;
    trainMaint += running;
    crewWages += wages;
    recordTrainRunning(train, running);
    recordTrainWages(train, wages);
    const wear = (train.wearUnits ?? 0) * wearCostPerUnit(year);
    train.wearUnits = 0;
    trackWear += wear;
    recordTrainWear(train, wear);
  }

  addExpense(state, "trackMaintenance", trackMaint);
  addExpense(state, "stationMaintenance", stationMaint);
  addExpense(state, "trainMaintenance", trainMaint);
  addExpense(state, "crewWages", crewWages);
  const propertyTax = (state.finance.capitalInvested * PROPERTY_TAX_RATE * diff.taxMult) / 12;
  addExpense(state, "propertyTax", propertyTax);
  addExpense(state, "trackWear", trackWear);
  state.cash -= trackMaint + stationMaint + trainMaint + crewWages + trackWear + propertyTax;

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

  state.finance.monthHistory.push(state.finance.thisMonth);
  while (state.finance.monthHistory.length > OPERATING_HISTORY_MONTHS) {
    state.finance.monthHistory.shift();
  }
  state.finance.thisMonth = emptyLedgerPeriod();
}

/** Corporate income tax on the year that has just ended (Economic model v2): the rate of that year on the
 * operating profit after interest, less losses carried forward. Booked into the closing year's ledger. */
function chargeIncomeTax(state: GameState, taxYear: number): void {
  const period = state.finance.thisYear;
  const profit = ledgerOperatingProfit(period);
  const carry = state.finance.taxLossCarry ?? 0;
  if (profit <= 0) {
    state.finance.taxLossCarry = carry - profit;
    return;
  }
  const taxable = Math.max(0, profit - carry);
  state.finance.taxLossCarry = Math.max(0, carry - profit);
  const tax = taxable * incomeTaxRate(taxYear) * DIFFICULTY[state.difficulty].taxMult;
  if (tax <= 0) return;
  addExpense(state, "incomeTax", tax);
  state.cash -= tax;
}

/** Rolls `thisYear` into `lastYear` at the year boundary (SPEC §9.2's "per year"). */
export function yearlyFinanceRollover(state: GameState): void {
  // The rollover runs in the first hour of the new year; the year being closed is the one before.
  chargeIncomeTax(state, calendarFromTicks(state.startYear, Math.max(0, state.ticks - 1)).year);
  state.finance.lastYear = state.finance.thisYear;
  state.finance.thisYear = emptyLedgerPeriod();
  for (const train of state.trains) rollTrainYear(train);
}
