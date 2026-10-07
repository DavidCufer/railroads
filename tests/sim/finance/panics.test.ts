import { describe, expect, it } from "vitest";
import { makeTestMap, makeTestState } from "../track/helpers";
import {
  activePanic,
  panicCreditMult,
  panicDemandMult,
  fuelPriceMult,
  panicSchedule,
} from "../../../src/sim/finance/panics";
import { computeCreditLimit, monthlyFinanceStep } from "../../../src/sim/finance/ledger";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import { strings } from "../../../src/ui/strings";
import type { Difficulty } from "../../../src/data/finance";

const MONTH = 30 * 24;
const mk = (seed: number, difficulty: Difficulty = "normal", startYear = 1850) =>
  makeTestState(makeTestMap(["p"]), { seed, difficulty, startYear });

describe("financial panics (Phase 39)", () => {
  it("the same seed always has the same history; seeds differ", () => {
    expect(panicSchedule(mk(7))).toEqual(panicSchedule(mk(7)));
    const a = JSON.stringify(panicSchedule(mk(7)));
    const others = [1, 2, 3, 4, 5].map((s) => JSON.stringify(panicSchedule(mk(s))));
    expect(others.some((o) => o !== a)).toBe(true);
  });

  it("Hard panics are deeper and longer than Normal, Easy gentler", () => {
    const sum = (d: Difficulty) => {
      let depth = 0;
      let months = 0;
      for (let seed = 1; seed <= 30; seed++)
        for (const p of panicSchedule(mk(seed, d))) {
          depth += p.depth;
          months += p.months;
        }
      return { depth, months };
    };
    const easy = sum("easy");
    const normal = sum("normal");
    const hard = sum("hard");
    expect(hard.depth).toBeGreaterThan(normal.depth * 1.3);
    expect(hard.months).toBeGreaterThan(normal.months * 1.2);
    expect(easy.depth).toBeLessThan(normal.depth * 0.7);
  });

  it("falls 20-40 % on Normal, lasts 12-24 months, starts in its year", () => {
    for (let seed = 1; seed <= 20; seed++)
      for (const p of panicSchedule(mk(seed))) {
        expect(p.depth).toBeGreaterThanOrEqual(0.2);
        expect(p.depth).toBeLessThanOrEqual(0.4);
        expect(p.months).toBeGreaterThanOrEqual(12);
        expect(p.months).toBeLessThanOrEqual(24);
        expect(1850 + Math.floor(p.startMonth / 12)).toBe(p.year);
      }
  });

  it("cuts demand and the credit limit while it lasts, and posts news at the start", () => {
    const state = mk(3, "hard");
    const p = panicSchedule(state)[0]!;
    state.cash = 5_000_000;
    state.finance.capitalInvested = 40_000_000;
    state.finance.thisMonth.passengers = 5_000_000; // earnings, so the limit is not zero
    state.ticks = (p.startMonth - 1) * MONTH;
    expect(activePanic(state)).toBeUndefined();
    expect(panicDemandMult(state)).toBe(1);
    const before = computeCreditLimit(state);
    state.ticks = p.startMonth * MONTH;
    monthlyFinanceStep(state);
    expect(state.news.some((n) => n.kind === "panic" && n.name === p.name)).toBe(true);
    expect(panicDemandMult(state)).toBeCloseTo(1 - p.depth, 5);
    expect(panicCreditMult(state)).toBe(0.3);
    expect(computeCreditLimit(state)).toBeLessThan(before);
    state.ticks = (p.startMonth + p.months) * MONTH;
    expect(activePanic(state)).toBeUndefined();
  });

  it("scales what a station accrues", () => {
    const state = mk(3, "hard");
    const p = panicSchedule(state)[0]!;
    state.stations = [{ id: 1, type: "station", improvements: [] } as never];
    state.stationEconomy.set(1, { supply: { coal: 300 }, accepts: {} } as never);
    state.ticks = (p.startMonth - 1) * MONTH;
    accrueDailyCargo(state);
    const normal = state.stationCargo.get(1)!.coal!.amount;
    state.stationCargo.clear();
    state.ticks = p.startMonth * MONTH;
    accrueDailyCargo(state);
    expect(state.stationCargo.get(1)!.coal!.amount).toBeCloseTo(normal * (1 - p.depth), 5);
  });
});

describe("late crises and oil shocks (Phase 42)", () => {
  const years = (startYear: number, seed: number, difficulty: Difficulty = "hard") =>
    panicSchedule(mk(seed, difficulty, startYear)).map((p) => p.year);

  it("a 1930 start meets 1931 and 1937; a 1950 start meets the 1950s recessions", () => {
    const all = (startYear: number) =>
      new Set([1, 2, 3, 4, 5, 6, 7, 8].flatMap((s) => years(startYear, s)));
    expect(all(1930)).toContain(1931);
    expect(all(1930)).toContain(1937);
    for (const y of [1953, 1957, 1960]) expect(all(1950)).toContain(y);
    for (const y of [1973, 1979]) expect(all(1950)).toContain(y);
  });

  it("earlier panics are unchanged by the new ones (own rng per year)", () => {
    const a = panicSchedule(mk(5, "normal", 1850)).filter((p) => p.year < 1930);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((p) => p.fuelRise === 0)).toBe(true);
  });

  it("oil crises raise fuel for steam and diesel, never electric, and ease off at the end", () => {
    const state = mk(1, "hard", 1950);
    const oil = panicSchedule(state).find((p) => p.name === "Oil crisis");
    expect(oil?.fuelRise).toBe(0.6);
    state.ticks = (oil!.startMonth - 1) * MONTH;
    expect(fuelPriceMult(state, "diesel")).toBe(1);
    state.ticks = oil!.startMonth * MONTH;
    expect(fuelPriceMult(state, "diesel")).toBeCloseTo(1.6, 5);
    expect(fuelPriceMult(state, "steam")).toBeCloseTo(1.6, 5);
    expect(fuelPriceMult(state, "electric")).toBe(1);
    state.ticks = (oil!.startMonth + oil!.months - 1) * MONTH;
    expect(fuelPriceMult(state, "diesel")).toBeLessThan(1.2);
    state.ticks = (oil!.startMonth + oil!.months) * MONTH;
    expect(fuelPriceMult(state, "diesel")).toBe(1);
  });

  it("the oil crisis headline says what fuel does", () => {
    expect(strings.finance.panic("Oil crisis", 30, 18, 0.6)).toContain("fuel +60 %");
    expect(strings.news.kinds.panic("Oil crisis", 18, 0.6)).toContain("fuel +60 %");
    expect(strings.finance.panic("Crash", 30, 18)).not.toContain("fuel");
  });
});
