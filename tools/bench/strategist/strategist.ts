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
  /** With a scenario goal project: build one earning line, then save for the goal project. */
  goalFirst: boolean;
  /** Phase 83 (quick difficulty report): between two lookahead decisions at least this many days apart the bot builds its
   * default best project instead (0 = a decision at every step). */
  decideEveryDays: number;
  /** Phase 87: a connect goal is built in stages, as the solver does. The leg that pays (a line to one of the goal's end
   * cities, or between corridor towns) comes first; the direct link between the two cities is built only once a line has
   * run this many months (0 = the Phase 82b rule: the direct link as soon as it is affordable). */
  connectStageMonths: number;
  /** Phase 87: while a connect goal is staged each line keeps at most this many trains, so the cash goes to the next leg. */
  connectTrainCap: number;
  /** Phase 87: how far (tiles) a staged line may be extended toward the goal's far city. */
  connectExtendReach: number;
}

export const DEFAULT_OPTIONS: StrategistOptions = {
  horizonMonths: 18,
  maxMoves: 4,
  profitMultiple: 3,
  waitMonths: 3,
  goalFirst: true,
  decideEveryDays: 0,
  connectStageMonths: 6,
  connectTrainCap: 2,
  connectExtendReach: 200,
};

export interface StrategistStats {
  decisions: number;
  rollouts: number;
  ms: number;
  picks: Record<string, number>;
  waits: number;
}

const WAIT = "\u0000wait";
/** Hold every other build until the scenario goal's own project is affordable, then build it. */
const SAVE = "\u0000save";
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
  if (def.goal.type === "connect") return 3e6 * bot.corridorProgress();
  if (def.goal.type === "deliver") {
    const cargo = def.goal.cargo;
    const infra = bot.lines.some((l) => l.chain || l.cargo === cargo) ? 2.5e6 : 0;
    const monthsLeft = Math.max(0, (def.goal.byYear + 1 - bot.year()) * 12);
    const projected = run.progress + Math.max(0, ratePerMonth) * monthsLeft;
    return infra + 5e6 * Math.min(1, projected / def.goal.amount);
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

/** Big cities close together: sqrt(population product) / (distance + 10), the cautious player's line ranking. */
function popScore(bot: StrongBot, label: string): number {
  const m = /^pax (.+)-(.+)$/.exec(label);
  if (!m) return 0;
  const a = bot.state.cities.find((c) => c.name === m[1]);
  const b = bot.state.cities.find((c) => c.name === m[2]);
  if (!a || !b) return 0;
  const d = Math.hypot(a.anchorX - b.anchorX, a.anchorY - b.anchorY);
  return Math.sqrt(a.population * b.population) / (d + 10);
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
  const sc = bot.state.scenario ? scenarioById(bot.state.scenario.id) : undefined;
  if (sc?.goal.type === "connect") bot.setConnectGoal(sc.goal.cities[0]!, sc.goal.cities[1]!);
  // a survival goal (the Panic of 1873): two lines, then no more building, and debt repaid out of every dollar above a
  // small cash cushion (the solver's good plan: MAXPAIRS 2, KEEP 300k)
  if (sc?.goal.type === "deliver" && sc.goal.nearCity)
    bot.setDeliverGoal(sc.goal.cargo, sc.goal.nearCity.name, sc.goal.nearCity.withinTiles);
  if (sc?.goal.type === "connect" && opt.connectStageMonths > 0) {
    bot.setTrainCap(Number(process.env["STAGE_CAP"] ?? opt.connectTrainCap));
    bot.setExtendFront(true);
    bot.setLeanGoalLegs(true);
    bot.setExtendReach(opt.connectExtendReach);
    // when the direct link is out of reach at the start, the first leg is built lean (one train), as the solver does
    const direct = bot.goalDirectTotal();
    bot.setLeanFirstLeg(direct !== null && bot.cashAndRoom() < direct);
  }
  const survive = sc?.goal.type === "survive";
  const connect = sc?.goal.type === "connect";
  const deliverFirst = sc?.goal.type === "deliver" && !goalLabels(bot).includes("chain");
  if (survive) {
    bot.setRepayKeep(300_000);
    bot.setWideMoves(40);
  }
  const goal = goalLabels(bot);
  let plan: string | null = null; // a committed SAVE: build the goal project as soon as it is a move
  let lastTick = -1;
  let lastDecision = -1;
  let lastChoice: string | null = null;
  let firstLineTick = -1; // connect goals: when the first line was seen built

  const rollout = (move: string): number => {
    const fork = forkBot(bot);
    // one planning pass (to find the move's build); afterwards the fork only operates, which is what makes rollouts cheap
    fork.setCandidateBudget(1);
    let used = false;
    const holdUntil = fork.state.ticks + opt.waitMonths * MONTH_HOURS;
    fork.setChooser((options) => {
      if (survive && fork.lines.length >= 2) return null;
      if (move === WAIT) return fork.state.ticks < holdUntil ? null : (options[0]?.label ?? null);
      if (move === SAVE) {
        const hit = options.find((o) => goal.some((g) => o.label.startsWith(g)));
        return hit ? hit.label : null;
      }
      if (!used) {
        used = true;
        return options.some((o) => o.label === move) ? move : (options[0]?.label ?? null);
      }
      return options[0]?.label ?? null;
    });
    const pace = playMonths(fork, opt.horizonMonths);
    if (process.env["STDEBUG"] === "2")
      console.log(
        "  rollout",
        move.replace("\u0000", ""),
        `bankrupt ${fork.state.finance.bankrupt} status ${fork.state.scenario?.status} cash ${Math.round(fork.state.cash / 1000)}k loans ${Math.round(fork.state.finance.loans / 1000)}k lines ${fork.lines.length} year ${fork.year()}`,
      );
    stats.rollouts++;
    return score(fork, opt.profitMultiple, pace);
  };

  bot.setChooser((options) => {
    const t = bot.state.ticks;
    // one decision per ten-day step: the bot calls this up to six times in a step
    if (t === lastTick) return null;
    lastTick = t;
    if (survive && bot.lines.length >= 2) return null;
    // a delivery goal that is plain freight (coal to a port): its cargo lines come first, best payback first; the passenger
    // lines that pay for the rest are built only when no goal line is affordable
    if (deliverFirst) {
      const g = options
        .filter((o) => bot.isGoalMove(o.label))
        .sort((p, q) => p.payback - q.payback)[0];
      if (g) {
        stats.picks["goal"] = (stats.picks["goal"] ?? 0) + 1;
        return g.label;
      }
    }
    // a connect goal: build toward it, in order of how directly a project connects the two cities; wait (save) when none
    // of the projects that serve the goal is affordable
    if (connect) {
      if (firstLineTick < 0 && bot.lines.length > 0) firstLineTick = t;
      // staged: until a line has run for `connectStageMonths`, the direct link (rank 0) is not built; the earning legs are
      const staged =
        opt.connectStageMonths > 0 &&
        (firstLineTick < 0 || t - firstLineTick < opt.connectStageMonths * MONTH_HOURS);
      // the first leg: the lookahead picks the earning leg (a line to a goal city or between corridor towns) that leaves the
      // company best off, as the solver's staged plans do ("via Graz", "pre San Francisco")
      if (staged && bot.lines.length === 0) {
        const eligible = options
          .filter((o) => bot.goalRank(o.label) === 1 || bot.goalRank(o.label) === 2)
          .slice(0, opt.maxMoves);
        if (eligible.length > 0) {
          let pick = eligible[0]!.label;
          let pickScore = -Infinity;
          for (const o of eligible) {
            const v = rollout(o.label);
            if (v > pickScore) {
              pickScore = v;
              pick = o.label;
            }
          }
          stats.decisions++;
          stats.picks["goal"] = (stats.picks["goal"] ?? 0) + 1;
          return pick;
        }
      }
      const ranked = options
        .map((o) => ({ o, r: bot.goalRank(o.label) }))
        // a link is paid from the company's own cash: a loan refused half way leaves debt and no track
        .filter((x) => x.r !== 0 || bot.state.cash >= x.o.total + 100_000)
        .filter((x) =>
          staged
            ? // after the first leg only extensions of the line (they share its track); the first leg is a pax line
              x.r === 1 &&
              (bot.lines.length === 0
                ? !x.o.label.startsWith("feeder")
                : x.o.label.startsWith("extend"))
            : x.r < 2 || (x.r === 2 && opt.connectStageMonths <= 0),
        )
        .sort(
          (p, q) =>
            p.r - q.r ||
            (staged && bot.lines.length > 0
              ? Number(q.o.label.startsWith("extend")) - Number(p.o.label.startsWith("extend"))
              : 0) ||
            p.o.payback - q.o.payback,
        );
      if (process.env["STDEBUG"] === "3")
        console.log(
          bot.year(),
          `m${Math.round(t / MONTH_HOURS)} cash ${Math.round(bot.state.cash / 1000)}k lines ${bot.lines.length} staged ${staged}`,
          options
            .map((o) => `${o.label}[r${bot.goalRank(o.label)} pb${o.payback.toFixed(1)}]`)
            .join(" | "),
        );
      if (process.env["STAGE_FIRST"] && bot.lines.length === 0) {
        const f = options.find((o) => o.label.startsWith(process.env["STAGE_FIRST"]!));
        if (f) return f.label;
      }
      if (ranked[0]) {
        stats.picks["goal"] = (stats.picks["goal"] ?? 0) + 1;
        return ranked[0].o.label;
      }
      return bot.lines.length === 0 ? (options[0]?.label ?? null) : null;
    }
    // a scenario whose goal needs a project that costs most of the starting cash (the silver chain): one earning line first,
    // then everything else waits until the goal project is affordable (the solver's staged plan, found by the same reasoning)
    if (!plan && opt.goalFirst && goal.length > 0 && bot.lines.length > 0 && bot.hasGoalMove()) {
      plan = goal[0] ?? null;
      stats.picks["save"] = (stats.picks["save"] ?? 0) + 1;
    }
    if (plan) {
      const hit = options.find((o) => o.label.startsWith(plan as string));
      if (hit) {
        plan = null;
        stats.picks["goal"] = (stats.picks["goal"] ?? 0) + 1;
        return hit.label;
      }
      return null;
    }
    if (opt.decideEveryDays > 0 && lastDecision >= 0 && t - lastDecision < opt.decideEveryDays * 24)
      return options[0]?.label ?? null;
    lastDecision = t;
    const t0 = Date.now();
    const moves = (
      survive
        ? [...options].sort((p, q) => popScore(bot, q.label) - popScore(bot, p.label)).slice(0, 6)
        : options.slice(0, opt.maxMoves)
    ).map((o) => o.label);
    let best = WAIT;
    let bestScore = -Infinity;
    // a company with no line yet never waits: it has nothing to protect and nothing to learn from waiting
    const saving = goal.length > 0 && bot.lines.length > 0 && bot.hasGoalMove() ? [SAVE] : [];
    for (const m of bot.lines.length === 0 ? moves : [...moves, WAIT, ...saving]) {
      const v = rollout(m);
      if (process.env["STDEBUG"])
        console.log(
          bot.year(),
          `cash ${Math.round(bot.state.cash / 1000)}k`,
          m.replace("\u0000", ""),
          Math.round(v / 1000),
        );
      if (v > bestScore) {
        bestScore = v;
        best = m;
      }
    }
    stats.decisions++;
    stats.ms += Date.now() - t0;
    if (best === SAVE) {
      plan = goal[0] ?? null;
      stats.picks["save"] = (stats.picks["save"] ?? 0) + 1;
      lastChoice = null;
    } else if (best === WAIT) {
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
