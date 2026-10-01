/** Phase 30A: locomotive ageing — running cost, breakdown chance, worn-out news, overhaul. */
import { describe, expect, it } from "vitest";
import { overhaulLocomotive, computeOverhaulCommandPlan } from "../../../src/sim/commands";
import { monthlyBreakdownChance } from "../../../src/sim/trains/breakdown";
import {
  ageBreakdownMult,
  ageRunningCostMult,
  locoLifeYears,
  mechanicalAgeYears,
  yearlyAgeingStep,
} from "../../../src/sim/trains/ageing";
import { locoRunningCostPerYear } from "../../../src/sim/finance/costs";
import { locomotiveById } from "../../../src/data/trains";
import {
  LOCO_BREAKDOWN_MULT_MAX,
  LOCO_END_OF_LIFE_BREAKDOWN_MULT,
  LOCO_OVERHAUL_DAYS,
  LOCO_PRIME_YEARS,
} from "../../../src/data/economy";
import { buildRoute, tickDays } from "../balanceRoutes";
import type { GameState } from "../../../src/sim/state";

const YEAR_TICKS = 360 * 24;

function oldTrain(ageYears: number, loco = "atlantic-4-4-2"): GameState {
  const { state } = buildRoute({ cargo: "passengers", km: 100, year: 1900, loco, cars: 4 });
  state.ticks = ageYears * YEAR_TICKS;
  state.trains[0]!.purchaseTick = 0;
  return state;
}

describe("locomotive ageing", () => {
  const atlantic = locomotiveById("atlantic-4-4-2")!;

  it("is healthy until prime, a worse risk by the end of its life, and very bad beyond it", () => {
    const life = locoLifeYears(atlantic);
    expect(ageBreakdownMult(LOCO_PRIME_YEARS, atlantic)).toBe(1);
    expect(ageBreakdownMult(life, atlantic)).toBeCloseTo(LOCO_END_OF_LIFE_BREAKDOWN_MULT, 9);
    expect(ageBreakdownMult(life + 5, atlantic)).toBeGreaterThan(LOCO_END_OF_LIFE_BREAKDOWN_MULT);
    expect(ageBreakdownMult(life + 100, atlantic)).toBe(LOCO_BREAKDOWN_MULT_MAX);
    // monotonic
    let prev = 0;
    for (let y = 0; y <= life + 10; y++) {
      const m = ageBreakdownMult(y, atlantic);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it("running cost rises 3 % a year past 15 years", () => {
    expect(ageRunningCostMult(10)).toBe(1);
    expect(ageRunningCostMult(25)).toBeCloseTo(1.3, 9);
    expect(locoRunningCostPerYear(atlantic, 30, 1930)).toBeGreaterThan(
      locoRunningCostPerYear(atlantic, 5, 1930) * 1.4,
    );
  });

  it("a 36-year-old steam engine breaks down far more often than a young one", () => {
    const young = oldTrain(3);
    const old = oldTrain(36);
    expect(monthlyBreakdownChance(old, old.trains[0]!)).toBeGreaterThan(
      monthlyBreakdownChance(young, young.trains[0]!) * 5,
    );
  });

  it("says once when a locomotive is worn out", () => {
    const s = oldTrain(20);
    yearlyAgeingStep(s);
    expect(s.news.some((n) => n.kind === "locoWornOut")).toBe(false);
    s.ticks = 36 * YEAR_TICKS;
    yearlyAgeingStep(s);
    yearlyAgeingStep(s);
    expect(s.news.filter((n) => n.kind === "locoWornOut")).toHaveLength(1);
  });
});

describe("overhaul", () => {
  function atShed(age: number): GameState {
    const s = oldTrain(age);
    s.cash = 1e9;
    const train = s.trains[0]!;
    // park it loading at the first station (which has the Engine Shed)
    train.status = "loading";
    train.route = [s.stations[0]!.tile];
    train.routeIndex = 0;
    return s;
  }

  it("is refused for a young engine, or away from an Engine Shed", () => {
    const young = atShed(4);
    expect(overhaulLocomotive(young, young.trains[0]!.id)).toMatchObject({ ok: false });
    const away = atShed(30);
    away.trains[0]!.route = [away.stations[1]!.tile];
    expect(computeOverhaulCommandPlan(away, away.trains[0]!.id).valid).toBe(false);
    expect(overhaulLocomotive(away, away.trains[0]!.id)).toMatchObject({
      ok: false,
      reason: "no-engine-shed",
    });
  });

  it("costs 30 % of the engine, takes 60 % off its age and holds it in the shed for 25 days", () => {
    const s = atShed(30);
    const train = s.trains[0]!;
    const cash = s.cash;
    const before = mechanicalAgeYears(s, train);
    const r = overhaulLocomotive(s, train.id);
    expect(r.ok).toBe(true);
    expect(cash - s.cash).toBeCloseTo(atlanticCost(s) * 0.3, 0);
    expect(mechanicalAgeYears(s, train)).toBeCloseTo(before * 0.4, 6);
    expect(train.breakdownTicksLeft).toBe(LOCO_OVERHAUL_DAYS * 24);
    expect(train.inOverhaul).toBe(true);
    tickDays(s, LOCO_OVERHAUL_DAYS + 1);
    expect(train.inOverhaul).toBeUndefined();
    expect(train.status).not.toBe("broken");
  });
});

function atlanticCost(s: GameState): number {
  const year = 1900 + Math.floor(s.ticks / YEAR_TICKS);
  const loco = locomotiveById("atlantic-4-4-2")!;
  // price level of the year the overhaul is bought in
  return loco.cost * (1 + (year - 1830) * 0.012);
}
