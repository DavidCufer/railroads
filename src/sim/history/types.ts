/** Company history (Phase 46): a yearly snapshot, a timeline of key events and the achievements unlocked, all in the save. */
import type { CargoType } from "../../data/cargo";

/** The company on 1 January of `year` (or the day the history began). */
export interface YearSnapshot {
  year: number;
  netWorth: number;
  /** Revenue of the year before (0 for the first point). */
  revenue: number;
  trackKm: number;
  cash: number;
  loans: number;
}

export type HistoryEventKind =
  | "firstTrain"
  | "firstLine"
  | "track"
  | "panic"
  | "contract"
  | "contractFailed"
  | "goal"
  | "recordRevenue"
  | "avoidedBankruptcy"
  | "bankrupt"
  | "achievement"
  | "scenario";

export interface HistoryEvent {
  tick: number;
  kind: HistoryEventKind;
  /** A name (panic, achievement id, goal tier, "won"/"lost") where the kind has one. */
  text?: string;
  /** A figure where the kind has one (km of track, revenue). */
  value?: number;
}

/** What the monthly step remembers between months, to notice changes. */
export interface HistoryMemory {
  firstTrain?: boolean;
  firstLine?: boolean;
  /** Track milestones (km) already noted. */
  trackKm?: number;
  /** The panic being lived through. */
  panic?: string;
  insolvent?: boolean;
  hadLoans?: boolean;
  bankrupt?: boolean;
  contractsCompleted?: number;
  contractsFailed?: number;
  goalsSeen?: string[];
  scenario?: string;
  recordRevenue?: number;
  panicsSurvived?: number;
}

export interface HistoryState {
  snapshots: YearSnapshot[];
  events: HistoryEvent[];
  /** Achievement id -> the tick it was unlocked. */
  achievements: Record<string, number>;
  /** Units delivered over the whole game, per cargo. */
  delivered: Partial<Record<CargoType, number>>;
  memory: HistoryMemory;
}

export const HISTORY_EVENTS_MAX = 200;
export const HISTORY_SNAPSHOTS_MAX = 150;

export function createHistory(): HistoryState {
  return { snapshots: [], events: [], achievements: {}, delivered: {}, memory: {} };
}
