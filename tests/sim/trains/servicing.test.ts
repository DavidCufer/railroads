/** Phase 30A: Engine Shed servicing by distance (PLAYTEST-2 Top 10 #8). */
import { describe, expect, it } from "vitest";
import {
  kmSinceService,
  monthlyBreakdownChance,
  serviceBreakdownMult,
} from "../../../src/sim/trains/breakdown";
import { SERVICE_DELAY_TICKS, SERVICE_INTERVAL_KM, locomotiveById } from "../../../src/data/trains";
import { KM_PER_TILE } from "../../../src/data/scale";
import { advanceOneHour } from "../../../src/sim/tick";
import { buildRoute } from "../balanceRoutes";
import type { GameState } from "../../../src/sim/state";

const atlantic = locomotiveById("atlantic-4-4-2")!;
const INTERVAL_TILES = SERVICE_INTERVAL_KM.steam / KM_PER_TILE;

function line(): GameState {
  const { state } = buildRoute({
    cargo: "passengers",
    km: 100,
    year: 1900,
    loco: "atlantic-4-4-2",
    population: 100_000,
    tier: "city",
    cars: 4,
  });
  return state;
}

describe("servicing by distance", () => {
  it("is ×0.5 fresh from a shed, ×1.5 one interval later, and capped", () => {
    expect(serviceBreakdownMult(0, atlantic)).toBeCloseTo(0.5, 9);
    expect(serviceBreakdownMult(SERVICE_INTERVAL_KM.steam, atlantic)).toBeCloseTo(1.5, 9);
    expect(serviceBreakdownMult(1e9, atlantic)).toBe(3.5);
    const diesel = locomotiveById("road-switcher-diesel")!;
    expect(serviceBreakdownMult(SERVICE_INTERVAL_KM.steam, diesel)).toBeLessThan(1);
  });

  it("the monthly chance rises with kilometres since the last service", () => {
    const s = line();
    const train = s.trains[0]!;
    const fresh = monthlyBreakdownChance(s, train);
    train.distanceTraveled = 2 * INTERVAL_TILES;
    train.serviceOdometerTiles = 0;
    const overdue = monthlyBreakdownChance(s, train);
    train.serviceOdometerTiles = train.distanceTraveled; // serviced just now
    expect(monthlyBreakdownChance(s, train)).toBeLessThan(overdue / 3);
    expect(overdue).toBeGreaterThan(fresh * 3);
  });

  /** Ticks the first stop at the far station lasts, with or without a shed there, after `tilesRun` tiles since service. */
  function stopLength(farShed: boolean, tilesRun: number): { ticks: number; s: GameState } {
    const s = line();
    const far = s.stations[1]!;
    far.hasEngineShed = farShed;
    const train = s.trains[0]!;
    train.distanceTraveled = tilesRun;
    train.serviceOdometerTiles = 0;
    let ticks = 0;
    let arrived = false;
    for (let i = 0; i < 24 * 60 && !(arrived && train.status !== "loading"); i++) {
      advanceOneHour(s);
      if (train.route[train.routeIndex] === far.tile && train.status === "loading") {
        arrived = true;
        ticks++;
      }
    }
    return { ticks, s };
  }

  it("a stop at a shed resets the kilometres and costs a servicing delay once a tenth of an interval has run", () => {
    const plain = stopLength(false, 0.5 * INTERVAL_TILES);
    const shed = stopLength(true, 0.5 * INTERVAL_TILES);
    expect(shed.ticks - plain.ticks).toBe(SERVICE_DELAY_TICKS);
    const t = shed.s.trains[0]!;
    expect(kmSinceService(t)).toBeLessThan(0.1 * SERVICE_INTERVAL_KM.steam);
    expect(kmSinceService(plain.s.trains[0]!)).toBeGreaterThan(0.5 * SERVICE_INTERVAL_KM.steam);
  });

  it("a freshly serviced engine is not delayed again", () => {
    const plain = stopLength(false, 0.01 * INTERVAL_TILES);
    const shed = stopLength(true, 0.01 * INTERVAL_TILES);
    expect(shed.ticks).toBe(plain.ticks);
  });

  it("a line whose trains never reach a shed breaks down far more than one with a shed at each end", () => {
    // 3 years of running: kilometres since service at the end (the breakdown chance follows it)
    const yearsRun = (farShed: boolean, homeShed: boolean): number => {
      const s = line();
      s.stations[0]!.hasEngineShed = homeShed;
      s.stations[1]!.hasEngineShed = farShed;
      for (let i = 0; i < 24 * 360 * 2; i++) advanceOneHour(s);
      return kmSinceService(s.trains[0]!);
    };
    expect(yearsRun(true, true)).toBeLessThan(400);
    expect(yearsRun(false, false)).toBeGreaterThan(5_000);
  });
});
