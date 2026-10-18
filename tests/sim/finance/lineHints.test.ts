/** Phase 47: the "add a train" hint fires for full trains with a crowd waiting, never for an empty, under-served line. */
import { describe, expect, it } from "vitest";
import { ADD_TRAIN_HINT } from "../../../src/data/trains";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { addTrainHint, monthlyLineHintStep } from "../../../src/sim/finance/lineHints";
import { HOURS_PER_DAY } from "../../../src/sim/time";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { giveStationsTowns } from "../stationTowns";

function world() {
  const row = Array.from({ length: 16 }, () => "p").join("");
  const map = makeTestMap([row, row, row]);
  const state = makeTestState(map, { startYear: 1860 });
  state.cash = 1e9;
  buildTrack(
    state,
    Array.from({ length: 16 }, (_, x) => tileAt(map, x, 1)),
  );
  buildStation(state, tileAt(map, 0, 1), "station");
  buildStation(state, tileAt(map, 15, 1), "station");
  giveStationsTowns(state);
  const [a, b] = state.stations.map((s) => s.id) as [number, number];
  expect(buyTrain(state, a, "grasshopper-0-4-0", ["passengers"]).ok).toBe(true);
  const train = state.trains[0]!;
  expect(
    setOrders(state, train.id, [
      { stationId: a, rule: "auto" },
      { stationId: b, rule: "auto" },
    ]).ok,
  ).toBe(true);
  state.ticks = (ADD_TRAIN_HINT.minAgeDays + 10) * HOURS_PER_DAY;
  return { state, train, a, b };
}

describe("add-a-train hint", () => {
  it("fires when the train runs full and more waits than one train carries", () => {
    const { state, train, a } = world();
    train.loadShare = 0.95;
    state.stationCargo.set(a, { passengers: { amount: 500, waitingDays: 1 } });
    const hint = addTrainHint(state, [train.id]);
    expect(hint?.cargo).toBe("passengers");
    expect(hint?.waiting).toBe(500);
  });

  it("stays quiet on an under-served route where the train runs empty, however many wait", () => {
    const { state, train, a } = world();
    train.loadShare = 0.2;
    state.stationCargo.set(a, { passengers: { amount: 5000, waitingDays: 1 } });
    expect(addTrainHint(state, [train.id])).toBeUndefined();
  });

  it("stays quiet when the train is full but the crowd fits in one train", () => {
    const { state, train, a } = world();
    train.loadShare = 1;
    state.stationCargo.set(a, { passengers: { amount: 3, waitingDays: 1 } });
    expect(addTrainHint(state, [train.id])).toBeUndefined();
  });

  it("needs a month of running before the load counts", () => {
    const { state, train, a } = world();
    train.loadShare = 1;
    state.ticks = 5 * HOURS_PER_DAY;
    state.stationCargo.set(a, { passengers: { amount: 500, waitingDays: 1 } });
    expect(addTrainHint(state, [train.id])).toBeUndefined();
  });

  it("is announced once per game, as news", () => {
    const { state, train, a } = world();
    train.loadShare = 0.95;
    state.stationCargo.set(a, { passengers: { amount: 500, waitingDays: 1 } });
    monthlyLineHintStep(state);
    monthlyLineHintStep(state);
    expect(state.news.filter((n) => n.kind === "addTrain")).toHaveLength(1);
  });
});
