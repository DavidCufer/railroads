/** Phase 26A: repair crews — repair time depends on the nearest Engine Shed. */
import { describe, expect, it } from "vitest";
import { buildRoute } from "../balanceRoutes";
import { monthlyBreakdownStep } from "../../../src/sim/trains/breakdown";
import {
  crewTotalTicks,
  planRepairCrew,
  repairCrewPosition,
  repairPhase,
} from "../../../src/sim/trains/repairCrew";

function scene(km: number) {
  const { state } = buildRoute({
    cargo: "coal",
    km,
    loco: "american-4-4-0",
    year: 1860,
    producer: "coalMine",
    acceptor: "steelMill",
  });
  const [a, b] = state.stations as [
    (typeof state.stations)[number],
    (typeof state.stations)[number],
  ];
  const train = state.trains[0]!;
  // Park the train at station B's node.
  train.route = [b.tile];
  train.routeIndex = 0;
  return { state, a, b, train };
}

describe("repair crews", () => {
  it("crew time depends on the distance to the nearest Engine Shed", () => {
    const { state, a, b, train } = scene(100);
    a.hasEngineShed = true;
    b.hasEngineShed = false;
    const far = planRepairCrew(state, train, 3)!;
    expect(far.fromStationId).toBe(a.id);
    expect(far.far).toBe(false);
    b.hasEngineShed = true; // an Engine Shed right at the broken train
    const near = planRepairCrew(state, train, 3)!;
    expect(near.fromStationId).toBe(b.id);
    expect(crewTotalTicks(near)).toBeLessThan(crewTotalTicks(far) / 3);
  });

  it("with no Engine Shed anywhere the crew is much slower", () => {
    const { state, a, b, train } = scene(100);
    a.hasEngineShed = true;
    b.hasEngineShed = false;
    const withShed = planRepairCrew(state, train, 3)!;
    a.hasEngineShed = false;
    const none = planRepairCrew(state, train, 3)!;
    expect(none.far).toBe(true);
    expect(crewTotalTicks(none)).toBeGreaterThan(crewTotalTicks(withShed) * 1.8);
  });

  it("a breakdown holds the train for dispatch + travel + fix and reports the phase", () => {
    const { state, a, b, train } = scene(100);
    a.hasEngineShed = true;
    b.hasEngineShed = false;
    // Force the breakdown roll to hit.
    train.purchaseTick = state.ticks - 20 * 8640;
    for (let i = 0; i < 2000 && train.breakdownTicksLeft === 0; i++) {
      state.rng = { ...state.rng };
      monthlyBreakdownStep(state);
    }
    expect(train.breakdownTicksLeft).toBeGreaterThan(0);
    expect(train.repairCrew?.fromStationId).toBe(a.id);
    expect(train.breakdownTicksLeft).toBe(crewTotalTicks(train.repairCrew!));
    const phase = repairPhase(state, train);
    expect(phase?.phase).toBe("arriving");
  });

  it("the crew drives from the base to the train along its path", () => {
    const { state, a, b, train } = scene(100);
    a.hasEngineShed = true;
    b.hasEngineShed = false;
    const crew = planRepairCrew(state, train, 3)!;
    const w = state.map.width;
    const start = repairCrewPosition(w, crew, crew.startTick)!;
    expect(start.x).toBeCloseTo((a.tile % w) + 0.5);
    const mid = repairCrewPosition(
      w,
      crew,
      crew.startTick + crew.dispatchTicks + crew.travelTicks / 2,
    )!;
    expect(mid.arrived).toBe(false);
    expect(mid.x).toBeGreaterThan(start.x);
    const end = repairCrewPosition(
      w,
      crew,
      crew.startTick + crew.dispatchTicks + crew.travelTicks,
    )!;
    expect(end.arrived).toBe(true);
    expect(end.x).toBeCloseTo((b.tile % w) + 0.5);
  });
});
