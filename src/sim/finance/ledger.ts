/**
 * Ledger bookkeeping, monthly maintenance/interest/bankruptcy, and net worth (SPEC §9). Called from
 * src/sim/tick.ts at month/year boundaries, and from src/sim/commands.ts and
 * src/sim/trains/loading.ts for individual revenue/expense events.
 */
import {
  DIFFICULTY,
  LOCO_DEPRECIATION_MIN_FRACTION,
  LOCO_DEPRECIATION_PER_YEAR,
  OPERATING_HISTORY_MONTHS,
  NET_WORTH_CONSTRUCTION_FRACTION,
  emptyLedgerPeriod,
  ledgerOperatingProfit,
  type LedgerPeriod,
} from "../../data/finance";
import { pushNews } from "../news";
import { locomotiveById } from "../../data/trains";
import { mechanicalAgeYears } from "../trains/ageing";
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
  carsUpkeepPerYear,
  locoRunningCostPerYear,
  stationMonthlyCost,
  trackEdgeMonthlyCost,
  trainWagesPerYear,
  wearCostPerUnit,
} from "./costs";
import { NET_WORTH_HISTORY_MAX_SAMPLES } from "./types";
import { panicStartingNow } from "./panics";
import { amortise, creditLimitFor, interestRate, issueLoan } from "./credit";
import {
  PROPERTY_TAX_RATE,
  WEAR_ROUTINE_SHARE,
  incomeTaxRate,
  priceIndex,
} from "../../data/economy";
import { PASSING_LOOP_UPKEEP_MONTHLY } from "../../data/stations";

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

/** Credit limit (SPEC §9.1, Phase 30A): from earnings as well as net worth, see `creditLimitFor`. */
export function computeCreditLimit(state: GameState): number {
  return creditLimitFor(state, netWorth(state));
}

/** Monthly maintenance, interest, bankruptcy check, and the chart's monthly sample (SPEC §9). */
export function monthlyFinanceStep(state: GameState): void {
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const diff = DIFFICULTY[state.difficulty];

  let trackMaint = 0;
  for (const edge of state.trackGraph.allEdges()) trackMaint += trackEdgeMonthlyCost(edge, year);

  let stationMaint = 0;
  for (const station of state.stations)
    stationMaint += station.passingLoop
      ? PASSING_LOOP_UPKEEP_MONTHLY * priceIndex(year)
      : stationMonthlyCost(station.type, year).total;

  let trainMaint = 0;
  let crewWages = 0;
  let trackWear = 0;
  for (const train of state.trains) {
    const loco = locomotiveById(train.locoModelId);
    if (!loco) continue;
    const ageYears = mechanicalAgeYears(state, train);
    const fuel = (train.fuelUnits ?? 0) * priceIndex(year);
    train.fuelUnits = 0;
    const running =
      (locoRunningCostPerYear(loco, ageYears, year) + carsUpkeepPerYear(train.cars, year)) / 12 +
      fuel;
    const wages = trainWagesPerYear(loco, train.cars.length, year) / 12;
    trainMaint += running;
    crewWages += wages;
    recordTrainRunning(train, running);
    recordTrainWages(train, wages);
    // Only the routine share is paid monthly; the renewal share accumulates on the edges until they are relaid.
    const wear = (train.wearUnits ?? 0) * wearCostPerUnit(year) * WEAR_ROUTINE_SHARE;
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
    const interest = state.finance.loans * (interestRate(state, netWorth(state)) / 12);
    addExpense(state, "interest", interest);
    state.cash -= interest;
    // Phase 39: the bonds amortise — the month's slice of principal is paid out of cash, whether or not there is any.
    state.cash -= amortise(state);
  }

  accrueIncomeTax(state);

  const panic = panicStartingNow(state);
  if (panic) pushNews(state, { kind: "panic", name: panic.name, months: panic.months });

  if (diff.bankruptcy) {
    if (state.cash < 0) {
      const limit = computeCreditLimit(state);
      const available = Math.max(0, limit - state.finance.loans);
      const forced = Math.min(available, -state.cash);
      if (forced > 0) {
        issueLoan(state, forced);
        state.cash += forced;
        pushNews(state, { kind: "forcedLoan", amount: forced });
      }
      if (state.cash < 0) {
        // Still negative even after borrowing every dollar of remaining credit.
        state.finance.negativeCashMonths++;
        if (state.finance.negativeCashMonths >= diff.graceMonths) state.finance.bankrupt = true;
        else
          pushNews(state, {
            kind: "insolvent",
            monthsLeft: diff.graceMonths - state.finance.negativeCashMonths,
          });
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

/** The year's income tax on `profit` so far: the rate of `taxYear` on the operating profit after interest, less the
 * losses carried forward (Economic model v2). */
function incomeTaxOn(state: GameState, taxYear: number, profit: number): number {
  if (profit <= 0) return 0;
  const taxable = Math.max(0, profit - (state.finance.taxLossCarry ?? 0));
  const diff = DIFFICULTY[state.difficulty];
  return taxable * incomeTaxRate(taxYear + diff.taxYearShift) * diff.taxMult;
}

/** Provisional income tax (Phase 30B, Playtest 2: "no year-end surprise"): every month-end sets aside the tax due on
 * the year's operating profit so far, less what was already paid this year, as its own ledger line. The year-end
 * rollover trues it up, so a year's total is exactly what the old single year-end charge was. */
function accrueIncomeTax(state: GameState): void {
  const taxYear = calendarFromTicks(state.startYear, Math.max(0, state.ticks - 1)).year;
  const target = incomeTaxOn(state, taxYear, ledgerOperatingProfit(state.finance.thisYear));
  const due = target - (state.finance.taxPaidThisYear ?? 0);
  if (due <= 0) return;
  state.finance.taxPaidThisYear = (state.finance.taxPaidThisYear ?? 0) + due;
  addExpense(state, "incomeTax", due);
  state.cash -= due;
}

/** Settles income tax for the year that has just ended against what the months already set aside: the rest is
 * charged, an overpayment (a bad second half) is refunded into the closing year's ledger line. */
function chargeIncomeTax(state: GameState, taxYear: number): void {
  const profit = ledgerOperatingProfit(state.finance.thisYear);
  const carry = state.finance.taxLossCarry ?? 0;
  const target = incomeTaxOn(state, taxYear, profit);
  // Losses build up the carry; a profitable year uses it up.
  state.finance.taxLossCarry = profit <= 0 ? carry - profit : Math.max(0, carry - profit);
  const due = target - (state.finance.taxPaidThisYear ?? 0);
  state.finance.taxPaidThisYear = 0;
  if (due > 0) {
    addExpense(state, "incomeTax", due);
    state.cash -= due;
  } else if (due < 0) {
    state.finance.thisYear.incomeTax += due;
    state.cash -= due;
  }
}

/** Rolls `thisYear` into `lastYear` at the year boundary (SPEC §9.2's "per year"). */
export function yearlyFinanceRollover(state: GameState): void {
  // The rollover runs in the first hour of the new year; the year being closed is the one before.
  chargeIncomeTax(state, calendarFromTicks(state.startYear, Math.max(0, state.ticks - 1)).year);
  state.finance.lastYear = state.finance.thisYear;
  state.finance.thisYear = emptyLedgerPeriod();
  for (const train of state.trains) rollTrainYear(train);
}
