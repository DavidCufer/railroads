/** Phase 53C/54: what a car really holds. A passenger car keeps the seats of the year it was bought (`TrainCar.seats`,
 * in game passengers: seats / `PARTY_SIZE`); a car without the field holds the cargo's base capacity (a passenger car
 * 40 seats / `PARTY_SIZE`). Pure. */
import { CARGO, passengerSeatsIn, type CargoType } from "../../data/cargo";
import { PARTY_SIZE } from "../../data/economy";
import type { TrainCar } from "./types";

export function carCapacity(car: Pick<TrainCar, "cargoType" | "seats">): number {
  if (car.seats !== undefined) return car.seats;
  return CARGO[car.cargoType].capacity / (car.cargoType === "passengers" ? PARTY_SIZE : 1);
}

/** Seats (or capacity) of a car of `cargo` bought in `year`, in people for a passenger car (the price scale). */
export function newCarCapacity(cargo: CargoType, year: number): number {
  return cargo === "passengers" ? passengerSeatsIn(year) : CARGO[cargo].capacity;
}

/** A new empty car bought in `year`. */
export function newCar(cargo: CargoType, year: number): TrainCar {
  if (cargo !== "passengers") return { cargoType: cargo, loadedUnits: 0 };
  return { cargoType: cargo, loadedUnits: 0, seats: passengerSeatsIn(year) / PARTY_SIZE };
}

/** Price of a car at 1830 prices before inflation: the cargo's `carCost`, scaled by seats (people) for a passenger car. */
export function carPrice(cargo: CargoType, capacity: number): number {
  return CARGO[cargo].carCost * (capacity / CARGO[cargo].capacity);
}

export function carPriceOf(car: Pick<TrainCar, "cargoType" | "seats">): number {
  return carPrice(
    car.cargoType,
    carCapacity(car) * (car.cargoType === "passengers" ? PARTY_SIZE : 1),
  );
}
