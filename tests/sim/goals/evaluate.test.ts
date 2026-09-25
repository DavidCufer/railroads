/** PLAN Phase 10: goal evaluators (SPEC §11) — one test per goal type, plus the overdue flag. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, electrifyTrack } from "../../../src/sim/commands";
import { evaluateGoal } from "../../../src/sim/goals/evaluate";
import type { Goal } from "../../../src/sim/goals/types";
import { emptyLedgerPeriod } from "../../../src/data/finance";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "../../../src/sim/time";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { City } from "../../../src/sim/economy/types";
import type { GameState } from "../../../src/sim/state";

/** A flat 20x1-ish map with two cities 10 tiles apart, each with a station-ready dead-end tile
 * right next to its single footprint tile — enough for `buildTrack`/`buildStation` to connect them
 * with a real, valid track+station setup rather than hand-poking the graph. */
function stateWithTwoCities(overrides: Partial<GameState> = {}): {
  state: GameState;
  cityA: City;
  cityB: City;
} {
  const map = makeTestMap(Array.from({ length: 4 }, () => "p".repeat(20)));
  const cityA: City = {
    id: 0,
    name: "Alpha",
    tier: "town",
    population: 5000,
    anchorX: 0,
    anchorY: 0,
    tiles: [tileAt(map, 0, 0)],
    coastal: false,
  };
  const cityB: City = {
    id: 1,
    name: "Beta",
    tier: "village",
    population: 1000,
    anchorX: 10,
    anchorY: 0,
    tiles: [tileAt(map, 10, 0)],
    coastal: false,
  };
  const state = makeTestState(map, { cities: [cityA, cityB], ...overrides });
  return { state, cityA, cityB };
}

function connectCities(state: GameState, ax: number, bx: number): void {
  const path = Array.from({ length: bx - ax + 1 }, (_, i) => tileAt(state.map, ax + i, 0));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, tileAt(state.map, ax, 0), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(state.map, bx, 0), "depot").ok).toBe(true);
}

describe("evaluateGoal", () => {
  it("connect: incomplete with no track, complete once both cities have a connected station", () => {
    const { state } = stateWithTwoCities();
    const goal: Goal = {
      id: "g",
      tier: "bronze",
      def: { type: "connect", cityIds: [0, 1], byYear: 1900 },
    };
    expect(evaluateGoal(state, goal).complete).toBe(false);

    connectCities(state, 1, 9);
    expect(evaluateGoal(state, goal).complete).toBe(true);
    expect(evaluateGoal(state, goal).progress).toBe(1);
  });

  it("connect: two separate track segments (not mutually reachable) don't count", () => {
    const { state } = stateWithTwoCities();
    // A short stub near each city, but never joined to each other.
    expect(buildTrack(state, [tileAt(state.map, 1, 0), tileAt(state.map, 2, 0)]).ok).toBe(true);
    expect(buildStation(state, tileAt(state.map, 1, 0), "depot").ok).toBe(true);
    expect(buildTrack(state, [tileAt(state.map, 8, 0), tileAt(state.map, 9, 0)]).ok).toBe(true);
    expect(buildStation(state, tileAt(state.map, 9, 0), "depot").ok).toBe(true);

    const goal: Goal = {
      id: "g",
      tier: "bronze",
      def: { type: "connect", cityIds: [0, 1], byYear: 1900 },
    };
    expect(evaluateGoal(state, goal).complete).toBe(false);
  });

  it("connect: a city with no foundingYear-applied tiles (empty tiles) can never complete", () => {
    const { state, cityB } = stateWithTwoCities();
    cityB.tiles = []; // not yet founded
    connectCities(state, 1, 9);
    const goal: Goal = {
      id: "g",
      tier: "bronze",
      def: { type: "connect", cityIds: [0, 1], byYear: 1900 },
    };
    expect(evaluateGoal(state, goal).complete).toBe(false);
  });

  it("annualRevenue: uses the larger of this-year and last-year revenue", () => {
    const { state } = stateWithTwoCities();
    const goal: Goal = {
      id: "g",
      tier: "silver",
      def: { type: "annualRevenue", amount: 1000, byYear: 1900 },
    };
    expect(evaluateGoal(state, goal).complete).toBe(false);

    state.finance.lastYear = { ...emptyLedgerPeriod(), passengers: 1200 };
    const status = evaluateGoal(state, goal);
    expect(status.complete).toBe(true);
    expect(status.current).toBe(1200);
  });

  it("netWorth: complete once cash (net worth) reaches the target", () => {
    const { state } = stateWithTwoCities();
    const goal: Goal = {
      id: "g",
      tier: "gold",
      def: { type: "netWorth", amount: 2_000_000, byYear: 1900 },
    };
    expect(evaluateGoal(state, goal).complete).toBe(false);
    state.cash = 5_000_000;
    expect(evaluateGoal(state, goal).complete).toBe(true);
  });

  it("cityTier: complete once the city's tier rank reaches the target rank", () => {
    const { state, cityA } = stateWithTwoCities();
    const goal: Goal = {
      id: "g",
      tier: "gold",
      def: { type: "cityTier", cityId: 0, tier: "metropolis", byYear: 1900 },
    };
    expect(evaluateGoal(state, goal).complete).toBe(false);
    cityA.tier = "metropolis";
    expect(evaluateGoal(state, goal).complete).toBe(true);
  });

  it("delivered: uses the larger of this-year running total and the best completed year", () => {
    const { state } = stateWithTwoCities();
    const goal: Goal = {
      id: "g",
      tier: "silver",
      def: { type: "delivered", cargo: "coal", amount: 1000, withinYear: 1900 },
    };
    expect(evaluateGoal(state, goal).complete).toBe(false);

    state.cargoDeliveredThisYear.coal = 600;
    expect(evaluateGoal(state, goal).progress).toBeCloseTo(0.6);
    expect(evaluateGoal(state, goal).complete).toBe(false);

    state.cargoDeliveredBestYear.coal = 1500;
    expect(evaluateGoal(state, goal).complete).toBe(true);
  });

  it("electrifiedTiles: counts distinct tiles touched by an electrified edge", () => {
    const { state } = stateWithTwoCities({ startYear: 1910 });
    connectCities(state, 1, 9);
    const goal: Goal = {
      id: "g",
      tier: "silver",
      def: { type: "electrifiedTiles", amount: 5, byYear: 1900 },
    };
    expect(evaluateGoal(state, goal).complete).toBe(false);

    const path = Array.from({ length: 9 }, (_, i) => tileAt(state.map, 1 + i, 0));
    expect(electrifyTrack(state, path).ok).toBe(true);
    const status = evaluateGoal(state, goal);
    expect(status.current).toBe(9);
    expect(status.complete).toBe(true);
  });

  it("overdue: true once the target year has passed without completing, false once complete", () => {
    const { state } = stateWithTwoCities();
    const goal: Goal = {
      id: "g",
      tier: "bronze",
      def: { type: "netWorth", amount: 999_999_999, byYear: 1831 },
    };
    state.ticks = HOURS_PER_DAY * DAYS_PER_YEAR * 5; // well past 1831
    const status = evaluateGoal(state, goal);
    expect(status.complete).toBe(false);
    expect(status.overdue).toBe(true);
  });
});
