/** Scenario runtime (Phase 46): the state of the one scenario a game was started from, and its daily goal check. Pure. */
import { scenarioById, type ScenarioDef } from "../../data/scenarios";
import type { CargoType } from "../../data/cargo";
import { citiesConnectedByTrack } from "../goals/evaluate";
import { ledgerOperatingProfit } from "../../data/finance";
import { calendarFromTicks } from "../time";
import type { GameState } from "../state";
import type { Station } from "../stations/types";

export type ScenarioStatus = "active" | "won" | "lost";
export type ScenarioLossReason = "deadline" | "bankrupt" | "debt";

export interface ScenarioRun {
  id: string;
  status: ScenarioStatus;
  /** 0 until won. */
  stars: 0 | 1 | 2 | 3;
  /** Units delivered towards a `deliver` goal. */
  progress: number;
  endTick?: number;
  reason?: ScenarioLossReason;
}

export function createScenarioRun(id: string): ScenarioRun {
  return { id, status: "active", stars: 0, progress: 0 };
}

/** Applies the scenario's fixed start (cash, opening debt) to a freshly created state. */
export function applyScenarioStart(state: GameState, def: ScenarioDef): void {
  if (def.startCash !== undefined) state.cash = def.startCash;
  if (def.startLoans) {
    state.finance.loans = def.startLoans;
    state.cash += def.startLoans;
  }
  state.scenario = createScenarioRun(def.id);
}

export function scenarioDefOf(state: GameState): ScenarioDef | undefined {
  return state.scenario ? scenarioById(state.scenario.id) : undefined;
}

function yearOf(state: GameState): number {
  return calendarFromTicks(state.startYear, state.ticks).year;
}

/** Stars for a goal finished in `year` with last year's operating profit `profit` (see `ScenarioDef.stars`). */
export function starsFor(def: ScenarioDef, year: number, profit: number): 1 | 2 | 3 {
  const [a, b] = def.stars;
  const extra =
    def.goal.type === "survive"
      ? Number(profit >= a) + Number(profit >= b)
      : Number(year <= a) + Number(profit >= b);
  return (1 + extra) as 1 | 2 | 3;
}

function finish(
  state: GameState,
  run: ScenarioRun,
  def: ScenarioDef,
  result: { won: true } | { won: false; reason: ScenarioLossReason },
): void {
  run.endTick = state.ticks;
  if (result.won) {
    run.status = "won";
    run.stars = starsFor(def, yearOf(state), ledgerOperatingProfit(state.finance.lastYear));
  } else {
    run.status = "lost";
    run.reason = result.reason;
  }
}

/** Current and target figure for the HUD/panel (connect: 0 or 1). */
export function scenarioProgress(state: GameState): { current: number; target: number } | null {
  const def = scenarioDefOf(state);
  const run = state.scenario;
  if (!def || !run) return null;
  const g = def.goal;
  if (g.type === "deliver") return { current: run.progress, target: g.amount };
  if (g.type === "connect") return { current: run.status === "won" ? 1 : 0, target: 1 };
  return { current: state.finance.loans, target: g.maxDebt };
}

export function dailyScenarioStep(state: GameState): void {
  const run = state.scenario;
  if (!run || run.status !== "active") return;
  const def = scenarioById(run.id);
  if (!def) return;
  if (state.finance.bankrupt) return finish(state, run, def, { won: false, reason: "bankrupt" });
  const year = yearOf(state);
  const g = def.goal;
  if (g.type === "survive") {
    if (year < g.untilYear) return;
    if (state.finance.loans < g.maxDebt) finish(state, run, def, { won: true });
    else finish(state, run, def, { won: false, reason: "debt" });
    return;
  }
  const done =
    g.type === "connect"
      ? citiesConnectedByTrack(
          state,
          g.cities.map((n) => state.cities.findIndex((c) => c.name === n)),
        )
      : run.progress >= g.amount;
  if (done) finish(state, run, def, { won: true });
  else if (year > g.byYear) finish(state, run, def, { won: false, reason: "deadline" });
}

/** A paid delivery of `units` of `cargo` at `station`: counts towards a `deliver` goal (at a station near its town, if it names one). */
export function recordScenarioDelivery(
  state: GameState,
  station: Station,
  cargo: CargoType,
  units: number,
): void {
  const run = state.scenario;
  if (!run || run.status !== "active" || units <= 0) return;
  const g = scenarioById(run.id)?.goal;
  if (!g || g.type !== "deliver" || g.cargo !== cargo) return;
  if (g.nearCity) {
    const city = state.cities.find((c) => c.name === g.nearCity?.name);
    if (!city) return;
    const w = state.map.width;
    const d = Math.hypot(
      (station.tile % w) - city.anchorX,
      Math.floor(station.tile / w) - city.anchorY,
    );
    if (d > g.nearCity.withinTiles) return;
  }
  run.progress += units;
}
