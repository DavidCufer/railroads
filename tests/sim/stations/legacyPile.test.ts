/** Phase 52: a pre-Phase-48 pile (people with no destination) becomes destination lots on the next accrual. */
import { describe, expect, it } from "vitest";
import { buyTrain, setOrders } from "../../../src/sim/commands";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import type { Train } from "../../../src/sim/trains/types";
import { lineWithStops } from "../trains/middleStop.test";

function served() {
  const { state, stationIds } = lineWithStops(3, 12, 1860);
  for (const s of state.stations) s.hasEngineShed = true;
  const [a, b, c] = stationIds;
  expect(buyTrain(state, a!, "american-4-4-0", ["passengers"]).ok).toBe(true);
  const t = state.trains[state.trains.length - 1] as Train;
  setOrders(
    state,
    t.id,
    [a!, b!, c!, b!].map((id) => ({ stationId: id, rule: "auto" as const })),
  );
  return { state, a: a! };
}

describe("old-save passengers", () => {
  it("a legacy pile with no lots is converted to destination lots and capped", () => {
    const { state, a } = served();
    accrueDailyCargo(state); // computes nothing special; routes are in the economy
    state.stationCargo.set(a, { passengers: { amount: 2409, waitingDays: 40 } });
    accrueDailyCargo(state);
    const pile = state.stationCargo.get(a)!.passengers!;
    const lotTotal = (pile.lots ?? []).reduce((n, l) => n + l.amount, 0);
    expect(pile.amount).toBeCloseTo(lotTotal, 6); // nobody is left without a destination
    expect(pile.amount).toBeLessThan(2409);
    expect(pile.bound).toBeUndefined();
    const flow = state.stationFlow.get(a);
    expect(flow?.month.passengers?.lostUnits ?? 0).toBeGreaterThan(0);
  });

  it("with no routes the legacy amount drops to nothing", () => {
    const { state, a } = served();
    state.stationEconomy.get(a)!.passengerRoutes = [];
    state.stationCargo.set(a, { passengers: { amount: 500, waitingDays: 40 } });
    accrueDailyCargo(state);
    expect(state.stationCargo.get(a)!.passengers?.amount ?? 0).toBe(0);
  });
});
