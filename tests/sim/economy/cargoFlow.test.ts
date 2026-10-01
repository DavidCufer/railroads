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

describe("passengers and mail give up waiting (Phase 30A)", () => {
  function peopleStation(warehouse: boolean) {
    const { state, station } = stationWithCoalMine();
    const st = state.stations[0] as { improvements: string[] };
    if (warehouse) st.improvements.push("warehouse");
    const eco = state.stationEconomy.get(station.id)!;
    eco.supply = { passengers: 300, mail: 60 };
    return { state, station };
  }

  it("has no storage cap: a never-served pile grows until giving up balances supply", () => {
    const { state, station } = peopleStation(false);
    for (let day = 0; day < 120; day++) accrueDailyCargo(state);
    const pax = state.stationCargo.get(station.id)?.passengers?.amount ?? 0;
    expect(pax).toBeGreaterThan(STATION_TYPE_DEFS.depot.storagePerCargo * 2);
    // settles near supply per day / give-up rate = 10 / 0.05
    expect(pax).toBeLessThan(10 / 0.05 + 1);
  });

  it("counts the people who gave up, with the fares lost, per station and month", () => {
    const { state, station } = peopleStation(false);
    for (let day = 0; day < 40; day++) accrueDailyCargo(state);
    const month = state.stationFlow.get(station.id)?.month.passengers;
    expect(month?.lostUnits).toBeGreaterThan(10);
    expect(month?.lostRevenue).toBeGreaterThan(0);
    expect(state.stationFlow.get(station.id)?.month.mail?.lostUnits ?? 0).toBeGreaterThan(0);
  });

  it("a Warehouse does nothing for passengers and mail (PLAYTEST-2 exploit 1)", () => {
    const plain = peopleStation(false);
    const stocked = peopleStation(true);
    for (let day = 0; day < 90; day++) {
      accrueDailyCargo(plain.state);
      accrueDailyCargo(stocked.state);
    }
    const a = plain.state.stationCargo.get(plain.station.id);
    const b = stocked.state.stationCargo.get(stocked.station.id);
    expect(b?.passengers?.amount).toBeCloseTo(a?.passengers?.amount ?? 0, 6);
    expect(b?.mail?.amount).toBeCloseTo(a?.mail?.amount ?? 0, 6);
  });

  it("a Warehouse still doubles the freight pile", () => {
    const { state, station } = stationWithCoalMine();
    (state.stations[0] as { improvements: string[] }).improvements.push("warehouse");
    for (let day = 0; day < 400; day++) accrueDailyCargo(state);
    const coal = state.stationCargo.get(station.id)?.coal?.amount ?? 0;
    expect(coal).toBeGreaterThan(STATION_TYPE_DEFS.depot.storagePerCargo);
  });
});
