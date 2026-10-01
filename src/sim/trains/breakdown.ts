/**
 * Monthly breakdown roll (SPEC §7.6): "Monthly breakdown chance = base × (1 + age/20 years) ×
 * (0.5 if serviced at an Engine Shed in the last 60 days)". Called once per month from
 * src/sim/tick.ts, after track/station commands for the month have already applied.
 */
import { DIFFICULTY } from "../../data/finance";
import {
  PROVEN_BREAKDOWN_MULT,
  PROVEN_PARTS_MULT,
  PROVEN_YEARS,
  REPAIR_CREW_SIZE,
  REPAIR_PARTS_AGE_DOUBLING_YEARS,
  REPAIR_PARTS_SHARE_OF_PRICE,
  TEETHING_YEARS,
  WEAR_KM_DOUBLING,
  WORK_DAYS_PER_YEAR,
  priceIndex,
} from "../../data/economy";
import {
  BREAKDOWN_AGE_DIVISOR_YEARS,
  BREAKDOWN_BASE_CHANCE_BY_RELIABILITY,
  BREAKDOWN_SERVICE_MAX_MULT,
  BREAKDOWN_SERVICE_MIN_MULT,
  BREAKDOWN_SERVICE_PER_INTERVAL,
  SERVICE_INTERVAL_KM,
  BREAKDOWN_REPAIR_MAX_DAYS,
  BREAKDOWN_REPAIR_MIN_DAYS,
  locomotiveById,
  type LocomotiveDef,
} from "../../data/trains";
import { KM_PER_TILE } from "../../data/scale";
import { addExpense } from "../finance/ledger";
import { annualWage } from "../finance/costs";
import {
  crewDistanceTiles,
  crewTotalTicks,
  crewVehicle,
  planRepairCrew,
  type RepairCrew,
} from "./repairCrew";
import { recordTrainRepair } from "./profit";
import { ageBreakdownMult, mechanicalAgeYears } from "./ageing";
import { pushNews } from "../news";
import { nextFloat, nextInt } from "../rng";
import type { GameState } from "../state";
import type { Train } from "./types";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../time";

/** Years since the model was introduced (a locomotive bought in 1850 of a 1838 model is 12 years on the market). */
export function modelYearsOnMarket(loco: LocomotiveDef, year: number): number {
  return year - loco.introYear;
}

/** The reliability rating in force this year: one step worse during the model's first `TEETHING_YEARS`. */
export function effectiveReliability(loco: LocomotiveDef, year: number, startYear = 0): number {
  return loco.introYear > startYear && modelYearsOnMarket(loco, year) < TEETHING_YEARS
    ? Math.max(1, loco.reliability - 1)
    : loco.reliability;
}

/** Kilometres `train` has run since it was last serviced at an Engine Shed. */
export function kmSinceService(train: Train): number {
  return Math.max(0, train.distanceTraveled - (train.serviceOdometerTiles ?? 0)) * KM_PER_TILE;
}

/** Breakdown-chance multiplier from kilometres since the last service (see `SERVICE_INTERVAL_KM`). */
export function serviceBreakdownMult(km: number, loco: LocomotiveDef): number {
  return Math.min(
    BREAKDOWN_SERVICE_MAX_MULT,
    BREAKDOWN_SERVICE_MIN_MULT +
      (BREAKDOWN_SERVICE_PER_INTERVAL * km) / SERVICE_INTERVAL_KM[loco.type],
  );
}

/** Chance that `train` breaks down in a given month (SPEC §7.6 + Economic model v2): base by the year's
 * reliability rating × age × kilometres run × proven-design bonus × Engine Shed servicing × difficulty. */
export function monthlyBreakdownChance(state: GameState, train: Train): number {
  const loco = locomotiveById(train.locoModelId);
  if (!loco) return 0;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const base =
    BREAKDOWN_BASE_CHANCE_BY_RELIABILITY[effectiveReliability(loco, year, state.startYear)] ?? 0.02;
  const ageYears = mechanicalAgeYears(state, train);
  const kmRun = train.distanceTraveled * KM_PER_TILE;
  return (
    base *
    (1 + ageYears / BREAKDOWN_AGE_DIVISOR_YEARS) *
    ageBreakdownMult(ageYears, loco) *
    (1 + kmRun / WEAR_KM_DOUBLING) *
    (modelYearsOnMarket(loco, year) > PROVEN_YEARS ? PROVEN_BREAKDOWN_MULT : 1) *
    serviceBreakdownMult(kmSinceService(train), loco) *
    DIFFICULTY[state.difficulty].breakdownMult
  );
}

/** Parts for one repair: a share of the locomotive's price (complexity), dearer as it ages, cheaper for a proven
 * model, at the year's price level. */
export function repairPartsCost(loco: LocomotiveDef, ageYears: number, year: number): number {
  return (
    loco.cost *
    REPAIR_PARTS_SHARE_OF_PRICE *
    (1 + ageYears / REPAIR_PARTS_AGE_DOUBLING_YEARS) *
    (modelYearsOnMarket(loco, year) > PROVEN_YEARS ? PROVEN_PARTS_MULT : 1) *
    priceIndex(year)
  );
}

export interface CallOutCost {
  /** Crew days paid: waiting at the depot, out and back, and the fix itself. */
  crewDays: number;
  wages: number;
  vehicle: number;
  parts: number;
  total: number;
}

/** What one call-out costs: the crew's wages for every day away (distance from the nearest Engine Shed is
 * what makes a far breakdown dear), the vehicle's running cost for the tiles driven both ways, and the parts. */
export function repairCallOutCost(
  state: GameState,
  train: Train,
  crew: RepairCrew | null,
): CallOutCost {
  const loco = locomotiveById(train.locoModelId);
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const ageYears = mechanicalAgeYears(state, train);
  const parts = loco ? repairPartsCost(loco, ageYears, year) : 0;
  if (!crew) return { crewDays: 0, wages: 0, vehicle: 0, parts, total: parts };
  const travelDays = crew.travelTicks / HOURS_PER_DAY;
  const crewDays = (crew.dispatchTicks + crew.fixTicks) / HOURS_PER_DAY + 2 * travelDays;
  const wages = (REPAIR_CREW_SIZE * crewDays * annualWage(year)) / WORK_DAYS_PER_YEAR;
  const tiles = crewDistanceTiles(state.map.width, crew);
  const vehicle = 2 * tiles * crewVehicle(year).costPerTile * priceIndex(year);
  return { crewDays, wages, vehicle, parts, total: wages + vehicle + parts };
}

/** Breaks `train` down where it stands: dispatches a repair crew from the nearest Engine Shed (Phase 26A), charges
 * the call-out (Economic model v2: crew wages for the distance, vehicle, parts) and posts the news. Also used by
 * the debug hook. `days` is the on-site fix time. */
export function startBreakdown(state: GameState, train: Train, days: number): void {
  const crew = planRepairCrew(state, train, days);
  train.breakdownTicksLeft = crew ? crewTotalTicks(crew) : days * HOURS_PER_DAY;
  const cost = repairCallOutCost(state, train, crew);
  if (crew) train.repairCrew = { ...crew, cost };
  else delete train.repairCrew;
  state.cash -= cost.total;
  addExpense(state, "breakdownRepairs", cost.total);
  recordTrainRepair(train, cost.total);
  pushNews(state, { kind: "breakdown", trainId: train.id });
}

export function monthlyBreakdownStep(state: GameState): void {
  for (const train of state.trains) {
    if (train.breakdownTicksLeft > 0) continue; // already broken down
    if (nextFloat(state.rng) >= monthlyBreakdownChance(state, train)) continue;
    startBreakdown(
      state,
      train,
      nextInt(state.rng, BREAKDOWN_REPAIR_MIN_DAYS, BREAKDOWN_REPAIR_MAX_DAYS),
    );
  }
}
