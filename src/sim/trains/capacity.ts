/** Phase 53C: what a car really holds. A passenger car keeps the seats of the year it was bought (`TrainCar.seats`);
 * a car without the field (an older save, or another cargo) holds the cargo's base capacity. Pure. */
import { CARGO, passengerSeatsIn, type CargoType } from "../../data/cargo";
import type { TrainCar } from "./types";

export function carCapacity(car: Pick<TrainCar, "cargoType" | "seats">): number {
  return car.seats ?? CARGO[car.cargoType].capacity;
}

/** Seats (or capacity) of a car of `cargo` bought in `year`. */
export function newCarCapacity(cargo: CargoType, year: number): number {
  return cargo === "passengers" ? passengerSeatsIn(year) : CARGO[cargo].capacity;
}

/** A new empty car bought in `year`. */
export function newCar(cargo: CargoType, year: number, party = 1): TrainCar {
  if (cargo !== "passengers") return { cargoType: cargo, loadedUnits: 0 };
  // Exploration E1: with a party of `party` people per game passenger the car holds seats / party of them.
  return party === 1
    ? { cargoType: cargo, loadedUnits: 0, seats: passengerSeatsIn(year) }
    : { cargoType: cargo, loadedUnits: 0, seats: passengerSeatsIn(year) / party, party };
}

/** Price of a car at 1830 prices before inflation: the cargo's `carCost`, scaled by seats for a passenger car. */
export function carPrice(cargo: CargoType, capacity: number): number {
  return CARGO[cargo].carCost * (capacity / CARGO[cargo].capacity);
}

export function carPriceOf(car: Pick<TrainCar, "cargoType" | "seats" | "party">): number {
  return carPrice(car.cargoType, carCapacity(car) * (car.party ?? 1));
}
