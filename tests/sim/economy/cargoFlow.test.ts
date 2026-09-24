import { describe, expect, it } from "vitest";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import { buildStation, buildTrack } from "../../../src/sim/commands";
import { computeStationEconomies } from "../../../src/sim/stations/economy";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { Industry } from "../../../src/sim/economy/types";
import { INDUSTRIES } from "../../../src/data/industries";
import { STATION_TYPE_DEFS } from "../../../src/data/stations";
import { waitingDecayThresholdDays } from "../../../src/data/cargo";

function stationWithCoalMine() {
  const map = makeTestMap(["ppp"]);
  const state = makeTestState(map);
  const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];
  buildTrack(state, path);
  const built = buildStation(state, tileAt(map, 1, 0), "depot");
  expect(built.ok).toBe(true);

  // Manually place a coal mine adjacent to the depot (within its 3x3 catchment).
  const industryTile = tileAt(map, 0, 0);
  map.industryId[industryTile] = 0;
  const industry: Industry = { id: 0, type: "coalMine", x: 0, y: 0 };
  state.industries.push(industry);
  state.industryEconomy.set(0, {
    inputStock: {},
    monthlyOutput: { ...INDUSTRIES.coalMine.produces },
  });

  // buildStation ran before the industry existed — recompute now that it's in place.
  state.stationEconomy = computeStationEconomies(
    state.map,
    state.cities,
    state.industries,
    state.stations,
    state.startYear,
    state.industryEconomy,
  );

  const station = state.stations[0] as { id: number };
  return { state, station };
}

describe("accrueDailyCargo", () => {
  it("adds daily supply (monthly/30) to a station's waiting pile", () => {
    const { state, station } = stationWithCoalMine();

    accrueDailyCargo(state);
    const pile = state.stationCargo.get(station.id);
    expect(pile?.coal?.amount).toBeCloseTo((INDUSTRIES.coalMine.produces.coal as number) / 30, 5);
    expect(pile?.coal?.waitingDays).toBe(1);
  });

  it("caps waiting cargo at the station's storage capacity", () => {
    const { state, station } = stationWithCoalMine();

    for (let day = 0; day < 200; day++) accrueDailyCargo(state);
    const pile = state.stationCargo.get(station.id);
    expect(pile?.coal?.amount).toBeLessThanOrEqual(STATION_TYPE_DEFS.depot.storagePerCargo);
  });

  it("decays a waiting pile 5%/day once it's older than the cargo's threshold", () => {
    const { state, station } = stationWithCoalMine();
    expect(waitingDecayThresholdDays("coal")).toBe(30);

    // Isolate decay from inflow: no supply this tick, a pile already past the threshold.
    (state.industryEconomy.get(0) as { monthlyOutput: Record<string, number> }).monthlyOutput = {};
    state.stationEconomy = computeStationEconomies(
      state.map,
      state.cities,
      state.industries,
      state.stations,
      state.startYear,
      state.industryEconomy,
    );
    state.stationCargo.set(station.id, { coal: { amount: 20, waitingDays: 31 } });

    accrueDailyCargo(state);
    expect(state.stationCargo.get(station.id)?.coal?.amount).toBeCloseTo(20 * 0.95, 5);
  });
});
