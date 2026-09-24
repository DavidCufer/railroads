import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { tileAt } from "./track/helpers";
import type { GameState } from "../../src/sim/state";

const LOCO = "american-4-4-0";

function run(): GameState {
  const state = createGameState({
    seed: 7,
    size: "small",
    waterLevel: "normal",
    roughness: "normal",
  });
  state.startYear = 1848;
  const width = 10;
  for (let x = 0; x < width; x++) {
    state.map.terrain[x] = 0;
    state.map.elevation[x] = 0;
  }
  const path = Array.from({ length: width }, (_, x) => tileAt(state.map, x, 0));
  buildTrack(state, path);
  const a = buildStation(state, tileAt(state.map, 0, 0), "depot");
  const b = buildStation(state, tileAt(state.map, width - 1, 0), "station");
  expect(a.ok).toBe(true);
  expect(b.ok).toBe(true);
  const stationA = state.stations[0] as { id: number };
  const stationB = state.stations[1] as { id: number };
  const bought = buyTrain(state, stationA.id, LOCO, ["coal", "coal"]);
  expect(bought.ok).toBe(true);
  const train = state.trains[0] as { id: number };
  setOrders(state, train.id, [
    { stationId: stationA.id, rule: "auto" },
    { stationId: stationB.id, rule: "auto" },
  ]);

  for (let tick = 0; tick < 360 * 24; tick++) advanceOneHour(state);
  return state;
}

describe("advanceOneHour determinism", () => {
  it("the same commands from the same seed produce identical cash/finance after a year", () => {
    const s1 = run();
    const s2 = run();

    expect(s1.cash).toBe(s2.cash);
    expect(s1.finance).toEqual(s2.finance);
    expect(s1.trains.map((t) => ({ route: t.route, status: t.status, cars: t.cars }))).toEqual(
      s2.trains.map((t) => ({ route: t.route, status: t.status, cars: t.cars })),
    );
    expect([...s1.stationCargo.entries()]).toEqual([...s2.stationCargo.entries()]);
  });
});
