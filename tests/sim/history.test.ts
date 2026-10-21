import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_IDS } from "../../src/data/achievements";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../src/sim/commands";
import { activePanic } from "../../src/sim/finance/panics";
import {
  monthlyHistoryStep,
  recordHistoryDelivery,
  startHistory,
  TRACK_MILESTONES_KM,
} from "../../src/sim/history";
import { buyableLocomotivesIn } from "../../src/data/trains";
import { createGameState, type GameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { deserializeGameState, serializeGameState } from "../../src/save/serialize";
import { strings } from "../../src/ui/strings";
import { makeTestMap, makeTestState, tileAt } from "./track/helpers";

const YEAR = 360 * 24;

/** A 40-tile straight line with a station at each end and one train on it (150+ km, so a track milestone too). */
function lineState(overrides: Partial<GameState> = {}): GameState {
  const row = "p".repeat(40);
  const map = makeTestMap([row, row, row]);
  const state = makeTestState(map, { startYear: 1900, cash: 5_000_000, ...overrides });
  const path = Array.from({ length: 40 }, (_, x) => tileAt(map, x, 1));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, path[0] as number, "station").ok).toBe(true);
  expect(buildStation(state, path[39] as number, "station").ok).toBe(true);
  return state;
}

function addTrain(state: GameState): void {
  const [a, b] = state.stations as unknown as [{ id: number }, { id: number }];
  expect(buyTrain(state, a.id, buyableLocomotivesIn(1900)[0]!.id, ["passengers"]).ok).toBe(true);
  const train = state.trains[state.trains.length - 1];
  if (train)
    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
}

const kinds = (s: GameState): string[] => s.history.events.map((e) => e.kind);

describe("history snapshots", () => {
  it("a new game starts with one point and nothing else", () => {
    const state = createGameState({ seed: 3, region: "central-eu", startYear: 1860 });
    expect(state.history.snapshots).toHaveLength(1);
    expect(state.history.snapshots[0]).toMatchObject({ year: 1860, revenue: 0, loans: 0 });
    expect(state.history.events).toEqual([]);
    expect(state.history.achievements).toEqual({});
  });

  it("adds a point on 1 January with the year's revenue", () => {
    const state = createGameState({ seed: 3, region: "central-eu", startYear: 1860 });
    for (let h = 0; h < YEAR; h++) advanceOneHour(state);
    expect(state.history.snapshots.map((s) => s.year)).toEqual([1860, 1861]);
    const second = state.history.snapshots[1]!;
    expect(second.cash).toBe(state.cash);
    expect(second.revenue).toBe(0);
  });
});

describe("history events", () => {
  it("notes the first train, the first line and track milestones, once", () => {
    const state = lineState();
    startHistory(state);
    addTrain(state);
    monthlyHistoryStep(state);
    monthlyHistoryStep(state);
    expect(kinds(state)).toContain("firstTrain");
    expect(kinds(state).filter((k) => k === "firstLine")).toHaveLength(1);
    const track = state.history.events.find((e) => e.kind === "track");
    expect(track?.value).toBe(TRACK_MILESTONES_KM.filter((m) => m <= 200).pop());
  });

  it("notes a panic survived, and counts it", () => {
    const state = lineState({ ticks: 40 * YEAR });
    addTrain(state);
    expect(activePanic(state)).toBeUndefined();
    startHistory(state);
    state.history.memory.panic = "Panic of 1873";
    monthlyHistoryStep(state);
    expect(state.history.events.find((e) => e.kind === "panic")?.text).toBe("Panic of 1873");
    expect(state.history.memory.panicsSurvived).toBe(1);
    expect(state.history.achievements["panicSurvived"]).toBeDefined();
  });

  it("notes avoiding bankruptcy and bankruptcy", () => {
    const state = lineState();
    startHistory(state);
    state.finance.negativeCashMonths = 2;
    monthlyHistoryStep(state);
    state.finance.negativeCashMonths = 0;
    monthlyHistoryStep(state);
    expect(kinds(state)).toContain("avoidedBankruptcy");
    state.finance.bankrupt = true;
    monthlyHistoryStep(state);
    expect(kinds(state)).toContain("bankrupt");
  });

  it("notes contracts finished", () => {
    const state = lineState();
    startHistory(state);
    monthlyHistoryStep(state);
    state.contracts.stats.completed = 2;
    state.contracts.stats.failed = 1;
    monthlyHistoryStep(state);
    expect(kinds(state).filter((k) => k === "contract")).toHaveLength(2);
    expect(kinds(state).filter((k) => k === "contractFailed")).toHaveLength(1);
    expect(state.history.achievements["firstContract"]).toBeDefined();
    expect(state.history.achievements["contracts5"]).toBeUndefined();
  });
});

describe("achievements", () => {
  it("every one has words", () => {
    for (const id of ACHIEVEMENT_IDS) {
      expect(strings.achievements.items[id]?.name, id).toBeTruthy();
      expect(strings.achievements.items[id]?.desc, id).toBeTruthy();
    }
    expect(ACHIEVEMENT_IDS.length).toBeGreaterThanOrEqual(20);
  });

  it("yearly profit milestones unlock once, with an event; cash and net worth do not count (Phase 67)", () => {
    const state = lineState({ cash: 3_000_000 });
    startHistory(state);
    state.cash = 120_000_000;
    monthlyHistoryStep(state);
    expect(state.history.achievements["profit500k"]).toBeUndefined();
    state.finance.lastYear.passengers = 6_000_000;
    monthlyHistoryStep(state);
    expect(state.history.achievements["profit500k"]).toBeDefined();
    expect(state.history.achievements["profit5M"]).toBeDefined();
    expect(state.history.achievements["profit10M"]).toBeUndefined();
    const count = kinds(state).filter((k) => k === "achievement").length;
    monthlyHistoryStep(state);
    expect(kinds(state).filter((k) => k === "achievement")).toHaveLength(count);
  });

  it("out of debt needs a debt first", () => {
    const state = lineState();
    addTrain(state);
    monthlyHistoryStep(state);
    expect(state.history.achievements["outOfDebt"]).toBeUndefined();
    state.finance.loans = 400_000;
    monthlyHistoryStep(state);
    state.finance.loans = 0;
    monthlyHistoryStep(state);
    expect(state.history.achievements["outOfDebt"]).toBeDefined();
  });

  it("silver, uranium, passengers and freight come from deliveries", () => {
    const state = lineState();
    startHistory(state);
    recordHistoryDelivery(state, "silverBars", 10);
    recordHistoryDelivery(state, "enrichedUranium", 1);
    recordHistoryDelivery(state, "passengers", 99_999);
    recordHistoryDelivery(state, "coal", 9_000);
    monthlyHistoryStep(state);
    const a = state.history.achievements;
    expect(a["silverDelivered"]).toBeDefined();
    expect(a["uraniumDelivered"]).toBeDefined();
    expect(a["passengers100k"]).toBeUndefined();
    expect(a["freight10k"]).toBeUndefined();
    recordHistoryDelivery(state, "passengers", 1);
    recordHistoryDelivery(state, "coal", 1_000);
    monthlyHistoryStep(state);
    expect(a["passengers100k"]).toBeDefined();
    expect(a["freight10k"]).toBeDefined();
  });

  it("bridge builder counts bridge spans", () => {
    const state = lineState();
    startHistory(state);
    monthlyHistoryStep(state);
    expect(state.history.achievements["bridges10"]).toBeUndefined();
    const edges = state.trackGraph.allEdges();
    for (const e of edges.slice(0, 10)) e.bridge = "wood";
    monthlyHistoryStep(state);
    expect(state.history.achievements["bridges10"]).toBeDefined();
  });

  it("electrified and metropolis served", () => {
    const state = lineState();
    startHistory(state);
    state.trackGraph.allEdges()[0]!.electrified = true;
    const first = state.stations[0]!;
    state.cities.push({
      id: 0,
      name: "Bigtown",
      tier: "metropolis",
      population: 2_000_000,
      tiles: [first.tile],
      anchorX: first.tile % state.map.width,
      anchorY: Math.floor(first.tile / state.map.width),
    } as unknown as GameState["cities"][number]);
    monthlyHistoryStep(state);
    expect(state.history.achievements["electrified"]).toBeDefined();
    expect(state.history.achievements["metropolisServed"]).toBeDefined();
  });

  it("hard-mode survivor needs 20 years on Hard without going bankrupt", () => {
    const state = lineState({ difficulty: "hard", ticks: 19 * YEAR });
    startHistory(state);
    monthlyHistoryStep(state);
    expect(state.history.achievements["hardSurvivor20"]).toBeUndefined();
    state.ticks = 20 * YEAR + 1;
    state.finance.bankrupt = true;
    monthlyHistoryStep(state);
    expect(state.history.achievements["hardSurvivor20"]).toBeUndefined();
    state.finance.bankrupt = false;
    monthlyHistoryStep(state);
    expect(state.history.achievements["hardSurvivor20"]).toBeDefined();
  });
});

describe("saving", () => {
  it("keeps the history through a save", () => {
    const state = lineState({ cash: 3_000_000 });
    monthlyHistoryStep(state);
    recordHistoryDelivery(state, "coal", 55);
    const back = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
    expect(back.history).toEqual(state.history);
  });

  it("a save from before the history starts it at load, announcing nothing", () => {
    const state = lineState({ cash: 3_000_000 });
    addTrain(state);
    state.finance.loans = 100_000;
    const raw = JSON.parse(JSON.stringify(serializeGameState(state))) as Record<string, unknown>;
    delete raw["history"];
    const back = deserializeGameState(raw as never);
    expect(back.history.snapshots).toEqual([]);
    monthlyHistoryStep(back);
    expect(back.history.snapshots).toHaveLength(1);
    expect(kinds(back).filter((k) => k !== "achievement")).toEqual([]);
    expect(back.history.achievements["firstTrain"]).toBeDefined();
  });

  it("looking at the company never changes it", () => {
    const state = lineState({ cash: 3_000_000 });
    addTrain(state);
    const before = JSON.stringify({ ...serializeGameState(state), history: null });
    monthlyHistoryStep(state);
    expect(JSON.stringify({ ...serializeGameState(state), history: null })).toBe(before);
  });
});
