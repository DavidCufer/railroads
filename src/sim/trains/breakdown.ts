/**
 * Monthly breakdown roll (SPEC §7.6): "Monthly breakdown chance = base × (1 + age/20 years) ×
 * (0.5 if serviced at an Engine Shed in the last 60 days)". Called once per month from
 * src/sim/tick.ts, after track/station commands for the month have already applied.
 */
import { DIFFICULTY } from "../../data/finance";
import {
  BREAKDOWN_AGE_DIVISOR_YEARS,
  BREAKDOWN_BASE_CHANCE_BY_RELIABILITY,
  BREAKDOWN_ENGINE_SHED_MULT,
  BREAKDOWN_ENGINE_SHED_WINDOW_DAYS,
  BREAKDOWN_REPAIR_COST,
  BREAKDOWN_REPAIR_MAX_DAYS,
  BREAKDOWN_REPAIR_MIN_DAYS,
  REPAIR_CREW_COST_PER_TILE,
  locomotiveById,
} from "../../data/trains";
import { eraInflation } from "../../data/finance";
import { addExpense } from "../finance/ledger";
import { crewDistanceTiles, crewTotalTicks, planRepairCrew } from "./repairCrew";
import { recordTrainRepair } from "./profit";
import { pushNews } from "../news";
import { nextFloat, nextInt } from "../rng";
import type { GameState } from "../state";
import type { Train } from "./types";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../time";

/** Breaks `train` down where it stands: dispatches a repair crew (Phase 26A), charges the call-out and
 * posts the news. Also used by the debug hook. `days` is the on-site fix time. */
export function startBreakdown(state: GameState, train: Train, days: number): void {
  const inflation = eraInflation(calendarFromTicks(state.startYear, state.ticks).year);
  // Phase 26A: a crew has to reach the train first; the call-out costs more the further it drives.
  const crew = planRepairCrew(state, train, days);
  if (crew) train.repairCrew = crew;
  else delete train.repairCrew;
  train.breakdownTicksLeft = crew ? crewTotalTicks(crew) : days * HOURS_PER_DAY;
  const crewTiles = crew ? crewDistanceTiles(state.map.width, crew) : 0;
  const repairCost = (BREAKDOWN_REPAIR_COST + REPAIR_CREW_COST_PER_TILE * crewTiles) * inflation;
  state.cash -= repairCost;
  addExpense(state, "breakdownRepairs", repairCost);
  recordTrainRepair(train, repairCost);
  pushNews(state, { kind: "breakdown", trainId: train.id });
}

export function monthlyBreakdownStep(state: GameState): void {
  const diffMult = DIFFICULTY[state.difficulty].breakdownMult;

  for (const train of state.trains) {
    if (train.breakdownTicksLeft > 0) continue; // already broken down

    const loco = locomotiveById(train.locoModelId);
    if (!loco) continue;

    const base = BREAKDOWN_BASE_CHANCE_BY_RELIABILITY[loco.reliability] ?? 0.02;
    const ageYears = (state.ticks - train.purchaseTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
    const servicedRecently =
      train.lastServicedTick !== undefined &&
      (state.ticks - train.lastServicedTick) / HOURS_PER_DAY <= BREAKDOWN_ENGINE_SHED_WINDOW_DAYS;
    const chance =
      base *
      (1 + ageYears / BREAKDOWN_AGE_DIVISOR_YEARS) *
      (servicedRecently ? BREAKDOWN_ENGINE_SHED_MULT : 1) *
      diffMult;

    if (nextFloat(state.rng) >= chance) continue;

    startBreakdown(
      state,
      train,
      nextInt(state.rng, BREAKDOWN_REPAIR_MIN_DAYS, BREAKDOWN_REPAIR_MAX_DAYS),
    );
  }
}
