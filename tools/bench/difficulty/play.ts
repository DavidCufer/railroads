/**
 * Phase 83: plays one company for the difficulty report and returns plain numbers.
 * Three players, all settings of the same bot (`strongBot.ts`), no new bots:
 *   - strong   = the Strategist (lookahead; `quick` shortens it: 6 months, the best project against waiting);
 *   - cautious = the plain V2 policy that borrows 40 % as much as V2 (never leans on the lenders), no lookahead;
 *   - sloppy   = the plain V2 policy that, half the time, builds a random affordable project (not the best) and sometimes
 *                waits, drawn from its own seeded generator (the report must stay deterministic).
 */
import "../p79Env";
import "../pairEnv";
import { createGameState, type GameState, type NewGameOptions } from "../../../src/sim/state";
import { scenarioById, scenarioNewGameOptions } from "../../../src/data/scenarios";
import { netWorth } from "../../../src/sim/finance/ledger";
import { ledgerOperatingProfit } from "../../../src/data/finance";
import { panicSchedule } from "../../../src/sim/finance/panics";
import * as commands from "../../../src/sim/commands";
import type { MapSizeName } from "../../../src/data/mapGen";
import { createRng, nextFloat } from "../../../src/sim/rng";
import { createStrongBot } from "../strongBot";
import { attachStrategist } from "../strategist/strategist";

export type Variant = "strong" | "cautious" | "sloppy";

/** What to play: a shipped region, a random map, or a scenario. */
export interface Spec {
  kind: "region" | "random" | "scenario";
  /** Region id, or the scenario id. */
  id: string;
  startYear: number;
  difficulty: "easy" | "normal" | "hard";
  /** Random maps: a smaller map is faster (the tests use "small"). */
  mapSize?: string;
}

export interface PlayOptions {
  seed: number;
  years: number;
  quick: boolean;
  /** Test hook: stop after this many months whatever `years` says. */
  maxMonths?: number;
}

export interface Panic1 {
  name: string;
  /** Years from the start to the start of the downturn. */
  atYear: number;
  depth: number;
}

export interface Run {
  variant: Variant;
  seed: number;
  startCash: number;
  /** Credit limit at the start (what the lenders will lend a new company). */
  startCredit: number;
  bankruptYear: number | null;
  /** Completed-year operating profit, $, year 1... (index 0 = first year played). */
  profit: number[];
  netWorth: number;
  minCash: number;
  /** Months until the trailing three months show an operating profit (null = never). */
  firstProfitMonth: number | null;
  /** Capital in the first line (track, stations, trains) and the years its owner needs to earn it back as operating profit. */
  firstLineCapital: number | null;
  paybackYears: number | null;
  /** Share of months (after year 2) in which cash was over 20 % of net worth: money the company could not use. */
  idleShare: number;
  /** Length in tiles of the lines built (median of the first three). */
  medianLineTiles: number | null;
  panics: Panic1[];
  /** Scenario rows. */
  scenario?: {
    status: string;
    stars: number;
    /** Months before the deadline the goal was reached (negative = late; null = not reached). */
    monthsEarly: number | null;
    /** Last completed year's operating profit over the top star's bar. */
    profitOverBar: number;
  };
  seconds: number;
}

export function newGameOptionsFor(spec: Spec, seed: number): NewGameOptions {
  if (spec.kind === "scenario") {
    const def = scenarioById(spec.id);
    if (!def) throw new Error(`no scenario ${spec.id}`);
    return scenarioNewGameOptions(def);
  }
  if (spec.kind === "region")
    return {
      seed,
      region: spec.id as "central-eu",
      startYear: spec.startYear,
      difficulty: spec.difficulty,
    };
  return {
    seed,
    startYear: spec.startYear,
    difficulty: spec.difficulty,
    size: (spec.mapSize ?? "medium") as MapSizeName,
    waterLevel: "normal",
    roughness: "normal",
  };
}

const monthOfYear = (s: GameState): number => Math.floor(s.ticks / 720) % 12;

export function playCompany(spec: Spec, variant: Variant, o: PlayOptions): Run {
  const t0 = Date.now();
  const state = createGameState(newGameOptionsFor(spec, o.seed));
  const def = spec.kind === "scenario" ? scenarioById(spec.id) : undefined;
  const bot = createStrongBot(state);
  const startCash = state.cash;
  const startCredit = commands.creditLimit(state);
  if (variant === "strong")
    attachStrategist(
      bot,
      o.quick ? { horizonMonths: 6, maxMoves: 1, waitMonths: 3, decideEveryDays: 60 } : {},
    );
  else if (variant === "cautious") bot.setBorrowScale(0.4);
  else {
    const rng = createRng((o.seed * 7919 + 17) >>> 0);
    bot.setChooser((options) => {
      const r = nextFloat(rng);
      if (r < 0.1) return null;
      if (r < 0.5) return options[Math.floor(nextFloat(rng) * options.length)]?.label ?? null;
      return options[0]?.label ?? null;
    });
  }

  const startYear = state.startYear;
  const profit: number[] = [];
  const monthly: number[] = [];
  let minCash = state.cash;
  let bankruptYear: number | null = null;
  let firstProfitMonth: number | null = null;
  let firstLineAt: number | null = null;
  let firstLineCapital: number | null = null;
  let paybackMonths: number | null = null;
  let cumSinceLine = 0;
  let idle = 0;
  let idleBase = 0;
  const lastYear = def
    ? (def.goal.type === "survive" ? def.goal.untilYear : def.goal.byYear) + 1
    : startYear + o.years;
  let months = 0;
  const cap = o.maxMonths ?? Infinity;
  while (months < cap && bot.year() < lastYear && !(def && state.scenario?.status !== "active")) {
    bot.monthA();
    bot.monthB(monthOfYear(state));
    months++;
    minCash = Math.min(minCash, state.cash);
    const mh = state.finance.monthHistory;
    const op = mh.length ? ledgerOperatingProfit(mh[mh.length - 1]!) : 0;
    monthly.push(op);
    if (firstLineAt === null && bot.lines.length >= 1) {
      firstLineAt = months;
      firstLineCapital = state.finance.capitalInvested;
    }
    if (firstLineAt !== null) {
      cumSinceLine += op;
      if (paybackMonths === null && firstLineCapital !== null && cumSinceLine >= firstLineCapital)
        paybackMonths = months - firstLineAt;
    }
    if (
      firstProfitMonth === null &&
      state.trains.length > 0 &&
      monthly.length >= 3 &&
      monthly.slice(-3).reduce((a, b) => a + b, 0) > 0
    )
      firstProfitMonth = months;
    if (months > 24) {
      idleBase++;
      if (state.cash > 0.2 * netWorth(state)) idle++;
    }
    if (months % 12 === 0) profit.push(ledgerOperatingProfit(state.finance.lastYear));
    if (state.finance.bankrupt) {
      bankruptYear = bot.year();
      break;
    }
  }
  const tiles = bot.lines
    .slice(0, 3)
    .map((l) => l.path.length)
    .sort((a, b) => a - b);
  const panics = panicSchedule(state)
    .filter((p) => p.startMonth <= months + 12)
    .map((p) => ({ name: p.name, atYear: p.startMonth / 12, depth: p.depth }));
  const run: Run = {
    variant,
    seed: o.seed,
    startCash,
    startCredit,
    bankruptYear,
    profit,
    netWorth: netWorth(state),
    minCash,
    firstProfitMonth,
    firstLineCapital,
    paybackYears: paybackMonths === null ? null : paybackMonths / 12,
    idleShare: idleBase ? idle / idleBase : 0,
    medianLineTiles: tiles.length ? tiles[Math.floor(tiles.length / 2)]! : null,
    panics,
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  if (def && state.scenario) {
    const sc = state.scenario;
    const deadline = (def.goal.type === "survive" ? def.goal.untilYear : def.goal.byYear) + 1;
    const left = ((deadline - startYear) * 12 * 720 - state.ticks) / 720;
    const last = ledgerOperatingProfit(state.finance.lastYear);
    run.scenario = {
      status: sc.status,
      stars: sc.stars,
      monthsEarly: sc.status === "won" && def.goal.type !== "survive" ? Math.round(left) : null,
      profitOverBar: last / Math.max(1, def.stars[1]),
    };
  }
  return run;
}

/** Candidate survey on a fresh game (a throwaway bot): how many projects pay back inside the bot's limit, and how long the
 * best passenger pairs are. Feeds the "few good town pairs" and "long distances" reasons. */
export interface Survey {
  good: number;
  bestPayback: number | null;
  medianPaybackTop5: number | null;
  medianPairTiles: number | null;
}
export function surveyMap(spec: Spec, seed: number): Survey {
  const state = createGameState(newGameOptionsFor(spec, seed));
  const bot = createStrongBot(state);
  const labels = bot.candidateLabels();
  const pb = labels
    .map((l) => /pb (-?[\d.]+)/.exec(l))
    .map((m) => (m ? Number(m[1]) : NaN))
    .filter((x) => Number.isFinite(x));
  const dists: number[] = [];
  for (const l of labels.slice(0, 8)) {
    const m = /^pax (.+)-(.+?) pb/.exec(l);
    if (!m) continue;
    const a = state.cities.find((c) => c.name === m[1]);
    const b = state.cities.find((c) => c.name === m[2]);
    if (a && b) dists.push(Math.hypot(a.anchorX - b.anchorX, a.anchorY - b.anchorY));
  }
  dists.sort((x, y) => x - y);
  const top5 = pb.slice(0, 5).sort((x, y) => x - y);
  return {
    good: pb.filter((x) => x <= 9).length,
    bestPayback: pb.length ? Math.min(...pb) : null,
    medianPaybackTop5: top5.length ? top5[Math.floor(top5.length / 2)]! : null,
    medianPairTiles: dists.length ? dists[Math.floor(dists.length / 2)]! : null,
  };
}
