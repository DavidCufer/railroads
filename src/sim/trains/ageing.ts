/**
 * Locomotive ageing (Phase 30A): mechanical age (years since purchase, less what overhauls took off) raises the running
 * cost from `LOCO_PRIME_YEARS` and the breakdown chance towards the locomotive's life; past it the engine is worn out
 * until overhauled or replaced (SPEC §7.6, §9.5b item 3).
 */
import {
  LOCO_AGE_RUNNING_COST_PER_YEAR,
  LOCO_BREAKDOWN_MULT_MAX,
  LOCO_END_OF_LIFE_BREAKDOWN_MULT,
  LOCO_LIFE_YEARS,
  LOCO_OVERAGE_BREAKDOWN_PER_YEAR,
  LOCO_OVERHAUL_AGE_RESET,
  LOCO_OVERHAUL_COST_SHARE,
  LOCO_OVERHAUL_MIN_AGE,
  LOCO_PRIME_YEARS,
  priceIndex,
} from "../../data/economy";
import { locomotiveById, type LocomotiveDef } from "../../data/trains";
import { pushNews } from "../news";
import type { GameState } from "../state";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../time";
import type { Train } from "./types";

export function locoLifeYears(loco: LocomotiveDef): number {
  return LOCO_LIFE_YEARS[loco.type];
}

/** Years since purchase (or since the last locomotive replacement). */
export function calendarAgeYears(state: GameState, train: Train): number {
  return (state.ticks - train.purchaseTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
}

/** Mechanical age: calendar age less what overhauls took off. */
export function mechanicalAgeYears(state: GameState, train: Train): number {
  return Math.max(0, calendarAgeYears(state, train) - (train.ageCreditYears ?? 0));
}

/** Running-cost multiplier from age (1 up to `LOCO_PRIME_YEARS`). */
export function ageRunningCostMult(ageYears: number): number {
  return 1 + LOCO_AGE_RUNNING_COST_PER_YEAR * Math.max(0, ageYears - LOCO_PRIME_YEARS);
}

/** Breakdown-chance multiplier from wear-out: 1 up to prime, `LOCO_END_OF_LIFE_BREAKDOWN_MULT` at the end of life,
 * then rising every year beyond it. */
export function ageBreakdownMult(ageYears: number, loco: LocomotiveDef): number {
  const life = locoLifeYears(loco);
  if (ageYears <= LOCO_PRIME_YEARS) return 1;
  if (ageYears <= life) {
    const t = (ageYears - LOCO_PRIME_YEARS) / (life - LOCO_PRIME_YEARS);
    return 1 + (LOCO_END_OF_LIFE_BREAKDOWN_MULT - 1) * t * t;
  }
  return Math.min(
    LOCO_BREAKDOWN_MULT_MAX,
    LOCO_END_OF_LIFE_BREAKDOWN_MULT + LOCO_OVERAGE_BREAKDOWN_PER_YEAR * (ageYears - life),
  );
}

/** A worn-out locomotive: mechanical age at or beyond the life of its kind. */
export function isWornOut(state: GameState, train: Train): boolean {
  const loco = locomotiveById(train.locoModelId);
  return !!loco && mechanicalAgeYears(state, train) >= locoLifeYears(loco);
}

export interface OverhaulPlan {
  cost: number;
  /** Mechanical age after the overhaul, years. */
  ageAfter: number;
  valid: boolean;
}

/** Prices a general overhaul of `train`'s locomotive without mutating state. */
export function computeOverhaulPlan(state: GameState, train: Train): OverhaulPlan {
  const loco = locomotiveById(train.locoModelId);
  const age = mechanicalAgeYears(state, train);
  if (!loco || age < LOCO_OVERHAUL_MIN_AGE) return { cost: 0, ageAfter: age, valid: false };
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  return {
    cost: loco.cost * LOCO_OVERHAUL_COST_SHARE * priceIndex(year),
    ageAfter: age * (1 - LOCO_OVERHAUL_AGE_RESET),
    valid: true,
  };
}

/** Once a year: tells the player which locomotives have reached the end of their life (one item per train). */
export function yearlyAgeingStep(state: GameState): void {
  for (const train of state.trains) {
    if (train.wornOutNoticed || !isWornOut(state, train)) continue;
    train.wornOutNoticed = true;
    pushNews(state, { kind: "locoWornOut", trainId: train.id });
  }
}
