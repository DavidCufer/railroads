/** Phase 36: passenger and mail cars cost ~3x a basic freight wagon and are dearer to keep up. */
import { describe, expect, it } from "vitest";
import { CARGO, carUpkeepRate } from "../../../src/data/cargo";
import { carsUpkeepPerYear } from "../../../src/sim/finance/costs";
import type { TrainCar } from "../../../src/sim/trains/types";

const car = (cargoType: TrainCar["cargoType"]): TrainCar =>
  ({ cargoType, loadedUnits: 0 }) as TrainCar;

describe("car prices and upkeep (Phase 36)", () => {
  it("a passenger car costs 3x a coal wagon, a mail car the same", () => {
    expect(CARGO.passengers.carCost).toBe(3 * CARGO.coal.carCost);
    expect(CARGO.mail.carCost).toBe(CARGO.passengers.carCost);
  });

  it("passenger and mail cars cost more per year to keep up than freight wagons", () => {
    expect(carUpkeepRate("passengers")).toBeGreaterThan(carUpkeepRate("coal"));
    expect(carsUpkeepPerYear([car("passengers")], 1830)).toBeGreaterThan(
      3 * carsUpkeepPerYear([car("coal")], 1830),
    );
    expect(carsUpkeepPerYear([car("mail")], 1830)).toBe(
      carsUpkeepPerYear([car("passengers")], 1830),
    );
  });

  it("upkeep adds up per car and follows prices over the years", () => {
    const two = carsUpkeepPerYear([car("coal"), car("coal")], 1830);
    expect(two).toBeCloseTo(2 * carsUpkeepPerYear([car("coal")], 1830), 6);
    expect(carsUpkeepPerYear([car("coal")], 1950)).toBeGreaterThan(
      carsUpkeepPerYear([car("coal")], 1830),
    );
  });

  it("secure cars (Phase 40) cost several wagons, hold little and are the dearest to keep up", () => {
    for (const cargo of ["silverBars", "enrichedUranium"] as const) {
      expect(CARGO[cargo].secure).toBe(true);
      expect(CARGO[cargo].carCost).toBeGreaterThanOrEqual(4 * CARGO.coal.carCost);
      expect(CARGO[cargo].carCost).toBeGreaterThan(CARGO.passengers.carCost);
      expect(CARGO[cargo].capacity).toBeLessThanOrEqual(CARGO.coal.capacity / 2);
      expect(carUpkeepRate(cargo)).toBeGreaterThan(carUpkeepRate("passengers"));
      // a yearly bill of at least ten times a wagon's
      expect(carsUpkeepPerYear([car(cargo)], 1900)).toBeGreaterThan(
        10 * carsUpkeepPerYear([car("coal")], 1900),
      );
    }
    // the ores ride in ordinary hoppers
    expect(CARGO.silverOre.carCost).toBe(CARGO.coal.carCost);
    expect(CARGO.silverOre.secure).toBeUndefined();
  });
});
