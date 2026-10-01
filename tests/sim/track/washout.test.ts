/** Phase 30A (PLAYTEST-2 Bug 2): washouts leave a marker and can be rebuilt. */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  computeRebuildBridgePlan,
  rebuildBridge,
  setOrders,
  upgradeTrack,
} from "../../../src/sim/commands";
import { yearlyWashoutStep, washOut, washoutsCuttingTrain } from "../../../src/sim/track/washout";
import { advanceOneHour } from "../../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "./helpers";
import type { GameState } from "../../../src/sim/state";

/** A line of 12 tiles with a river tile at x = 6 (a river bridge between x = 5 and x = 7), stations at both ends. */
function riverLine(year = 1850): { state: GameState; path: number[] } {
  const row = "pppppprpppp";
  const map = makeTestMap([row, row.replace("r", "p")]);
  const state = makeTestState(map, { startYear: year, cash: 1e9 });
  const path = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10].map((x) => tileAt(map, x, 0));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, path[0]!, "station").ok).toBe(true);
  expect(buildStation(state, path[path.length - 1]!, "station").ok).toBe(true);
  return { state, path };
}

function bridgeEdge(state: GameState) {
  return state.trackGraph.allEdges().find((e) => e.bridge !== null)!;
}

describe("washouts", () => {
  it("a washed-out bridge leaves a persistent marker and cuts the line until it is rebuilt", () => {
    const { state } = riverLine();
    const edge = bridgeEdge(state);
    expect(edge.bridge).toBe("wood");
    washOut(state, edge);
    expect(state.washouts).toHaveLength(1);
    expect(state.trackGraph.hasEdge(edge.a, edge.b)).toBe(false);
    for (let y = 0; y < 5; y++) yearlyWashoutStep(state); // the years pass, nothing rebuilds it
    expect(state.washouts).toHaveLength(1);
    expect(state.washouts[0]).toMatchObject({ a: edge.a, b: edge.b, kind: "river", double: false });
  });

  it("offers every material the era allows, cheapest first, with only wood able to wash out again", () => {
    const { state } = riverLine(1850);
    washOut(state, bridgeEdge(state));
    const early = computeRebuildBridgePlan(state, 0);
    expect(early.options.map((o) => o.type)).toEqual(["wood", "stone"]); // steel arrives in 1870
    expect(early.options.map((o) => o.washable)).toEqual([true, false]);
    expect(early.options[0]!.cost).toBeLessThan(early.options[1]!.cost);
    state.ticks += 25 * 360 * 24; // 1875
    const late = computeRebuildBridgePlan(state, 0);
    expect(late.options.map((o) => o.type)).toEqual(["wood", "stone", "steel"]);
  });

  it("rebuilding in stone restores the line, charges the price, and stone never washes out again", () => {
    const { state } = riverLine(1850);
    washOut(state, bridgeEdge(state));
    const stone = computeRebuildBridgePlan(state, 0).options.find((o) => o.type === "stone")!;
    const cash = state.cash;
    expect(rebuildBridge(state, 0, "stone")).toMatchObject({ ok: true, cost: stone.cost });
    expect(cash - state.cash).toBeCloseTo(stone.cost, 6);
    expect(state.washouts).toHaveLength(0);
    expect(bridgeEdge(state).bridge).toBe("stone");
    for (let y = 0; y < 400; y++) yearlyWashoutStep(state);
    expect(state.washouts).toHaveLength(0);
    expect(rebuildBridge(state, 0)).toMatchObject({ ok: false, reason: "no-bridge-to-rebuild" });
  });

  it("a double-track bridge comes back double, and costs for it", () => {
    const { state, path } = riverLine(1850);
    expect(upgradeTrack(state, path).ok).toBe(true);
    const single = computeRebuildBridgePlan(riverLine(1850).state, 0); // (no washout there)
    expect(single.valid).toBe(false);
    washOut(state, bridgeEdge(state));
    const plan = computeRebuildBridgePlan(state, 0);
    expect(plan.washout!.double).toBe(true);
    const singleWood = riverLine(1850).state;
    washOut(singleWood, bridgeEdge(singleWood));
    expect(plan.options[0]!.cost).toBeGreaterThan(
      computeRebuildBridgePlan(singleWood, 0).options[0]!.cost * 1.5,
    );
    rebuildBridge(state, 0);
    expect(bridgeEdge(state).double).toBe(true);
  });

  it("trains on a cut line report no route; the cutting bridge is named; rebuilding gets them going again", () => {
    const { state, path } = riverLine(1850);
    const [a, b] = state.stations as [(typeof state.stations)[0], (typeof state.stations)[0]];
    expect(buyTrain(state, a.id, "american-4-4-0", ["passengers", "passengers"]).ok).toBe(true);
    const train = state.trains[0]!;
    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    washOut(state, bridgeEdge(state));
    for (let i = 0; i < 24 * 20; i++) advanceOneHour(state);
    expect(train.status).toBe("noRoute");
    const cut = washoutsCuttingTrain(state, path[0]!, path[path.length - 1]!);
    expect(cut.map((w) => w.id)).toEqual([0]);
    expect(rebuildBridge(state, 0).ok).toBe(true);
    expect(washoutsCuttingTrain(state, path[0]!, path[path.length - 1]!)).toEqual([]);
    for (let i = 0; i < 24 * 40; i++) advanceOneHour(state);
    expect(train.status).not.toBe("noRoute");
    expect(train.distanceTraveled).toBeGreaterThan(5);
  });
});
