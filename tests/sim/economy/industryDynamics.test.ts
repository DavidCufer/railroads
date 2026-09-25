/**
 * PLAN Phase 9 acceptance tests: industry dynamics bounds (SPEC §8.2: growthMult clamped to
 * 0.5x-3x) for served vs. unserved raw producers, and the occasional new-industry spawn.
 */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, refreshStationEconomy } from "../../../src/sim/commands";
import { monthlyIndustryDynamicsStep } from "../../../src/sim/economy/industryDynamics";
import { INDUSTRY_GROWTH_MULT_MAX, INDUSTRY_GROWTH_MULT_MIN } from "../../../src/data/industries";
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

  it("a consistently-served producer grows toward (but never past) the 3x ceiling", () => {
    const { state, industry } = stateWithMine();
    expect(buildTrack(state, [tileAt(state.map, 0, 0), tileAt(state.map, 1, 0)]).ok).toBe(true);
    expect(buildStation(state, tileAt(state.map, 0, 0), "depot").ok).toBe(true);
    refreshStationEconomy(state);
    const station = state.stations[0]!;
    // "Served" per this module's waitingDays proxy: keep it low every month (as if a train keeps
    // picking the pile up).
    state.stationCargo.set(station.id, { coal: { amount: 10, waitingDays: 0 } });

    for (let i = 0; i < 2000; i++) {
      monthlyIndustryDynamicsStep(state);
      // Re-pin waitingDays low each "month" (accrueDailyCargo isn't run here, so nothing else
      // touches it) to simulate an actively-served pile across the whole run.
      const pile = state.stationCargo.get(station.id)!;
      pile.coal!.waitingDays = 0;
    }
    const econ = state.industryEconomy.get(industry.id)!;
    expect(econ.growthMult ?? 1).toBeCloseTo(INDUSTRY_GROWTH_MULT_MAX, 6);
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
