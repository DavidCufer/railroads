/**
 * PLAN Phase 9 acceptance tests: industry dynamics bounds (SPEC §8.2: growthMult clamped to
 * 0.5x-3x) for served vs. unserved raw producers, and the occasional new-industry spawn.
 */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, refreshStationEconomy } from "../../../src/sim/commands";
import {
  growthRatePerYear,
  monthlyIndustryDynamicsStep,
} from "../../../src/sim/economy/industryDynamics";
import { INDUSTRY_GROWTH_MULT_MAX, INDUSTRY_GROWTH_MULT_MIN } from "../../../src/data/industries";
import { createRng } from "../../../src/sim/rng";
import { emptyStationFlow, recordSent } from "../../../src/sim/stations/flow";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";
import type { Industry } from "../../../src/sim/economy/types";

function stateWithMine(): { state: GameState; industry: Industry } {
  const map = makeTestMap(Array.from({ length: 6 }, () => "pppppp"));
  const state = makeTestState(map);
  state.startYear = 1830;
  const industry: Industry = { id: 0, type: "coalMine", x: 0, y: 0 };
  map.industryId[tileAt(map, 0, 0)] = 0;
  state.industries.push(industry);
  state.industryEconomy.set(0, { inputStock: {}, monthlyOutput: { coal: 60 } });
  return { state, industry };
}

describe("industry dynamics (SPEC §8.2)", () => {
  it("growthMult never exceeds [0.5, 3] regardless of how many favorable/unfavorable months pass", () => {
    const { state, industry } = stateWithMine();
    // No covering station at all -> always "unserved" -> should shrink toward the floor, not below.
    for (let i = 0; i < 500; i++) monthlyIndustryDynamicsStep(state);
    const econ = state.industryEconomy.get(industry.id)!;
    expect(econ.growthMult ?? 1).toBeGreaterThanOrEqual(INDUSTRY_GROWTH_MULT_MIN);
    expect(econ.growthMult ?? 1).toBeLessThanOrEqual(INDUSTRY_GROWTH_MULT_MAX);
    expect(econ.growthMult).toBeCloseTo(INDUSTRY_GROWTH_MULT_MIN, 6);
  });

  /** Runs `months` dynamics steps with trains carrying `share` of the mine's output every month. */
  function runCarrying(share: number, months: number, seed = 1): number {
    const { state, industry } = stateWithMine();
    state.rng = createRng(seed);
    expect(buildTrack(state, [tileAt(state.map, 0, 0), tileAt(state.map, 1, 0)]).ok).toBe(true);
    expect(buildStation(state, tileAt(state.map, 0, 0), "depot").ok).toBe(true);
    refreshStationEconomy(state);
    const station = state.stations[0]!;
    const econ = state.industryEconomy.get(industry.id)!;
    for (let i = 0; i < months; i++) {
      const output = 60 * (econ.growthMult ?? 1);
      econ.monthlyOutput = { coal: output };
      state.stationEconomy.get(station.id)!.supply.coal = output;
      state.stationFlow.set(station.id, { ...emptyStationFlow() });
      recordSent(state, station.id, "coal", output * share);
      monthlyIndustryDynamicsStep(state);
    }
    return econ.growthMult ?? 1;
  }

  it("a well-served producer roughly doubles in ten years", () => {
    const mult = runCarrying(1, 120);
    expect(mult).toBeGreaterThan(1.9);
    expect(mult).toBeLessThan(2.3);
  });

  it("growth never passes the 3x ceiling", () => {
    expect(runCarrying(1, 600)).toBeCloseTo(INDUSTRY_GROWTH_MULT_MAX, 6);
  });

  it("a poorly-served producer declines, a half-served one holds, and the floor stays", () => {
    expect(runCarrying(0.1, 60)).toBeLessThan(1);
    expect(runCarrying(0.4, 60)).toBeCloseTo(1, 2);
    expect(runCarrying(0, 2000)).toBeCloseTo(INDUSTRY_GROWTH_MULT_MIN, 6);
  });

  it("growth is deterministic: the seed does not matter", () => {
    expect(runCarrying(0.9, 36, 1)).toBe(runCarrying(0.9, 36, 99));
  });

  it("growth rate is piecewise linear in the share carried", () => {
    expect(growthRatePerYear(0)).toBeCloseTo(-0.04, 6);
    expect(growthRatePerYear(0.2)).toBeCloseTo(-0.02, 6);
    expect(growthRatePerYear(0.4)).toBeCloseTo(0, 6);
    expect(growthRatePerYear(0.8)).toBeCloseTo(0.08, 6);
    expect(growthRatePerYear(1)).toBeCloseTo(0.08, 6);
  });

  it("can spawn a new raw-producer industry over enough months", () => {
    const map = makeTestMap(Array.from({ length: 30 }, () => "p".repeat(30)));
    const state = makeTestState(map);
    state.startYear = 1830;
    const before = state.industries.length;
    for (let i = 0; i < 400 && state.industries.length === before; i++) {
      monthlyIndustryDynamicsStep(state);
    }
    expect(state.industries.length).toBeGreaterThan(before);
    const spawned = state.industries[state.industries.length - 1]!;
    expect(map.industryId[spawned.y * map.width + spawned.x]).toBe(spawned.id);
    expect(state.industryEconomy.has(spawned.id)).toBe(true);
  });
});
