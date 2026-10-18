/** Phase 54: a save written with one person per passenger and per-destination piles loads into the one-pile model. */
import { describe, expect, it } from "vitest";
import { PARTY_SIZE } from "../../src/data/economy";
import { migratePassengers } from "../../src/save/serialize";
import { carCapacity } from "../../src/sim/trains/capacity";
import type { GameState } from "../../src/sim/state";
import type { Train } from "../../src/sim/trains/types";
import { makeTestMap, makeTestState } from "../sim/track/helpers";

function oldSave(): GameState {
  const state = makeTestState(makeTestMap(["pppp"]));
  // A pre-Phase-54 pile: destination lots and first-leg buckets on top of the amount, counted in people.
  state.stationCargo.set(0, {
    passengers: {
      amount: 90,
      waitingDays: 3,
      bound: { 1: 30 },
      lots: [{ dest: 2, amount: 60, originTile: 0 }],
    } as never,
    mail: { amount: 12, waitingDays: 1 },
  });
  const train = {
    id: 0,
    cars: [
      // aboard with a destination (people), a car with people and no destination, an empty one, and a mail car
      {
        cargoType: "passengers",
        loadedUnits: 30,
        lots: [{ dest: 1, amount: 30, originTile: 0, tick: 5 }],
        loadedTile: 0,
        loadedTick: 5,
      },
      { cargoType: "passengers", loadedUnits: 20, loadedTile: 0, loadedTick: 5 },
      { cargoType: "passengers", loadedUnits: 0, seats: 60 },
      { cargoType: "mail", loadedUnits: 8 },
    ],
    orders: [],
  } as unknown as Train;
  state.trains.push(train);
  return state;
}

describe("migratePassengers", () => {
  it("collapses every old pile shape into the station's one pile, in game passengers", () => {
    const state = oldSave();
    migratePassengers(state, 1);
    const pile = state.stationCargo.get(0)?.passengers as unknown as Record<string, unknown>;
    expect(pile["amount"]).toBeCloseTo(90 / PARTY_SIZE, 9);
    expect(pile["bound"]).toBeUndefined();
    expect(pile["lots"]).toBeUndefined();
    expect(state.stationCargo.get(0)?.mail?.amount).toBe(12); // other cargo untouched
  });

  it("rescales the people aboard and puts off those with no destination", () => {
    const state = oldSave();
    migratePassengers(state, 1);
    const [withDest, noDest, empty, mail] = (state.trains[0] as Train).cars;
    expect(withDest?.lots?.[0]?.amount).toBeCloseTo(30 / PARTY_SIZE, 9);
    expect(withDest?.loadedUnits).toBeCloseTo(30 / PARTY_SIZE, 9);
    expect(noDest?.loadedUnits).toBe(0);
    expect(noDest?.loadedTile).toBeUndefined();
    expect(mail?.loadedUnits).toBe(8);
    // seats count game passengers now: a 40-seat car holds 40 / party, a 60-seat car 60 / party
    expect(carCapacity(withDest!)).toBeCloseTo(40 / PARTY_SIZE, 9);
    expect(carCapacity(empty!)).toBeCloseTo(60 / PARTY_SIZE, 9);
  });
});
