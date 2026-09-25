/**
 * Save round-trip test (PLAN Phase 11: "a save -> load round-trip produces deep-equal state").
 * Builds a state that exercises every field kind the serializer has to handle specially — typed
 * arrays (the map), the TrackGraph class, every Map/Set field, and an optional field
 * (`regionId`) — plus content the PLAN brief calls out by name: a real-world region id, a train
 * mid-route, an outstanding loan, goals/goalsCompleted, and news.
 */
import { describe, expect, it } from "vitest";
import { serializeGameState, deserializeGameState } from "../../src/save/serialize";
import { computeStationEconomies } from "../../src/sim/stations/economy";
import type { GameState } from "../../src/sim/state";
import type { Train } from "../../src/sim/trains/types";
import type { Goal } from "../../src/sim/goals/types";
import type { NewsItem } from "../../src/sim/news";
import { makeTestMap, makeTestState, tileAt } from "../sim/track/helpers";

function richFixture(): GameState {
  const width = 6;
  const row = Array.from({ length: width }, () => "p").join("");
  const map = makeTestMap([row, row, row]);
  const state = makeTestState(map, {
    startYear: 1830,
    ticks: 4_320, // 180 days in
    cash: 842_500.5,
    regionId: "us-east",
    mapContentVersion: 3,
  });

  // Real track (exercises TrackGraph serialization, including a node's edge).
  const a = tileAt(map, 0, 1);
  const b = tileAt(map, 1, 1);
  const c = tileAt(map, 2, 1);
  state.trackGraph.addEdge({
    a,
    b,
    direction: 0,
    double: true,
    electrified: false,
    bridge: null,
    bridgeSpan: [],
    cost: 12_000,
  });
  state.trackGraph.addEdge({
    a: b,
    b: c,
    direction: 0,
    double: false,
    electrified: false,
    bridge: null,
    bridgeSpan: [],
    cost: 8_000,
  });
  state.trackVersion = 2;

  state.stations.push({
    id: 0,
    tile: a,
    type: "station",
    name: "Ashtown",
    hasEngineShed: true,
    hasWaterTower: true,
    improvements: ["postOffice", "warehouse"],
  });
  state.nextStationId = 1;

  // A train mid-route (non-empty blockPenalties Map, heldBlocks, in-progress edge).
  const midRouteTrain: Train = {
    id: 0,
    name: "Train 1",
    locoModelId: "grasshopper-0-4-0",
    cars: [
      { cargoType: "coal", loaded: true, loadedTile: a, loadedTick: 4_300 },
      { cargoType: "coal", loaded: false },
    ],
    orders: [
      { stationId: 0, rule: "auto" },
      { stationId: 1, rule: "fullLoad", maxWaitDays: 5 },
    ],
    currentOrderIndex: 1,
    status: "moving",
    route: [a, b, c],
    routeIndex: 1,
    edgeProgress: 0.42,
    speed: 18.5,
    direction: 0,
    waitTicks: 3,
    routeTrackVersion: 2,
    lastApproachNode: a,
    heldBlocks: [{ blockId: 0, direction: 0, distanceInto: 1 }],
    blockPenalties: new Map([
      [5, 1_200],
      [9, 400],
    ]),
    loadTicksLeft: -1,
    loadExtraWaitDays: 0,
    purchasePrice: 20_000,
    purchaseTick: 100,
    breakdownTicksLeft: 0,
    lastServicedTick: 50,
    tilesSinceWaterTower: 12,
    lifetimeRevenue: 15_430,
    renderFromX: b % width,
    renderFromY: Math.floor(b / width),
    renderToX: c % width,
    renderToY: Math.floor(c / width),
  };
  state.trains.push(midRouteTrain);
  state.nextTrainId = 1;

  // An outstanding loan (Phase 7 finance).
  state.finance.loans = 300_000;
  state.finance.capitalInvested = 20_000;
  state.finance.netWorthHistory.push({ tick: 1_000, cash: 900_000, netWorth: 1_200_000 });
  state.finance.negativeCashMonths = 1;

  // Non-empty per-station/per-industry Map fields.
  state.stationCargo.set(0, { coal: { amount: 12, waitingDays: 3 } });
  state.industryEconomy.set(0, { inputStock: { ironOre: 5 }, monthlyOutput: { coal: 60 } });
  state.cityGrowth.set(0, { points: 12.5, monthlyScore: 3, lastCivicInvestmentTick: 500 });

  // Goals + goalsCompleted (a Set).
  const goal: Goal = {
    id: "g1",
    tier: "bronze",
    def: { type: "netWorth", amount: 5_000_000, byYear: 1870 },
  };
  state.goals = [goal];
  state.goalsCompleted = new Set(["g1"]);
  state.pendingGoalCelebrations = [goal];
  state.cargoDeliveredThisYear = { coal: 40 };
  state.cargoDeliveredBestYear = { coal: 120 };

  // News + the pending queues.
  const newsItem: NewsItem = { id: 0, tick: 4_000, kind: "newLocomotive", locoId: "planet-2-2-0" };
  state.news = [newsItem];
  state.nextNewsId = 1;
  state.pendingNews = [newsItem];
  state.newsReadUpTo = -1;
  state.pendingDeliveries = [{ stationId: 0, cargoType: "coal", revenue: 240 }];

  // A real-world region's pending (not-yet-founded) city.
  state.pendingCityFoundings = [
    { cityId: 7, year: 1900, tiles: [tileAt(map, 3, 2)], population: 5_000, coastal: true },
  ];

  // stationEconomy is a pure recompute (see serialize.ts's doc comment) — fill it in the same way
  // deserializeGameState will, so the round trip is directly comparable.
  state.stationEconomy = computeStationEconomies(
    state.map,
    state.cities,
    state.industries,
    state.stations,
    1831,
    state.industryEconomy,
  );

  return state;
}

describe("save round trip", () => {
  it("produces deep-equal state after a JSON round trip (save -> load)", () => {
    const original = richFixture();
    const serialized = serializeGameState(original);
    // Simulate actually going through JSON + IndexedDB storage, not just calling the two
    // functions back to back in memory.
    const roundTripped = JSON.parse(JSON.stringify(serialized));
    const restored = deserializeGameState(roundTripped);

    expect(restored).toEqual(original);
  });

  it("base64-packs the map's typed arrays losslessly, including negative Int16/Int32 values", () => {
    const original = richFixture();
    // industryId/riverNext use -1 as "none" — make sure the encode/decode round trip preserves
    // negative values exactly, not just the 0..255 range a naive byte-only view might imply.
    original.map.industryId[0] = -1;
    original.map.riverNext[1] = -1;
    original.map.elevationRaw[2] = -0.87531;

    const serialized = serializeGameState(original);
    const restored = deserializeGameState(JSON.parse(JSON.stringify(serialized)));

    expect(Array.from(restored.map.industryId)).toEqual(Array.from(original.map.industryId));
    expect(Array.from(restored.map.riverNext)).toEqual(Array.from(original.map.riverNext));
    expect(restored.map.elevationRaw[2]).toBeCloseTo(original.map.elevationRaw[2] as number, 6);
  });
});
