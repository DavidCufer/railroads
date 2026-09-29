import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { dailyUndeliverableStep, undeliverableCars } from "../../../src/sim/trains/undeliverable";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

function world() {
  const map = makeTestMap(["ppppppppppp"]);
  const state = makeTestState(map, { startYear: 1848 });
  buildTrack(
    state,
    Array.from({ length: 11 }, (_, x) => tileAt(map, x, 0)),
  );
  buildStation(state, tileAt(map, 0, 0), "depot");
  buildStation(state, tileAt(map, 10, 0), "depot");
  const [a, b] = state.stations;
  expect(buyTrain(state, a!.id, "american-4-4-0", ["coal", "coal"]).ok).toBe(true);
  const train = state.trains[0]!;
  setOrders(state, train.id, [
    { stationId: a!.id, rule: "auto" },
    { stationId: b!.id, rule: "auto" },
  ]);
  for (const car of train.cars) car.loadedUnits = 10;
  return { state, train, a: a!, b: b! };
}

describe("undeliverable cargo", () => {
  it("flags loaded cars nobody on the route accepts, and announces once", () => {
    const { state, train, b } = world();
    state.stationEconomy.get(b.id)!.accepts = [];
    expect(undeliverableCars(state, train).get("coal")).toBe(2);
    dailyUndeliverableStep(state);
    dailyUndeliverableStep(state);
    expect(state.news.filter((n) => n.kind === "undeliverable")).toHaveLength(1);

    state.stationEconomy.get(b.id)!.accepts = ["coal"];
    expect(undeliverableCars(state, train).size).toBe(0);
    dailyUndeliverableStep(state);
    expect(train.undeliverableReported).toBeUndefined();
  });
});
