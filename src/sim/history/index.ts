/**
 * Company history (Phase 46): the yearly snapshot, the timeline of key events and the achievements, kept in `state.history`.
 * The monthly step only *looks* at the state (it never changes the economy), so history cannot change a game.
 */
import { ACHIEVEMENT_IDS } from "../../data/achievements";
import type { CargoType } from "../../data/cargo";
import { ledgerRevenue } from "../../data/finance";
import { netWorth } from "../finance/ledger";
import { activePanic } from "../finance/panics";
import { calendarFromTicks } from "../time";
import type { GameState } from "../state";
import { ACHIEVEMENT_CHECKS, historyStats, trackKm } from "./achievements";
import {
  HISTORY_EVENTS_MAX,
  HISTORY_SNAPSHOTS_MAX,
  type HistoryEvent,
  type HistoryState,
} from "./types";

export { createHistory } from "./types";
export type { HistoryEvent, HistoryState, YearSnapshot } from "./types";

/** Track milestones (km) that make a timeline entry. */
export const TRACK_MILESTONES_KM = [100, 500, 1_000, 2_500, 5_000, 10_000];
/** A revenue record only makes the timeline when it beats the last one by this factor. */
const RECORD_FACTOR = 1.5;

function note(state: GameState, event: Omit<HistoryEvent, "tick">): void {
  const events = state.history.events;
  events.push({ tick: state.ticks, ...event });
  if (events.length > HISTORY_EVENTS_MAX) events.splice(0, events.length - HISTORY_EVENTS_MAX);
}

function pushSnapshot(state: GameState, year: number, revenue: number): void {
  const snaps = state.history.snapshots;
  snaps.push({
    year,
    netWorth: netWorth(state),
    revenue,
    trackKm: trackKm(state),
    cash: state.cash,
    loans: state.finance.loans,
  });
  if (snaps.length > HISTORY_SNAPSHOTS_MAX) snaps.splice(0, snaps.length - HISTORY_SNAPSHOTS_MAX);
}

/** The first point of the charts, at the start of a new game. */
export function startHistory(state: GameState): void {
  pushSnapshot(state, calendarFromTicks(state.startYear, state.ticks).year, 0);
}

/** History begins on a loaded old save: remember what is already there so it is not announced as news. */
function baseline(state: GameState): void {
  const mem = state.history.memory;
  pushSnapshot(state, calendarFromTicks(state.startYear, state.ticks).year, 0);
  mem.firstTrain = state.trains.length > 0;
  mem.firstLine = state.trains.some((t) => t.orders.length >= 2);
  mem.trackKm = Math.max(0, ...TRACK_MILESTONES_KM.filter((m) => m <= trackKm(state)));
  mem.hadLoans = state.finance.loans > 0;
  mem.contractsCompleted = state.contracts.stats.completed;
  mem.contractsFailed = state.contracts.stats.failed;
  mem.goalsSeen = [...state.goalsCompleted];
  mem.bankrupt = state.finance.bankrupt;
  mem.insolvent = state.finance.negativeCashMonths > 0;
  if (state.scenario && state.scenario.status !== "active") mem.scenario = state.scenario.status;
}

/** A paid delivery of `units` of `cargo` (called from the unload, next to the contract and scenario hooks). */
export function recordHistoryDelivery(state: GameState, cargo: CargoType, units: number): void {
  if (units <= 0) return;
  const d = state.history.delivered;
  d[cargo] = (d[cargo] ?? 0) + units;
}

/** At each year boundary (the finance rollover has run): a point for 1 January of the new year, with the revenue of the year that ended. */
export function yearlyHistoryStep(state: GameState): void {
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const revenue = ledgerRevenue(state.finance.lastYear);
  const mem = state.history.memory;
  const record = mem.recordRevenue ?? 0;
  if (record > 0 && revenue >= record * RECORD_FACTOR)
    note(state, { kind: "recordRevenue", value: revenue });
  if (revenue > record) mem.recordRevenue = revenue;
  pushSnapshot(state, year, revenue);
}

/** Once a month: notices what changed (first train, track milestones, panics, contracts, goals ...) and unlocks achievements. */
export function monthlyHistoryStep(state: GameState): void {
  const h: HistoryState = state.history;
  const mem = h.memory;
  // A save from before the history existed: it starts here, so what the company already has is not "new".
  if (h.snapshots.length === 0) baseline(state);

  if (!mem.firstTrain && state.trains.length > 0) {
    mem.firstTrain = true;
    note(state, { kind: "firstTrain" });
  }
  if (!mem.firstLine && state.trains.some((t) => t.orders.length >= 2)) {
    mem.firstLine = true;
    note(state, { kind: "firstLine" });
  }
  const km = trackKm(state);
  const reached = TRACK_MILESTONES_KM.filter((m) => km >= m && m > (mem.trackKm ?? 0));
  if (reached.length > 0) {
    const top = reached[reached.length - 1] as number;
    mem.trackKm = top;
    note(state, { kind: "track", value: top });
  }
  if (state.finance.loans > 0) mem.hadLoans = true;

  const panic = activePanic(state)?.panic.name;
  if (panic && state.trains.length > 0) mem.panic = panic;
  else if (!panic && mem.panic) {
    note(state, { kind: "panic", text: mem.panic });
    mem.panicsSurvived = (mem.panicsSurvived ?? 0) + 1;
    delete mem.panic;
  }
  const insolvent = state.finance.negativeCashMonths > 0;
  if (mem.insolvent && !insolvent && !state.finance.bankrupt)
    note(state, { kind: "avoidedBankruptcy" });
  mem.insolvent = insolvent;
  if (state.finance.bankrupt && !mem.bankrupt) {
    mem.bankrupt = true;
    note(state, { kind: "bankrupt" });
  }

  const stats = state.contracts.stats;
  for (let i = mem.contractsCompleted ?? stats.completed; i < stats.completed; i++)
    note(state, { kind: "contract" });
  for (let i = mem.contractsFailed ?? stats.failed; i < stats.failed; i++)
    note(state, { kind: "contractFailed" });
  mem.contractsCompleted = stats.completed;
  mem.contractsFailed = stats.failed;

  const seen = new Set(mem.goalsSeen ?? []);
  for (const goal of state.goals) {
    if (!state.goalsCompleted.has(goal.id) || seen.has(goal.id)) continue;
    seen.add(goal.id);
    note(state, { kind: "goal", text: goal.tier });
  }
  mem.goalsSeen = [...seen];

  if (
    state.scenario &&
    state.scenario.status !== "active" &&
    mem.scenario !== state.scenario.status
  ) {
    mem.scenario = state.scenario.status;
    note(state, { kind: "scenario", text: state.scenario.status });
  }

  const s = historyStats(state);
  for (const id of ACHIEVEMENT_IDS) {
    if (h.achievements[id] !== undefined || !ACHIEVEMENT_CHECKS[id](s)) continue;
    h.achievements[id] = state.ticks;
    note(state, { kind: "achievement", text: id });
  }
}
