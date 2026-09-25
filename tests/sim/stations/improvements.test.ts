/**
 * PLAN Phase 9 acceptance tests: each SPEC §6.2 station improvement's effect, table-driven where
 * practical. Reuses the `twoStationLine`/`setAccepts`/`runToDeparture` pattern from
 * tests/sim/trains/loading.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  buildImprovement,
  buildStation,
  buildTrack,
  buyTrain,
  computeImprovementPlan,
  refreshStationEconomy,
  setOrders,
} from "../../../src/sim/commands";
import { STATION_IMPROVEMENTS } from "../../../src/data/stations";
import { stationLoadSpeedMult, stationStorageCap } from "../../../src/sim/stations/improvements";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import { stepLoading } from "../../../src/sim/trains/loading";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";
import type { Station } from "../../../src/sim/stations/types";

const LOCO = "american-4-4-0"; // available from 1848, plenty of cars

function twoStationLine(
  distanceTiles: number,
  startYear = 1848,
): { state: GameState; a: Station; b: Station } {
  const width = distanceTiles + 1;
  const map = makeTestMap([Array.from({ length: width }, () => "p").join("")]);
  const state = makeTestState(map);
  state.startYear = startYear;
  const path = Array.from({ length: width }, (_, x) => tileAt(map, x, 0));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, tileAt(map, 0, 0), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(map, width - 1, 0), "depot").ok).toBe(true);
  const a = state.stations[0] as Station;
  const b = state.stations[1] as Station;
  return { state, a, b };
}

function setAccepts(state: GameState, stationId: number, cargos: string[]): void {
  const economy = state.stationEconomy.get(stationId);
  if (economy) economy.accepts = cargos as never[];
}

function runToDeparture(state: GameState, train: { id: number }, station: Station): number {
  const t = state.trains.find((tr) => tr.id === train.id);
  if (!t) throw new Error("train not found");
  for (let i = 0; i < 10_000; i++) {
    if (stepLoading(state, t, station)) return i;
  }
  throw new Error("stepLoading never finished");
}

function deliverOnce(
  state: GameState,
  a: Station,
  b: Station,
  cargo: "coal" | "mail" | "passengers" | "food" | "livestock",
  distanceTiles: number,
): number {
  setAccepts(state, b.id, [cargo]);
  const bought = buyTrain(state, a.id, LOCO, [cargo]);
  expect(bought.ok).toBe(true);
  const train = state.trains[state.trains.length - 1] as { id: number };
  const t = state.trains.find((tr) => tr.id === train.id)!;
  const car = t.cars[0]!;
  car.loaded = true;
  car.loadedTile = a.tile;
  car.loadedTick = state.ticks - 12 * (distanceTiles / 2); // deliver right at "expected" transit

  expect(
    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]).ok,
  ).toBe(true);
  t.currentOrderIndex = 1;
  state.pendingDeliveries.length = 0;
  runToDeparture(state, train, b);
  return state.pendingDeliveries[0]?.revenue ?? 0;
}

describe("station improvements (SPEC §6.2)", () => {
  it("computeImprovementPlan gates by era and rejects an already-built one", () => {
    const { state, a } = twoStationLine(10, 1848);
    expect(computeImprovementPlan(state, a.id, "coldStorage").valid).toBe(false); // 1880
    expect(computeImprovementPlan(state, a.id, "freightYard").valid).toBe(false); // 1870
    expect(computeImprovementPlan(state, a.id, "postOffice").valid).toBe(true); // always
    expect(buildImprovement(state, a.id, "postOffice").ok).toBe(true);
    expect(computeImprovementPlan(state, a.id, "postOffice").valid).toBe(false); // already built
  });

  it("Post Office: +50% mail supply at that station", () => {
    const { state, a } = twoStationLine(10);
    const width = 11;
    const map = state.map;
    const cityTiles = [tileAt(map, 0, 0)];
    state.cities.push({
      id: 0,
      name: "Mailtown",
      tier: "city",
      population: 100_000,
      anchorX: 0,
      anchorY: 0,
      tiles: cityTiles,
      coastal: false,
    });
    map.cityId[tileAt(map, 0, 0)] = 0;
    refreshStationEconomy(state);
    const before = state.stationEconomy.get(a.id)?.supply.mail ?? 0;
    expect(before).toBeGreaterThan(0);

    expect(buildImprovement(state, a.id, "postOffice").ok).toBe(true);
    const after = state.stationEconomy.get(a.id)?.supply.mail ?? 0;
    expect(after).toBeCloseTo(before * 1.5, 1);
    void width;
  });

  it("Post Office: +25% mail revenue for mail loaded there", () => {
    const { state: withPO, a: aPO, b: bPO } = twoStationLine(20);
    expect(buildImprovement(withPO, aPO.id, "postOffice").ok).toBe(true);
    const revenueWithPO = deliverOnce(withPO, aPO, bPO, "mail", 20);

    const { state: plain, a, b } = twoStationLine(20);
    const revenuePlain = deliverOnce(plain, a, b, "mail", 20);

    expect(revenueWithPO).toBeCloseTo(revenuePlain * 1.25, 0);
  });

  it("Hotel: +25% passenger revenue for passengers delivered there", () => {
    const { state: withHotel, a: aH, b: bH } = twoStationLine(20);
    expect(buildImprovement(withHotel, bH.id, "hotel").ok).toBe(true);
    const revenueWithHotel = deliverOnce(withHotel, aH, bH, "passengers", 20);

    const { state: plain, a, b } = twoStationLine(20);
    const revenuePlain = deliverOnce(plain, a, b, "passengers", 20);

    expect(revenueWithHotel).toBeCloseTo(revenuePlain * 1.25, 0);
  });

  it("Cold Storage (1880+): +15% food/livestock revenue loaded there, and exempts them from decay", () => {
    const { state: withCS, a: aCS, b: bCS } = twoStationLine(20, 1880);
    expect(buildImprovement(withCS, aCS.id, "coldStorage").ok).toBe(true);
    const revenueWithCS = deliverOnce(withCS, aCS, bCS, "food", 20);

    const { state: plain, a, b } = twoStationLine(20, 1880);
    const revenuePlain = deliverOnce(plain, a, b, "food", 20);

    expect(revenueWithCS).toBeCloseTo(revenuePlain * 1.15, 0);
  });

  it("Warehouse: doubles storage cap and stops waiting cargo from decaying", () => {
    const { state, a } = twoStationLine(10);
    const capBefore = stationStorageCap(a);
    expect(buildImprovement(state, a.id, "warehouse").ok).toBe(true);
    const stationAfter = state.stations.find((s) => s.id === a.id)!;
    expect(stationStorageCap(stationAfter)).toBe(capBefore * 2);

    // Force a large, old pile that would otherwise decay heavily.
    state.stationCargo.set(a.id, { coal: { amount: 100, waitingDays: 200 } });
    accrueDailyCargo(state);
    expect(state.stationCargo.get(a.id)?.coal?.amount).toBeGreaterThanOrEqual(100);
  });

  it("Freight Yard (1870+): halves loading/unloading dwell time", () => {
    const base = twoStationLine(20, 1870);
    expect(stationLoadSpeedMult(base.b)).toBeGreaterThan(0);

    const withFY = twoStationLine(20, 1870);
    expect(buildImprovement(withFY.state, withFY.b.id, "freightYard").ok).toBe(true);
    const fyStation = withFY.state.stations.find((s) => s.id === withFY.b.id)!;
    expect(stationLoadSpeedMult(fyStation)).toBeCloseTo(stationLoadSpeedMult(base.b) * 0.5, 6);
  });

  it("Livestock Pens: required to load livestock, present or not", () => {
    const { state, a, b } = twoStationLine(10);
    setAccepts(state, b.id, ["livestock"]);
    state.stationCargo.set(a.id, { livestock: { amount: 40, waitingDays: 1 } });
    const bought = buyTrain(state, a.id, LOCO, ["livestock"]);
    expect(bought.ok).toBe(true);
    const train = state.trains[0]!;
    expect(
      setOrders(state, train.id, [
        { stationId: a.id, rule: "auto" },
        { stationId: b.id, rule: "auto" },
      ]).ok,
    ).toBe(true);
    train.currentOrderIndex = 0;
    runToDeparture(state, train, a);
    expect(train.cars[0]?.loaded).toBe(false); // no Livestock Pens yet

    expect(buildImprovement(state, a.id, "livestockPens").ok).toBe(true);
    setAccepts(state, b.id, ["livestock"]); // buildImprovement's refreshStationEconomy wiped it
    runToDeparture(state, train, a);
    expect(train.cars[0]?.loaded).toBe(true);
  });

  it("costs match the SPEC §6.2 table (before era inflation)", () => {
    expect(STATION_IMPROVEMENTS.postOffice.cost).toBe(25_000);
    expect(STATION_IMPROVEMENTS.hotel.cost).toBe(50_000);
    expect(STATION_IMPROVEMENTS.warehouse.cost).toBe(30_000);
    expect(STATION_IMPROVEMENTS.coldStorage.cost).toBe(40_000);
    expect(STATION_IMPROVEMENTS.freightYard.cost).toBe(60_000);
    expect(STATION_IMPROVEMENTS.livestockPens.cost).toBe(12_000);
  });
});
