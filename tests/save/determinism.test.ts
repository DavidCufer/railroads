/**
 * PLAN Phase 11's headline test: "continuing the simulation afterwards gives identical results to
 * never having saved". Builds a real (small, synthetic-map) scenario — freight route, passenger
 * route, a loan — runs it forward, and compares two trajectories from the same starting point:
 * plain continuous ticking vs. ticking partway, round-tripping through save/load, then continuing.
 * Reuses tests/sim/longRun.test.ts's proven scenario-building pattern.
 */
import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../../src/data/industries";
import { buildStation, buildTrack, buyTrain, setOrders, takeLoan } from "../../src/sim/commands";
import type { GameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import type { Industry } from "../../src/sim/economy/types";
import { serializeGameState, deserializeGameState } from "../../src/save/serialize";
import { makeTestMap, makeTestState, tileAt } from "../sim/track/helpers";

function buildScenario(): GameState {
  const width = 16;
  const row = Array.from({ length: width }, () => "p").join("");
  const map = makeTestMap([row, row, row]);
  const state = makeTestState(map, { startYear: 1830 });

  const mineTile = tileAt(map, 0, 0);
  map.industryId[mineTile] = 0;
  const millTile = tileAt(map, width - 1, 0);
  map.industryId[millTile] = 1;
  const industries: Industry[] = [
    { id: 0, type: "coalMine", x: 0, y: 0 },
    { id: 1, type: "steelMill", x: width - 1, y: 0 },
  ];
  state.industries.push(...industries);
  state.industryEconomy.set(0, {
    inputStock: {},
    monthlyOutput: { ...INDUSTRIES.coalMine.produces },
  });
  state.industryEconomy.set(1, { inputStock: {}, monthlyOutput: {} });

  const path = Array.from({ length: width }, (_, x) => tileAt(map, x, 1));
  if (!buildTrack(state, path).ok) throw new Error("setup: buildTrack failed");
  if (!buildStation(state, tileAt(map, 0, 1), "depot").ok) throw new Error("setup: station A");
  if (!buildStation(state, tileAt(map, width - 1, 1), "depot").ok)
    throw new Error("setup: station B");
  const stationA = state.stations[0] as GameState["stations"][number];
  const stationB = state.stations[1] as GameState["stations"][number];

  const bought = buyTrain(state, stationA.id, "grasshopper-0-4-0", ["coal", "coal"]);
  if (!bought.ok) throw new Error("setup: buyTrain failed");
  const train = state.trains[state.trains.length - 1] as GameState["trains"][number];
  const ordersResult = setOrders(state, train.id, [
    { stationId: stationA.id, rule: "auto" },
    { stationId: stationB.id, rule: "auto" },
  ]);
  if (!ordersResult.ok) throw new Error("setup: setOrders failed");

  if (!takeLoan(state, 100_000).ok) throw new Error("setup: takeLoan failed");

  return state;
}

/** JSON round trip through the exact save format, same as what IndexedDB would store. */
function saveAndLoad(state: GameState): GameState {
  const serialized = serializeGameState(state);
  const roundTripped = JSON.parse(JSON.stringify(serialized));
  return deserializeGameState(roundTripped);
}

/** A snapshot of everything that should be identical across both trajectories — comparing the
 * full serialized form directly would also work, but this is easier to read on a failure. */
function snapshot(state: GameState) {
  return {
    ticks: state.ticks,
    cash: state.cash,
    trackVersion: state.trackVersion,
    finance: state.finance,
    trains: state.trains.map((t) => ({
      status: t.status,
      route: t.route,
      routeIndex: t.routeIndex,
      edgeProgress: t.edgeProgress,
      speed: t.speed,
      direction: t.direction,
      cars: t.cars,
      lifetimeRevenue: t.lifetimeRevenue,
      breakdownTicksLeft: t.breakdownTicksLeft,
    })),
    stationCargo: Array.from(state.stationCargo.entries()),
    industryEconomy: Array.from(state.industryEconomy.entries()),
    news: state.news,
  };
}

describe("save/load determinism", () => {
  it("continuing after a mid-run save/load matches never having saved", () => {
    // Long enough for the train to make a full round trip and actually earn revenue (§7.4's
    // speedKmh/30 tiles-per-day scale makes a 15-tile leg take a couple of weeks one way), short
    // enough to keep the test fast.
    const totalTicks = 24 * 200; // 200 in-game days
    const splitTicks = 24 * 70; // save/load partway through, with the train mid-route

    const neverSaved = buildScenario();
    for (let i = 0; i < totalTicks; i++) advanceOneHour(neverSaved);

    let savedThenContinued = buildScenario();
    for (let i = 0; i < splitTicks; i++) advanceOneHour(savedThenContinued);
    savedThenContinued = saveAndLoad(savedThenContinued);
    for (let i = splitTicks; i < totalTicks; i++) advanceOneHour(savedThenContinued);

    // Sanity check the scenario is actually exercising something, not just idling at zero.
    expect(neverSaved.trains[0]?.lifetimeRevenue).toBeGreaterThan(0);

    expect(snapshot(savedThenContinued)).toEqual(snapshot(neverSaved));
  });

  it("a save/load round trip with no further ticks leaves the state identical", () => {
    const state = buildScenario();
    for (let i = 0; i < 24 * 5; i++) advanceOneHour(state);
    const restored = saveAndLoad(state);
    expect(snapshot(restored)).toEqual(snapshot(state));
  });
});
