/** Phase 25A: one delivery event (and so one floating label) per cargo type per train arrival. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { stepLoading } from "../../../src/sim/trains/loading";
import { CARGO } from "../../../src/data/cargo";
import type { CargoType } from "../../../src/data/cargo";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";
import type { Station } from "../../../src/sim/stations/types";

const LENGTH = 40;

function line(): { state: GameState; a: Station; b: Station } {
  const map = makeTestMap([Array.from({ length: LENGTH }, () => "p").join("")]);
  const state = makeTestState(map, { startYear: 1900, cash: 1e9 });
  expect(
    buildTrack(
      state,
      Array.from({ length: LENGTH }, (_, x) => tileAt(map, x, 0)),
    ).ok,
  ).toBe(true);
  expect(buildStation(state, tileAt(map, 0, 0), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(map, LENGTH - 1, 0), "depot").ok).toBe(true);
  const [a, b] = state.stations as [Station, Station];
  a.hasEngineShed = true;
  return { state, a, b };
}

function deliver(cars: CargoType[]): { state: GameState; cashGain: number } {
  const { state, a, b } = line();
  expect(buyTrain(state, a.id, "american-4-4-0", cars)).toMatchObject({ ok: true });
  const train = state.trains[0]!;
  setOrders(state, train.id, [
    { stationId: a.id, rule: "auto" },
    { stationId: b.id, rule: "auto" },
  ]);
  const economy = state.stationEconomy.get(b.id)!;
  economy.accepts = [...new Set(cars)] as never[];
  for (const car of train.cars) {
    car.loadedUnits = CARGO[car.cargoType].capacity;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;
  }
  state.ticks += 24 * 10;
  train.currentOrderIndex = 1; // at B
  train.route = [b.tile];
  train.routeIndex = 0;
  const before = state.cash;
  state.pendingDeliveries.length = 0;
  for (let i = 0; i < 2000; i++) if (stepLoading(state, train, b)) break;
  return { state, cashGain: state.cash - before };
}

describe("delivery events per train arrival", () => {
  it("3 grain + 2 mail cars unloading produce exactly two events, summed per cargo", () => {
    const { state, cashGain } = deliver(["grain", "grain", "grain", "mail", "mail"]);
    const events = state.pendingDeliveries;
    expect(events.map((e) => e.cargoType).sort()).toEqual(["grain", "mail"]);
    const grain = events.find((e) => e.cargoType === "grain")!;
    const mail = events.find((e) => e.cargoType === "mail")!;
    expect(grain.units).toBeCloseTo(3 * CARGO.grain.capacity, 6);
    expect(mail.units).toBeCloseTo(2 * CARGO.mail.capacity, 6);
    expect(grain.revenue + mail.revenue).toBeCloseTo(cashGain, 6);
  });

  it("a single-cargo train produces one event", () => {
    const { state } = deliver(["coal", "coal", "coal"]);
    expect(state.pendingDeliveries).toHaveLength(1);
    expect(state.pendingDeliveries[0]!.units).toBeCloseTo(3 * CARGO.coal.capacity, 6);
  });
});
