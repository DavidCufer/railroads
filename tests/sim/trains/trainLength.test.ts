import { describe, expect, it } from "vitest";
import { createGameState } from "../../../src/sim/state";
import { computeTargetSpeed } from "../../../src/sim/trains";
import type { Train } from "../../../src/sim/trains";
import {
  LOCOMOTIVES,
  TRAIN_LENGTH_SCALE,
  locomotiveById,
  type LocomotiveDef,
} from "../../../src/data/trains";
import { trainCrewSize } from "../../../src/data/economy";
import { carCapacity } from "../../../src/sim/trains/capacity";

/** Phase 58 item 1: one train-length scale for every engine, and power (not the cap) sets the useful length. */

function loadedTrain(n: number): Train {
  const cars = Array.from({ length: n }, () => ({ cargoType: "coal" as const, loadedUnits: 0 }));
  for (const c of cars) c.loadedUnits = carCapacity(c);
  return { cars, direction: -1 } as unknown as Train;
}

const state = createGameState({
  seed: 1,
  size: "small",
  waterLevel: "normal",
  roughness: "normal",
});
state.startYear = 1950;
state.map.elevation[0] = 0;
state.map.elevation[1] = 0;
state.map.elevation[2] = 1;

/** Speed of `loco` hauling `n` full coal cars up one elevation step (the game's steepest grade) and on the level. */
function speeds(loco: LocomotiveDef, n: number): { level: number; hill: number } {
  const train = loadedTrain(n);
  return {
    level: computeTargetSpeed(state, loco, train, 0, 1) / loco.maxSpeedKmh,
    hill: computeTargetSpeed(state, loco, train, 1, 2) / loco.maxSpeedKmh,
  };
}

describe("train length scale (Phase 58)", () => {
  it("every engine's cap is its real typical train times the one scale", () => {
    for (const l of LOCOMOTIVES)
      expect(l.maxCars).toBe(Math.round(l.typicalCars * TRAIN_LENGTH_SCALE));
  });

  it("the first engines keep their Phase 48 lengths, the big freight engines haul real-length trains", () => {
    const cars = (id: string): number => locomotiveById(id)!.maxCars;
    expect([cars("grasshopper-0-4-0"), cars("planet-2-2-0"), cars("norris-4-2-0")]).toEqual([
      4, 6, 8,
    ]);
    expect(cars("american-4-4-0")).toBe(10);
    expect(cars("consolidation-2-8-0")).toBeGreaterThanOrEqual(20);
    expect(cars("mikado-2-8-2")).toBeGreaterThanOrEqual(30);
    expect(cars("articulated-4-8-8-4")).toBeGreaterThanOrEqual(50);
    expect(cars("heavy-diesel")).toBeGreaterThanOrEqual(40);
  });

  it("a weak engine with a long train crawls up the ridge, a strong one does not", () => {
    const mogul = speeds(locomotiveById("mogul-2-6-0")!, 24);
    const big = speeds(locomotiveById("articulated-4-8-8-4")!, 24);
    expect(mogul.hill).toBeLessThan(0.3);
    expect(big.hill).toBeGreaterThan(0.5);
    // on the level the same 24 cars cost the Mogul more speed than the Articulated, too
    expect(mogul.level).toBeLessThan(big.level);
  });

  it("the longest train that keeps half speed on the ridge grows with power", () => {
    const useful = (l: LocomotiveDef): number => {
      let n = 0;
      while (n < 200 && speeds(l, n + 1).hill >= 0.5) n++;
      return n;
    };
    const freight = [
      "mogul-2-6-0",
      "consolidation-2-8-0",
      "mikado-2-8-2",
      "articulated-4-8-8-4",
    ].map((id) => locomotiveById(id)!);
    const lens = freight.map(useful);
    for (let i = 1; i < lens.length; i++) expect(lens[i]!).toBeGreaterThan(lens[i - 1]!);
    // the cap is only the real limit: a Mogul's useful train is shorter than its cap, an Articulated's is not
    expect(lens[0]!).toBeLessThan(freight[0]!.maxCars);
  });

  it("a freight crew does not grow with the length of the train past a conductor and three brakemen", () => {
    const big = locomotiveById("articulated-4-8-8-4")!;
    expect(trainCrewSize(big, 16)).toBe(trainCrewSize(big, 60));
    expect(trainCrewSize(big, 60)).toBe(trainCrewSize(big, 22));
    expect(trainCrewSize(big, 8)).toBeLessThan(trainCrewSize(big, 60));
  });
});
