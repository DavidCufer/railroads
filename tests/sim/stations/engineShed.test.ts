/** PLAN Phase 28A (PLAYTEST-1 Bug 6): Engine Sheds can be built at any station. */
import { describe, expect, it } from "vitest";
import { ENGINE_SHED_COST } from "../../../src/data/stations";
import { eraInflation } from "../../../src/data/finance";
import {
  buildEngineShed,
  buildStation,
  buildTrack,
  buyTrain,
  computeEngineShedPlan,
} from "../../../src/sim/commands";
import { planRepairCrew, crewTotalTicks } from "../../../src/sim/trains/repairCrew";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

function twoStations() {
  const map = makeTestMap(Array.from({ length: 4 }, () => "p".repeat(62)));
  const state = makeTestState(map, { seed: 2, startYear: 1900, cash: 5_000_000 });
  const path = Array.from({ length: 60 }, (_, x) => tileAt(map, x + 1, 1));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, path[0] as number, "station").ok).toBe(true);
  expect(buildStation(state, path[59] as number, "station").ok).toBe(true);
  return { state, a: state.stations[0]!, b: state.stations[1]!, path };
}

describe("Engine Shed", () => {
  it("only the first station has one free; another costs $30k era-scaled and lets trains be bought there", () => {
    const { state, a, b } = twoStations();
    expect(a.hasEngineShed).toBe(true);
    expect(b.hasEngineShed).toBe(false);
    expect(buyTrain(state, b.id, "atlantic-4-4-2", ["passengers"])).toEqual({
      ok: false,
      reason: "no-engine-shed",
    });
    const plan = computeEngineShedPlan(state, b.id);
    expect(plan.valid).toBe(true);
    expect(plan.cost).toBeCloseTo(ENGINE_SHED_COST * eraInflation(1900), 0);
    const cash = state.cash;
    expect(buildEngineShed(state, b.id).ok).toBe(true);
    expect(state.cash).toBeCloseTo(cash - plan.cost, 0);
    expect(b.hasEngineShed).toBe(true);
    expect(buildEngineShed(state, b.id)).toEqual({ ok: false, reason: "already-improved" });
    expect(computeEngineShedPlan(state, b.id).valid).toBe(false);
    expect(buyTrain(state, b.id, "atlantic-4-4-2", ["passengers"]).ok).toBe(true);
  });

  it("refuses without cash", () => {
    const { state, b } = twoStations();
    state.cash = 100;
    expect(buildEngineShed(state, b.id)).toEqual({ ok: false, reason: "cant-afford" });
  });

  it("a shed at the far end sends the repair crew from there: a much shorter call-out", () => {
    const { state, a, b, path } = twoStations();
    buyTrain(state, a.id, "atlantic-4-4-2", ["passengers"]);
    const train = state.trains[0]!;
    train.route = [path[52] as number];
    train.routeIndex = 0;
    const far = planRepairCrew(state, train, 2)!;
    expect(far.fromStationId).toBe(a.id);
    buildEngineShed(state, b.id);
    const near = planRepairCrew(state, train, 2)!;
    expect(near.fromStationId).toBe(b.id);
    expect(crewTotalTicks(near)).toBeLessThan(crewTotalTicks(far));
  });
});
