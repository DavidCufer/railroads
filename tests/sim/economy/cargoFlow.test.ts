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

  it("counts the production the full pile had no room for (Phase 41: 'Pile full')", () => {
    const { state, station } = stationWithCoalMine();
    const monthly = INDUSTRIES.coalMine.produces.coal as number;
    const cap = STATION_TYPE_DEFS.depot.storagePerCargo;
    const days = 25; // before the waiting-decay threshold (30 days), so only the cap loses cargo
    for (let day = 0; day < days; day++) accrueDailyCargo(state);
    const lost = state.stationFlow.get(station.id)?.year.coal?.pileFullUnits ?? 0;
    // everything made beyond what the pile holds is lost, none of it earlier than the pile filling up
    expect(lost).toBeCloseTo((monthly / 30) * days - cap, 3);
    expect(lost).toBeGreaterThan(0);
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

describe("passengers and mail: linear fill to one month, nobody gives up (Phase 35D)", () => {
  function peopleStation(warehouse: boolean) {
    const { state, station } = stationWithCoalMine();
    const st = state.stations[0] as { improvements: string[] };
    if (warehouse) st.improvements.push("warehouse");
    const eco = state.stationEconomy.get(station.id)!;
    eco.supply = { passengers: 300, mail: 60 };
    return { state, station };
  }
  const pile = (state: ReturnType<typeof peopleStation>["state"], id: number) =>
    state.stationCargo.get(id);

  it("grows linearly at the monthly rate: half a month holds half the cap", () => {
    const { state, station } = peopleStation(false);
    for (let day = 0; day < 15; day++) accrueDailyCargo(state);
    expect(pile(state, station.id)?.passengers?.amount).toBeCloseTo(150, 6);
    expect(pile(state, station.id)?.mail?.amount).toBeCloseTo(30, 6);
    expect(state.stationFlow.get(station.id)?.month.passengers?.lostUnits ?? 0).toBe(0);
  });

  it("stops at one month's worth and holds there, however long nobody comes", () => {
    const { state, station } = peopleStation(false);
    for (let day = 0; day < 400; day++) {
      accrueDailyCargo(state);
      expect(pile(state, station.id)?.passengers?.amount ?? 0).toBeLessThanOrEqual(300 + 1e-9);
    }
    expect(pile(state, station.id)?.passengers?.amount).toBeCloseTo(300, 6);
    expect(pile(state, station.id)?.mail?.amount).toBeCloseTo(60, 6);
  });

  it("counts the overflow, and only the overflow, as unserved demand with the fares lost", () => {
    const { state, station } = peopleStation(false);
    for (let day = 0; day < 40; day++) accrueDailyCargo(state);
    const month = state.stationFlow.get(station.id)?.month;
    // 40 days generated 400 people, 300 fit.
    expect(month?.passengers?.lostUnits).toBeCloseTo(100, 6);
    expect(month?.passengers?.lostRevenue).toBeGreaterThan(0);
    expect(month?.mail?.lostUnits).toBeCloseTo(20, 6);
  });

  it("a train taking people refills the pile linearly", () => {
    const { state, station } = peopleStation(false);
    for (let day = 0; day < 40; day++) accrueDailyCargo(state);
    pile(state, station.id)!.passengers!.amount -= 80;
    for (let day = 0; day < 4; day++) accrueDailyCargo(state);
    expect(pile(state, station.id)?.passengers?.amount).toBeCloseTo(220 + 40, 6);
    for (let day = 0; day < 10; day++) accrueDailyCargo(state);
    expect(pile(state, station.id)?.passengers?.amount).toBeCloseTo(300, 6);
  });

  it("each first-leg bucket fills and caps at its own month", () => {
    const { state, station } = peopleStation(false);
    state.stationEconomy.get(station.id)!.passengerBound = [
      { stationId: 7, share: 0.5 },
      { stationId: 8, share: 0.5 },
    ];
    for (let day = 0; day < 60; day++) accrueDailyCargo(state);
    const p = pile(state, station.id)?.passengers;
    expect(p?.bound?.[7]).toBeCloseTo(150, 6);
    expect(p?.bound?.[8]).toBeCloseTo(150, 6);
    expect(p?.amount).toBeCloseTo(300, 6);
    // A train takes the 7s: only that bucket refills, and only the 8s' overflow keeps counting.
    p!.bound![7] = 70;
    p!.amount -= 80;
    for (let day = 0; day < 6; day++) accrueDailyCargo(state);
    expect(p?.bound?.[7]).toBeCloseTo(100, 6);
    expect(p?.bound?.[8]).toBeCloseTo(150, 6);
  });

  it("clamps to the new cap when the rate falls; unreachable destinations become unassigned", () => {
    const { state, station } = peopleStation(false);
    const eco = state.stationEconomy.get(station.id)!;
    eco.passengerBound = [
      { stationId: 7, share: 0.5 },
      { stationId: 8, share: 0.5 },
    ];
    for (let day = 0; day < 30; day++) accrueDailyCargo(state);
    // Station 8 loses its service and the supply halves: bucket 7 now holds at most 0.5 x 150.
    eco.supply = { passengers: 150, mail: 60 };
    eco.passengerBound = [{ stationId: 7, share: 0.5 }];
    accrueDailyCargo(state);
    const p = pile(state, station.id)?.passengers;
    expect(p?.bound?.[7]).toBeCloseTo(75, 6);
    expect(p?.bound?.[8]).toBeUndefined();
    expect(p?.amount ?? 0).toBeLessThanOrEqual(150 + 1e-9);
  });

  it("freight is unchanged: storage cap and decay as before", () => {
    const { state, station } = stationWithCoalMine();
    for (let day = 0; day < 200; day++) accrueDailyCargo(state);
    expect(state.stationCargo.get(station.id)?.coal?.amount).toBeLessThanOrEqual(
      STATION_TYPE_DEFS.depot.storagePerCargo,
    );
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
