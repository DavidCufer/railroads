/** Phase 56 item 4: what a player can work out before buying an engine. Payback years of one passenger train on a line
 * of `distanceTiles` tiles, from the game's own cost functions and the speed model: price over (fares less running costs).
 *
 * - Speed: top speed, cut by the tractive-effort model (`computeTargetSpeed`: power over train weight), times
 *   `AVERAGE_SPEED_SHARE`; trip = running time + a dwell at each end + the turn.
 * - Fares: demand is sized for the era's typical train (`eraReferenceTilesPerDay`; the consist is the one the line's towns
 *   can fill at that speed), so legs beyond what that train would run carry nobody: legs a year = min(own, reference).
 *   Each leg earns a car-load of fares at `FILL` full (`computeRevenue`, the sim's own fare).
 * - Costs: the locomotive's yearly upkeep, fuel and repairs per tile run, crew wages, the cars' upkeep and the track wear
 *   (routine and renewal) the train causes, all from src/sim/finance/costs.ts.
 * Used by the good bot (goodPlayer.ts) to pick an engine per line; checked against the fixtures in PROGRESS Phase 56. */
import { calendarFromTicks } from "../../src/sim/time";
import { CARGO, passengerSeatsIn } from "../../src/data/cargo";
import {
  eraReferenceTilesPerDay,
  fuelEraScale,
  PARTY_SIZE,
  priceIndex,
} from "../../src/data/economy";
import {
  KMH_PER_TILE_PER_DAY,
  LOCO_WEIGHT_UNITS,
  CAR_WEIGHT_EMPTY,
  CAR_WEIGHT_LOADED,
  MIN_LOADING_TICKS,
  TICKS_PER_CAR_HANDLED,
  turnaroundTicks,
  type LocomotiveDef,
} from "../../src/data/trains";
import { computeBuyTrainPlan } from "../../src/sim/commands";
import { computeRevenue } from "../../src/sim/trains/loading";
import { AVERAGE_SPEED_SHARE } from "../../src/sim/trains/headway";
import { newCar } from "../../src/sim/trains/capacity";
import {
  carsUpkeepPerYear,
  fuelUnitsPerTile,
  locoRunningCostPerYear,
  repairCostPerUnit,
  repairUnitsPerTile,
  trainWagesPerYear,
  wearCostPerUnit,
  wearUnitsPerTile,
} from "../../src/sim/finance/costs";
import { DAYS_PER_YEAR } from "../../src/sim/time";
import type { GameState } from "../../src/sim/state";

/** Share of the seats a train carries on a leg (the fixtures measured 75-97 % loads). */
const FILL = 0.8;

export interface Estimate {
  price: number;
  revenue: number;
  costs: number;
  profit: number;
  payback: number;
}

export function estimatePayback(
  state: GameState,
  loco: LocomotiveDef,
  nCars: number,
  distanceTiles: number,
): Estimate {
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const cars = Array.from({ length: nCars }, () => {
    const c = newCar("passengers", year);
    c.loadedUnits = FILL * (c.seats ?? CARGO.passengers.capacity / PARTY_SIZE);
    return c;
  });
  const price = computeBuyTrainPlan(
    state,
    loco.id,
    cars.map(() => "passengers" as const),
  ).cost;
  const weight =
    LOCO_WEIGHT_UNITS + nCars * (CAR_WEIGHT_EMPTY + FILL * (CAR_WEIGHT_LOADED - CAR_WEIGHT_EMPTY));
  const kmh = loco.maxSpeedKmh * Math.min(1, loco.power / weight);
  const tilesPerDay = (kmh * AVERAGE_SPEED_SHARE) / KMH_PER_TILE_PER_DAY;
  const dwellDays = Math.max(MIN_LOADING_TICKS, nCars * 2 * TICKS_PER_CAR_HANDLED) / 24;
  const turnDays = turnaroundTicks(loco) / 24;
  const cycle = (tpd: number): number => (2 * distanceTiles) / tpd + 2 * dwellDays + turnDays;
  const ownLegs = (2 * DAYS_PER_YEAR) / cycle(tilesPerDay);
  const refLegs = (2 * DAYS_PER_YEAR) / cycle(eraReferenceTilesPerDay(year));
  const legs = Math.min(ownLegs, refLegs);
  const legDays = distanceTiles / tilesPerDay;
  const fullCarFare = computeRevenue(state, "passengers", distanceTiles, legDays, loco.maxSpeedKmh);
  const seatsPeople = passengerSeatsIn(year);
  const revenue = legs * nCars * FILL * fullCarFare * (seatsPeople / CARGO.passengers.capacity);
  const tilesRun = ownLegs * distanceTiles;
  const costs =
    locoRunningCostPerYear(loco, 0, year) +
    carsUpkeepPerYear(cars, year) +
    trainWagesPerYear(loco, cars, year) +
    tilesRun *
      (fuelUnitsPerTile(loco, cars) * fuelEraScale(year) * priceIndex(year) +
        repairUnitsPerTile(loco) * repairCostPerUnit(loco, 0, year) +
        wearUnitsPerTile(loco, cars, kmh * AVERAGE_SPEED_SHARE) * wearCostPerUnit(year));
  const profit = revenue - costs;
  return { price, revenue, costs, profit, payback: profit > 0 ? price / profit : Infinity };
}
