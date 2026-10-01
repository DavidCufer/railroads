/** Phase 30A: track condition — wear from use, slow orders, relaying. */
import { describe, expect, it } from "vitest";
import { buyTrain, relayTrack, computeRelayPlan, setOrders } from "../../../src/sim/commands";
import { computeTargetSpeed } from "../../../src/sim/trains/movement";
import { locomotiveById } from "../../../src/data/trains";
import {
  SLOW_ORDER_MIN_SPEED_MULT,
  SLOW_ORDER_START_RATIO,
  WEAR_ROUTINE_SHARE,
} from "../../../src/data/economy";
import { edgeWearRatio, railLifeUnits, slowOrderMult } from "../../../src/sim/track/condition";
import { buildRoute, tickDays } from "../balanceRoutes";
import type { GameState } from "../../../src/sim/state";

function line(year: number, loco: string, trains: number, cars = 6): GameState {
  const { state } = buildRoute({
    cargo: "passengers",
    km: 100,
    year,
    loco,
    population: 400_000,
    tier: "metropolis",
    cars,
    stationType: "station",
  });
  const [a, b] = [state.stations[0]!, state.stations[1]!];
  for (let i = 1; i < trains; i++) {
    state.cash = 1e12;
    expect(buyTrain(state, a.id, loco, Array(cars).fill("passengers") as never).ok).toBe(true);
    const t = state.trains[state.trains.length - 1]!;
    setOrders(
      state,
      t.id,
      (i % 2 ? [b, a] : [a, b]).map((s) => ({ stationId: s.id, rule: "auto" as const })),
    );
  }
  return state;
}

const meanRatio = (s: GameState): number => {
  const edges = s.trackGraph.allEdges();
  return edges.reduce((n, e) => n + edgeWearRatio(s, e), 0) / edges.length;
};

describe("track condition", () => {
  it("rail laid later lasts longer (iron → steel → heavy section)", () => {
    expect(railLifeUnits(1840)).toBeLessThan(railLifeUnits(1870));
    expect(railLifeUnits(1870)).toBeLessThan(railLifeUnits(1900));
    expect(railLifeUnits(1900)).toBeLessThan(railLifeUnits(1930));
  });

  it("light early traffic barely wears the rail; heavy fast late traffic wears it out in about two decades", () => {
    const early = line(1840, "norris-4-2-0", 2, 3);
    for (let y = 0; y < 3; y++) tickDays(early, 360);
    expect(meanRatio(early) / 3).toBeLessThan(0.03); // > 30 years of life per ratio point

    const late = line(1920, "pacific-4-6-2", 8);
    for (let y = 0; y < 3; y++) tickDays(late, 360);
    const perYear = meanRatio(late) / 3;
    expect(perYear).toBeGreaterThan(0.04); // reaches a slow order within ~15 years
    expect(perYear).toBeLessThan(0.12);
  });

  it("double track shares the traffic between two tracks", () => {
    const s = line(1900, "atlantic-4-4-2", 1);
    const edge = s.trackGraph.allEdges()[0]!;
    edge.wear = 1000;
    const single = edgeWearRatio(s, edge);
    edge.double = true;
    expect(edgeWearRatio(s, edge)).toBeCloseTo(single / 2, 9);
  });

  it("slow orders start at the threshold and bottom out", () => {
    expect(slowOrderMult(SLOW_ORDER_START_RATIO)).toBe(1);
    expect(slowOrderMult(0.9)).toBeLessThan(1);
    expect(slowOrderMult(5)).toBe(SLOW_ORDER_MIN_SPEED_MULT);
  });

  it("a worn edge restricts a train's speed", () => {
    const s = line(1900, "atlantic-4-4-2", 1);
    const train = s.trains[0]!;
    const loco = locomotiveById(train.locoModelId)!;
    const edge = s.trackGraph.allEdges()[3]!;
    const fast = computeTargetSpeed(s, loco, train, edge.a, edge.b);
    edge.wear = 2 * railLifeUnits(1900) * 1.43; // ratio well past the floor
    const slow = computeTargetSpeed(s, loco, train, edge.a, edge.b);
    expect(slow).toBeCloseTo(fast * SLOW_ORDER_MIN_SPEED_MULT, 6);
  });

  it("relaying resets the wear and charges the renewal share of it; unworn track is refused", () => {
    const s = line(1900, "atlantic-4-4-2", 1);
    expect(relayTrack(s).ok).toBe(false);
    for (const e of s.trackGraph.allEdges())
      e.wear = 0.8 * railLifeUnits(1900) * 1.0 * (e.double ? 2 : 1);
    const plan = computeRelayPlan(s);
    expect(plan.valid).toBe(true);
    expect(plan.edges.length).toBe(s.trackGraph.edgeCount);
    // renewal share of the monthly-charged wear bill
    const units = plan.edges.reduce((n, e) => n + (e.wear ?? 0), 0);
    expect(plan.cost).toBeGreaterThan(units * (1 - WEAR_ROUTINE_SHARE) * 0.9);
    s.cash = plan.cost - 1;
    expect(relayTrack(s).ok).toBe(false);
    s.cash = plan.cost + 1;
    const before = s.finance.thisYear.trackWear;
    const r = relayTrack(s);
    expect(r.ok).toBe(true);
    expect(s.finance.thisYear.trackWear - before).toBeCloseTo(plan.cost, 3);
    for (const e of s.trackGraph.allEdges()) {
      expect(e.wear).toBe(0);
      expect(edgeWearRatio(s, e)).toBe(0);
    }
  });

  it("neglected track costs fares: a line under 40 % slow orders earns much less, and relaying brings it back", () => {
    const revenue = (prep?: (s: GameState) => void): number => {
      const s = line(1900, "atlantic-4-4-2", 2);
      prep?.(s);
      tickDays(s, 360);
      return s.finance.lastYear.passengers + s.finance.lastYear.mail;
    };
    const worn = (s: GameState): void => {
      for (const e of s.trackGraph.allEdges())
        e.wear = 2 * railLifeUnits(1900) * (e.double ? 2 : 1) * 1.5;
    };
    const fresh = revenue();
    const neglected = revenue(worn);
    const relaid = revenue((s) => {
      worn(s);
      s.cash = 1e12;
      expect(relayTrack(s).ok).toBe(true);
    });
    expect(neglected).toBeLessThan(fresh * 0.75);
    expect(relaid).toBeGreaterThan(fresh * 0.95);
  });
});
