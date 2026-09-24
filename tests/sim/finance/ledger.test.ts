import { describe, expect, it } from "vitest";
import { DIFFICULTY } from "../../../src/data/finance";
import { MAINTENANCE_SINGLE } from "../../../src/data/track";
import { STATION_TYPE_DEFS } from "../../../src/data/stations";
import { buildStation, buildTrack, buyTrain } from "../../../src/sim/commands";
import {
  addExpense,
  addRevenue,
  computeCreditLimit,
  monthlyFinanceStep,
  netWorth,
} from "../../../src/sim/finance/ledger";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

describe("ledger revenue/expense buckets", () => {
  it("routes passengers/mail/other cargo into the right bucket, both month and year", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map);
    addRevenue(state, "passengers", 100);
    addRevenue(state, "mail", 50);
    addRevenue(state, "coal", 25);
    addRevenue(state, "goods", 10);

    expect(state.finance.thisMonth.passengers).toBe(100);
    expect(state.finance.thisMonth.mail).toBe(50);
    expect(state.finance.thisMonth.freight).toBe(35);
    expect(state.finance.thisYear.freight).toBe(35);
  });
});

describe("monthlyFinanceStep", () => {
  it("charges track/station/train maintenance and clears the month", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map);
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];
    buildTrack(state, path);
    buildStation(state, tileAt(map, 0, 0), "depot");
    const cashBefore = state.cash;

    monthlyFinanceStep(state);

    const expectedTrack = 2 * MAINTENANCE_SINGLE; // 2 edges
    const expectedStation = STATION_TYPE_DEFS.depot.monthlyMaintenance;
    expect(state.cash).toBeCloseTo(cashBefore - expectedTrack - expectedStation, 5);
    expect(state.finance.thisMonth.trackMaintenance).toBe(0); // rolled over into a fresh period
  });

  it("charges monthly interest on outstanding loans at the difficulty's rate", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { difficulty: "normal" });
    state.finance.loans = 1_200_000;
    const cashBefore = state.cash;

    monthlyFinanceStep(state);

    const expectedInterest = 1_200_000 * (DIFFICULTY.normal.interestRate / 12);
    expect(cashBefore - state.cash).toBeCloseTo(expectedInterest, 5);
  });

  it("takes a forced loan up to the credit limit when cash goes negative (Normal)", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { difficulty: "normal", cash: -10 });

    monthlyFinanceStep(state);

    expect(state.finance.loans).toBeGreaterThan(0);
    expect(state.cash).toBeGreaterThanOrEqual(0);
    expect(state.finance.negativeCashMonths).toBe(0);
  });

  it("declares bankruptcy after 3 consecutive negative-cash months with no credit left", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { difficulty: "normal", cash: 0 });
    // Max out the credit limit up front so the forced-loan path can never cover the shortfall.
    state.finance.loans = computeCreditLimit(state);

    for (let i = 0; i < 2; i++) {
      state.cash = -1000;
      monthlyFinanceStep(state);
      expect(state.finance.bankrupt).toBe(false);
    }
    state.cash = -1000;
    monthlyFinanceStep(state);

    expect(state.finance.bankrupt).toBe(true);
  });

  it("Easy difficulty never sets the bankrupt flag even with sustained negative cash", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { difficulty: "easy", cash: -1_000_000 });
    for (let i = 0; i < 6; i++) monthlyFinanceStep(state);
    expect(state.finance.bankrupt).toBe(false);
  });
});

describe("netWorth", () => {
  it("rises by half the cost of a freshly-built track+station (SPEC §9.3)", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map);
    const worthBefore = netWorth(state);
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];
    const built = buildTrack(state, path);
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error("unreachable");

    // Cash drops by the full cost; net worth only drops by half of it (the other half is the
    // construction term SPEC §9.3 adds back).
    expect(netWorth(state)).toBeCloseTo(worthBefore - built.cost / 2, 5);
  });

  it("depreciates a train's value 5%/year from its purchase price, floored at 10%", () => {
    const map = makeTestMap(["pp"]);
    const state = makeTestState(map);
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0)];
    buildTrack(state, path);
    buildStation(state, tileAt(map, 0, 0), "depot"); // first station built gets a free Engine Shed
    const worthBeforeBuy = netWorth(state);
    const bought = buyTrain(state, state.stations[0]!.id, "grasshopper-0-4-0", []);
    expect(bought.ok).toBe(true);
    const worthRightAfter = netWorth(state);
    // Buying a train shouldn't change net worth: cash drops by its price, rolling-stock value rises
    // by the same amount.
    expect(worthRightAfter).toBeCloseTo(worthBeforeBuy, 5);

    const train = state.trains[0]!;
    train.purchaseTick -= 20 * 360 * 24; // pretend it's 20 years old — well past the 10% floor
    const worthMuchLater = netWorth(state);
    expect(worthMuchLater).toBeLessThan(worthRightAfter);
    expect(worthRightAfter - worthMuchLater).toBeCloseTo(train.purchasePrice * 0.9, 1);
  });
});

describe("addExpense", () => {
  it("adds to both the month and year buckets", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map);
    addExpense(state, "interest", 42);
    expect(state.finance.thisMonth.interest).toBe(42);
    expect(state.finance.thisYear.interest).toBe(42);
  });
});
