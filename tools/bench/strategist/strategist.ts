/**
 * Phase 82: the Strategist. Wraps a V2 bot (`strongBot.ts`) with a lookahead, like a chess engine choosing a move:
 *   - whenever the bot is about to build, the affordable projects (best 4 by payback) and "wait" are the moves;
 *   - for each move the game AND the bot are forked, the move is played, the rest of the horizon is played by the
 *     default policy (V2), and the position is scored;
 *   - the best-scoring move is played for real.
 * The score values the company as net worth plus a multiple of its yearly operating profit (so a line that costs cash now
 * but pays back inside the horizon beats waiting), and a bankruptcy inside the horizon is a loss. Because the panic
 * schedule is part of the state, a crisis inside the horizon shows up in the score (a debt that a credit cut calls, a
 * line that loses money in the slump) without any special rule.
 */
import { netWorth } from "../../../src/sim/finance/ledger";
import { ledgerOperatingProfit } from "../../../src/data/finance";
import { scenarioById } from "../../../src/data/scenarios";
import type { StrongBot } from "../strongBot";
import { forkBot } from "./fork";

export interface StrategistOptions {
  /** Months each move is played forward. */
  horizonMonths: number;
  /** The most projects tried per decision (besides waiting). */
  maxMoves: number;
  /** How many years of operating profit a company is worth on top of its net worth. */
  profitMultiple: number;
  /** Months "wait" holds back building. */
  waitMonths: number;
}

export const DEFAULT_OPTIONS: StrategistOptions = {
  horizonMonths: 18,
  maxMoves: 4,
  profitMultiple: 3,
  waitMonths: 3,
};

export interface StrategistStats {
  decisions: number;
  rollouts: number;
  ms: number;
  picks: Record<string, number>;
  waits: number;
}

const WAIT = "\u0000wait";
const HOUR = 1;
const MONTH_HOURS = 30 * 24 * HOUR;

/** The company's value at the end of a rollout. */
export function score(bot: StrongBot, profitMultiple: number, ratePerMonth = 0): number {
  const s = bot.state;
  if (s.finance.bankrupt) return -1e9;
  const months = s.finance.monthHistory.slice(-6);
  const yearly = months.length
    ? (months.reduce((a, m) => a + ledgerOperatingProfit(m), 0) / months.length) * 12
    : 0;
  return netWorth(s) + profitMultiple * yearly + scenarioBonus(bot, ratePerMonth);
}

/** With a scenario the goal is part of the position: a win (earlier is better), and for a delivery goal the share the
 * company will have delivered by the deadline if it keeps the pace of the last months (`ratePerMonth`). */
export function scenarioBonus(bot: StrongBot, ratePerMonth = 0): number {
  const run = bot.state.scenario;
  const def = run ? scenarioById(run.id) : undefined;
  if (!run || !def) return 0;
  if (run.status === "lost") return -1e9;
  if (run.status === "won") {
    const left = Math.max(
      0,
      (def.goal.type === "survive" ? def.goal.untilYear : def.goal.byYear) - bot.year(),
    );
    return 6e6 + 0.5e6 * run.stars + 0.2e6 * left;
  }
  if (def.goal.type === "deliver") {
    const monthsLeft = Math.max(0, (def.goal.byYear + 1 - bot.year()) * 12);
    const projected = run.progress + Math.max(0, ratePerMonth) * monthsLeft;
    return 5e6 * Math.min(1, projected / def.goal.amount);
  }
  return 0;
}

/** Move labels that serve a scenario's goal (always offered as moves). */
export function goalLabels(bot: StrongBot): string[] {
  const run = bot.state.scenario;
  const def = run ? scenarioById(run.id) : undefined;
  if (!def) return [];
  if (def.goal.type !== "deliver") return [];
  return def.goal.cargo === "silverBars" || def.goal.cargo === "enrichedUranium"
    ? ["chain"]
    : [`freight ${def.goal.cargo}`];
}

function monthOfYear(bot: StrongBot): number {
  return Math.floor(bot.state.ticks / MONTH_HOURS) % 12;
}

/** Plays `months` months; returns the delivery pace (units a month) over the last four. */
function playMonths(bot: StrongBot, months: number): number {
  let mid = bot.state.scenario?.progress ?? 0;
  for (let i = 0; i < months; i++) {
    if (i === months - 4) mid = bot.state.scenario?.progress ?? 0;
    bot.monthA();
    bot.monthB(monthOfYear(bot));
    if (bot.state.finance.bankrupt) break;
  }
  return months >= 4 ? ((bot.state.scenario?.progress ?? 0) - mid) / 4 : 0;
}

export function attachStrategist(
  bot: StrongBot,
  options: Partial<StrategistOptions> = {},
): StrategistStats {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const stats: StrategistStats = { decisions: 0, rollouts: 0, ms: 0, picks: {}, waits: 0 };
  bot.setGoalLabels(goalLabels(bot));
  let lastTick = -1;
  let lastChoice: string | null = null;

  const rollout = (move: string): number => {
    const fork = forkBot(bot);
    // one planning pass (to find the move's build); afterwards the fork only operates, which is what makes rollouts cheap
    fork.setCandidateBudget(1);
    let used = false;
    const holdUntil = fork.state.ticks + opt.waitMonths * MONTH_HOURS;
    fork.setChooser((options) => {
      if (move === WAIT) return fork.state.ticks < holdUntil ? null : (options[0]?.label ?? null);
      if (!used) {
        used = true;
        return options.some((o) => o.label === move) ? move : (options[0]?.label ?? null);
      }
      return options[0]?.label ?? null;
    });
    const pace = playMonths(fork, opt.horizonMonths);
    stats.rollouts++;
    return score(fork, opt.profitMultiple, pace);
  };

  bot.setChooser((options) => {
    const t = bot.state.ticks;
    // one decision per ten-day step: the bot calls this up to six times in a step
    if (t === lastTick) return null;
    lastTick = t;
    const t0 = Date.now();
    const moves = options.slice(0, opt.maxMoves).map((o) => o.label);
    let best = WAIT;
    let bestScore = -Infinity;
    // a company with no line yet never waits: it has nothing to protect and nothing to learn from waiting
    for (const m of bot.lines.length === 0 ? moves : [...moves, WAIT]) {
      const v = rollout(m);
      if (v > bestScore) {
        bestScore = v;
        best = m;
      }
    }
    stats.decisions++;
    stats.ms += Date.now() - t0;
    if (best === WAIT) {
      stats.waits++;
      lastChoice = null;
    } else {
      lastChoice = best;
      stats.picks[best.split(" ")[0] ?? best] = (stats.picks[best.split(" ")[0] ?? best] ?? 0) + 1;
    }
    return lastChoice;
  });
  return stats;
}
