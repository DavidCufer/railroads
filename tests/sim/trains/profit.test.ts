import { describe, expect, it } from "vitest";
import { monthlyFinanceStep, yearlyFinanceRollover } from "../../../src/sim/finance/ledger";
import {
  booksProfit,
  recordTrainRepair,
  recordTrainRevenue,
  trainProfitStatus,
} from "../../../src/sim/trains/profit";
import { buildStation, buildTrack, buyTrain } from "../../../src/sim/commands";
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

describe("per-train books", () => {
  it("records revenue, running cost and repairs, and rolls the year over", () => {
    const { state, train } = world();
    recordTrainRevenue(train, 5000);
    recordTrainRepair(train, 400);
    monthlyFinanceStep(state);
    expect(train.profit.thisYear.running).toBeGreaterThan(0);
    expect(train.profit.thisYear.wages).toBeGreaterThan(0); // the crew is paid
    expect(booksProfit(train.profit.thisYear)).toBeCloseTo(
      5000 - 400 - train.profit.thisYear.running - (train.profit.thisYear.wages ?? 0),
    );
    expect(train.lifetimeRevenue).toBe(5000);

    const before = booksProfit(train.profit.thisYear);
    yearlyFinanceRollover(state);
    expect(train.profit.thisYear.revenue).toBe(0);
    expect(booksProfit(train.profit.lastYear)).toBeCloseTo(before);
    expect(booksProfit(train.profit.lifetime)).toBeCloseTo(before);
  });

  it("calls a young train 'new' and an old money-loser 'bad'", () => {
    const { state, train } = world();
    expect(trainProfitStatus(train, state.ticks)).toBe("new");
    state.ticks += 24 * 400;
    expect(trainProfitStatus(train, state.ticks)).toBe("ok");
    train.profit.lifetime.running = 5000;
    expect(trainProfitStatus(train, state.ticks)).toBe("bad");
    train.profit.lifetime.revenue = 100_000;
    expect(trainProfitStatus(train, state.ticks)).toBe("good");
  });
});
