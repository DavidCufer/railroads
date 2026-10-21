/** Achievement checks (Phase 46): each is a pure test on the company's figures; the monthly history step unlocks them. */
import { ACHIEVEMENT_TARGETS as T, type AchievementId } from "../../data/achievements";
import type { GameState } from "../state";
import { KM_PER_TILE } from "../../data/scale";
import { ledgerOperatingProfit } from "../../data/finance";
import { netWorth } from "../finance/ledger";
import { stationCoversCity } from "../contracts/places";
import { calendarFromTicks } from "../time";

export interface HistoryStats {
  trains: number;
  stations: number;
  trackKm: number;
  netWorth: number;
  /** Operating profit of the last completed year (revenue minus running costs, no construction). */
  yearlyProfit: number;
  loans: number;
  hadLoans: boolean;
  bankrupt: boolean;
  runningLine: boolean;
  contractsDone: number;
  bridges: number;
  electrifiedTiles: number;
  metropolisServed: boolean;
  passengers: number;
  freight: number;
  silverBars: number;
  enrichedUranium: number;
  panicsSurvived: number;
  goalsDone: number;
  scenarioWon: boolean;
  yearsPlayed: number;
  hard: boolean;
}

/** Km of track: every edge is one step between neighbouring tiles (a diagonal step is longer). */
export function trackKm(state: GameState): number {
  const w = state.map.width;
  let tiles = 0;
  for (const e of state.trackGraph.allEdges())
    tiles += Math.hypot((e.a % w) - (e.b % w), Math.floor(e.a / w) - Math.floor(e.b / w));
  return tiles * KM_PER_TILE;
}

export function historyStats(state: GameState): HistoryStats {
  const h = state.history;
  let bridges = 0;
  const electrified = new Set<number>();
  for (const e of state.trackGraph.allEdges()) {
    if (e.bridge) bridges++;
    if (e.electrified) {
      electrified.add(e.a);
      electrified.add(e.b);
    }
  }
  const delivered = h.delivered;
  let freight = 0;
  for (const [cargo, units] of Object.entries(delivered))
    if (cargo !== "passengers" && cargo !== "mail") freight += units ?? 0;
  const metropolisServed = state.cities.some(
    (c) =>
      c.tier === "metropolis" &&
      c.tiles.length > 0 &&
      state.stations.some((s) => !s.passingLoop && stationCoversCity(state, s, c)),
  );
  return {
    trains: state.trains.length,
    stations: state.stations.filter((s) => !s.passingLoop).length,
    trackKm: trackKm(state),
    netWorth: netWorth(state),
    yearlyProfit: ledgerOperatingProfit(state.finance.lastYear),
    loans: state.finance.loans,
    hadLoans: !!h.memory.hadLoans,
    bankrupt: state.finance.bankrupt,
    runningLine: !!h.memory.firstLine,
    contractsDone: state.contracts.stats.completed,
    bridges,
    electrifiedTiles: electrified.size,
    metropolisServed,
    passengers: delivered.passengers ?? 0,
    freight,
    silverBars: delivered.silverBars ?? 0,
    enrichedUranium: delivered.enrichedUranium ?? 0,
    panicsSurvived: h.memory.panicsSurvived ?? 0,
    goalsDone: state.goalsCompleted.size,
    scenarioWon: state.scenario?.status === "won",
    yearsPlayed: calendarFromTicks(state.startYear, state.ticks).year - state.startYear,
    hard: state.difficulty === "hard",
  };
}

export const ACHIEVEMENT_CHECKS: Record<AchievementId, (s: HistoryStats) => boolean> = {
  firstTrain: (s) => s.trains >= 1,
  firstLine: (s) => s.runningLine,
  track100: (s) => s.trackKm >= T.track100,
  track1000: (s) => s.trackKm >= T.track1000,
  track5000: (s) => s.trackKm >= T.track5000,
  trains10: (s) => s.trains >= T.trains10,
  trains50: (s) => s.trains >= T.trains50,
  stations20: (s) => s.stations >= T.stations20,
  panicSurvived: (s) => s.panicsSurvived >= 1,
  outOfDebt: (s) => s.hadLoans && s.loans <= 0 && s.trains >= 1,
  firstContract: (s) => s.contractsDone >= 1,
  contracts5: (s) => s.contractsDone >= T.contracts5,
  silverDelivered: (s) => s.silverBars > 0,
  uraniumDelivered: (s) => s.enrichedUranium > 0,
  bridges10: (s) => s.bridges >= T.bridges10,
  electrified: (s) => s.electrifiedTiles > 0,
  metropolisServed: (s) => s.metropolisServed,
  profit500k: (s) => s.yearlyProfit >= T.profit500k,
  profit5M: (s) => s.yearlyProfit >= T.profit5M,
  profit10M: (s) => s.yearlyProfit >= T.profit10M,
  passengers100k: (s) => s.passengers >= T.passengers100k,
  freight10k: (s) => s.freight >= T.freight10k,
  goalReached: (s) => s.goalsDone >= 1,
  scenarioWon: (s) => s.scenarioWon,
  hardSurvivor20: (s) => s.hard && !s.bankrupt && s.yearsPlayed >= T.hardSurvivorYears,
};
