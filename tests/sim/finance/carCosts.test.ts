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
});
