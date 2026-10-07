/** Phase 41 (PLAYTEST-4 B1): a heavy engine behind a wooden bridge says why, and stone fixes it. */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  computeUpgradeBridgePlan,
  setOrders,
  upgradeBridge,
} from "../../../src/sim/commands";
import { LOCOMOTIVES } from "../../../src/data/trains";
import { weightBridgeBlock, trainWeightBridgeBlock } from "../../../src/sim/trains/bridgeBlock";
import { advanceOneHour } from "../../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "./helpers";

function setup() {
  const row = "pppppprpppp";
  const map = makeTestMap([row, row.replace("r", "p")]);
  const state = makeTestState(map, { startYear: 1930, cash: 1e9 });
  const path = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10].map((x) => tileAt(map, x, 0));
  buildTrack(state, path);
  buildStation(state, path[0]!, "station");
  buildStation(state, path[path.length - 1]!, "station");
  return { state, path };
}

describe("weight-limited bridges", () => {
  const heavy = LOCOMOTIVES.find((l) => l.weightClass === "heavy" && l.type !== "electric")!;

  it("finds the wooden bridge a heavy engine can't cross, and not for a lighter one", () => {
    const { state, path } = setup();
    const from = path[0]!;
    const to = path[path.length - 1]!;
    const block = weightBridgeBlock(state, "heavy", false, from, to);
    expect(block?.bridge).toBe("wood");
    expect(weightBridgeBlock(state, "medium", false, from, to)).toBeNull();
  });

  it("names the bridge for a noRoute train; stone makes the train run", () => {
    const { state } = setup();
    const [a, b] = state.stations;
    const bought = buyTrain(state, a!.id, heavy.id, []);
    expect(bought.ok).toBe(true);
    const train = state.trains[0]!;
    setOrders(state, train.id, [
      { stationId: a!.id, rule: "auto" },
      { stationId: b!.id, rule: "auto" },
    ]);
    for (let i = 0; i < 48; i++) advanceOneHour(state);
    expect(train.status).toBe("noRoute");
    const block = trainWeightBridgeBlock(state, train, heavy.weightClass, false)!;
    expect(block).not.toBeNull();
    const plan = computeUpgradeBridgePlan(state, block.a, block.b);
    expect(plan.options[0]!.type).toBe("stone");
    const cash = state.cash;
    expect(upgradeBridge(state, block.a, block.b)).toMatchObject({
      ok: true,
      cost: plan.options[0]!.cost,
    });
    expect(cash - state.cash).toBeCloseTo(plan.options[0]!.cost, 6);
    expect(block.bridge).toBe("stone");
    for (let i = 0; i < 24 * 5; i++) advanceOneHour(state);
    expect(train.status).not.toBe("noRoute");
    expect(trainWeightBridgeBlock(state, train, heavy.weightClass, false)).toBeNull();
    expect(upgradeBridge(state, block.a, block.b)).toMatchObject({
      ok: false,
      reason: "no-bridge-to-rebuild",
    });
  });

  it("refuses when cash is short", () => {
    const { state } = setup();
    const edge = state.trackGraph.allEdges().find((e) => e.bridge === "wood")!;
    state.cash = 0;
    expect(upgradeBridge(state, edge.a, edge.b)).toMatchObject({
      ok: false,
      reason: "cant-afford",
    });
  });
});
