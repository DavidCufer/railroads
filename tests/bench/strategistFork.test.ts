import { describe, expect, it } from "vitest";
import { createGameState } from "../../src/sim/state";
import { netWorth } from "../../src/sim/finance/ledger";
import { createStrongBot, type StrongBot } from "../../tools/bench/strongBot";
import { forkBot } from "../../tools/bench/strategist/fork";
import { attachStrategist } from "../../tools/bench/strategist/strategist";

const monthOf = (b: StrongBot): number => Math.floor(b.state.ticks / 720) % 12;
const play = (b: StrongBot, months: number): void => {
  for (let i = 0; i < months; i++) {
    b.monthA();
    b.monthB(monthOf(b));
  }
};
const sig = (b: StrongBot): string =>
  [
    b.state.ticks,
    Math.round(b.state.cash),
    Math.round(netWorth(b.state)),
    b.state.trains.length,
    b.state.stations.length,
    b.state.trackGraph.allEdges().length,
    b.lines.length,
  ].join("/");
const start = (region: "central-eu" | "gb" | "us-east", year: number): StrongBot =>
  createStrongBot(createGameState({ seed: 1, region, startYear: year, difficulty: "normal" }));

describe("Strategist engine (Phase 82)", () => {
  it("a forked game and bot play on exactly like the original", { timeout: 120_000 }, () => {
    const bot = start("central-eu", 1870);
    play(bot, 9);
    const fork = forkBot(bot);
    expect(sig(fork)).toBe(sig(bot));
    play(bot, 4);
    play(fork, 4);
    expect(sig(fork)).toBe(sig(bot));
  });

  it("a rollout is deterministic and leaves the original untouched", { timeout: 120_000 }, () => {
    const bot = start("central-eu", 1870);
    play(bot, 9);
    const before = sig(bot);
    const a = forkBot(bot);
    const b = forkBot(bot);
    a.setCandidateBudget(1);
    b.setCandidateBudget(1);
    play(a, 3);
    play(b, 3);
    expect(sig(a)).toBe(sig(b));
    expect(sig(bot)).toBe(before);
  });

  it("the lookahead picks valid moves on three regions and starts", { timeout: 240_000 }, () => {
    for (const [region, year] of [
      ["central-eu", 1900],
      ["gb", 1840],
      ["us-east", 1870],
    ] as const) {
      const bot = start(region, year);
      const stats = attachStrategist(bot, { horizonMonths: 8, maxMoves: 2 });
      play(bot, 6);
      expect(bot.state.finance.bankrupt, `${region} ${year}`).toBe(false);
      expect(stats.decisions, `${region} ${year}`).toBeGreaterThan(0);
      expect(bot.lines.length, `${region} ${year}`).toBeGreaterThan(0);
    }
  });
});
