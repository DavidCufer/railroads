import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  layUpTrain,
  returnTrainToService,
} from "../../../src/sim/commands";
import { monthlyFinanceStep } from "../../../src/sim/finance/ledger";
import { stepTrains } from "../../../src/sim/trains";
import { LAID_UP_SERVICING_SHARE, RETURN_TO_SERVICE_DAYS } from "../../../src/data/economy";
import { deserializeGameState, serializeGameState } from "../../../src/save/serialize";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

function world() {
  const map = makeTestMap(["ppppp"]);
  const state = makeTestState(map);
  buildTrack(
    state,
    [0, 1, 2, 3, 4].map((x) => tileAt(map, x, 0)),
  );
  buildStation(state, tileAt(map, 0, 0), "depot");
  const bought = buyTrain(state, state.stations[0]!.id, "grasshopper-0-4-0", []);
  if (!bought.ok) throw new Error(`buy failed: ${bought.reason}`);
  return { state, train: state.trains[0]! };
}

function runTicks(state: ReturnType<typeof world>["state"], n: number): void {
  for (let i = 0; i < n; i++) {
    state.ticks++;
    stepTrains(state);
  }
}

describe("laying a train up (Phase 66)", () => {
  it("rejects a train that is not standing at a station or already laid up", () => {
    const { state, train } = world();
    expect(layUpTrain(state, 999)).toEqual({ ok: false, reason: "invalid-train" });
    train.status = "moving";
    expect(layUpTrain(state, train.id)).toEqual({ ok: false, reason: "not-at-station" });
    train.status = "loading";
    expect(layUpTrain(state, train.id).ok).toBe(true);
    expect(layUpTrain(state, train.id).ok).toBe(false);
    expect(returnTrainToService(state, 999).ok).toBe(false);
  });

  it("holds nothing and stays put while laid up, and pays no crew and a share of servicing", () => {
    const a = world();
    const b = world();
    expect(layUpTrain(b.state, b.train.id).ok).toBe(true);
    runTicks(b.state, 24 * 40);
    expect(b.train.status).toBe("laidUp");
    expect(b.train.heldBlocks).toHaveLength(0);
    expect(b.train.route[b.train.routeIndex]).toBe(a.train.route[a.train.routeIndex]);
    monthlyFinanceStep(a.state);
    monthlyFinanceStep(b.state);
    expect(b.train.profit.thisYear.wages ?? 0).toBeCloseTo(0, 6);
    expect(a.train.profit.thisYear.wages ?? 0).toBeGreaterThan(0);
    expect(b.train.profit.thisYear.running).toBeCloseTo(
      a.train.profit.thisYear.running * LAID_UP_SERVICING_SHARE,
      6,
    );
  });

  it("returns to service after the recrew time, paying the crew meanwhile, and survives a save", () => {
    const { state, train } = world();
    layUpTrain(state, train.id);
    expect(returnTrainToService(state, train.id).ok).toBe(true);
    expect(returnTrainToService(state, train.id).ok).toBe(false);
    const copy = deserializeGameState(serializeGameState(state));
    expect(copy.trains[0]!.laidUp).toBe(true);
    runTicks(state, RETURN_TO_SERVICE_DAYS * 24 - 1);
    expect(train.status).toBe("laidUp");
    runTicks(state, 1);
    expect(train.laidUp).toBeUndefined();
    expect(train.status).not.toBe("laidUp");
    expect(train.laidUpTicks ?? 0).toBe(0);
  });
});
