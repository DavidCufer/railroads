/** What things cost to keep running (PLAN Phase 28A, SPEC §9 "Economic model v2"): pure functions of the year
 * and the thing itself, used by the monthly ledger and by the panels that show the player each cost.
 * The tables live in src/data/economy.ts. */
import { KM_PER_TILE } from "../../data/scale";
import {
  AXLE_LOAD_FACTOR,
  CAR_AXLE_FACTOR,
  CAR_EMPTY_TONS,
  CAR_LOAD_TONS,
  LOCO_TONS,
  RUNNING_COST_SHARE,
  STATION_STAFF,
  STATION_UPKEEP_MONTHLY,
  TRACK_LABOUR_SHARE,
  WAGE_1830,
  WEAR_COST_PER_UNIT,
  WEAR_LABOUR_SHARE,
  WEAR_SPEED_REF_KMH,
  competitionLoss,
  priceIndex,
  trainCrewSize,
  wageIndex,
} from "../../data/economy";
import {
  MAINTENANCE_BRIDGE,
  MAINTENANCE_DOUBLE,
  MAINTENANCE_ELECTRIFIED_SURCHARGE,
  MAINTENANCE_SINGLE,
} from "../../data/track";
import {
  OBSOLESCENCE_AGE_YEARS,
  OBSOLESCENCE_MAINTENANCE_MULT,
  STEAM_MAINTENANCE_SURCHARGE_MULT,
  STEAM_MAINTENANCE_SURCHARGE_YEAR,
  type LocomotiveDef,
} from "../../data/trains";
import { CARGO } from "../../data/cargo";
import type { StationType } from "../../data/stations";
import type { TrainCar } from "../trains/types";
import type { TrackEdge } from "../track/types";

/** Annual pay of one railwayman in `year`. */
export function annualWage(year: number): number {
  return WAGE_1830 * wageIndex(year);
}

/** Maintenance multiplier from obsolescence (SPEC §7.6): +50% once a model is more than 25 years past its
 * introduction, and steam pays +50% after 1955 regardless of age — the *higher* of the two applies. */
export function maintenanceMultiplier(loco: LocomotiveDef, ageYears: number, year: number): number {
  let mult = 1;
  if (ageYears > OBSOLESCENCE_AGE_YEARS) mult = Math.max(mult, OBSOLESCENCE_MAINTENANCE_MULT);
  if (loco.type === "steam" && year > STEAM_MAINTENANCE_SURCHARGE_YEAR) {
    mult = Math.max(mult, STEAM_MAINTENANCE_SURCHARGE_MULT);
  }
  return mult;
}

/** Fuel, oil, water and depot servicing for one locomotive, per year (crew is paid separately). */
export function locoRunningCostPerYear(
  loco: LocomotiveDef,
  ageYears: number,
  year: number,
): number {
  return (
    loco.maintenancePerYear *
    RUNNING_COST_SHARE *
    maintenanceMultiplier(loco, ageYears, year) *
    priceIndex(year)
  );
}

/** Wages of the train's crew (footplate + guards) per year. */
export function trainWagesPerYear(loco: LocomotiveDef, cars: number, year: number): number {
  return trainCrewSize(loco, cars) * annualWage(year);
}

/** One station's monthly bill: building upkeep at general prices plus its staff at wages. */
export function stationMonthlyCost(
  type: StationType,
  year: number,
): { upkeep: number; staff: number; total: number } {
  const upkeep = STATION_UPKEEP_MONTHLY[type] * priceIndex(year);
  const staff = (STATION_STAFF[type] * annualWage(year)) / 12;
  return { upkeep, staff, total: upkeep + staff };
}

/** One track edge's fixed monthly upkeep: gangers (wages) and materials (prices), by the edge's kind. */
export function trackEdgeMonthlyCost(edge: TrackEdge, year: number): number {
  let base = edge.double ? MAINTENANCE_DOUBLE : MAINTENANCE_SINGLE;
  if (edge.electrified) base += MAINTENANCE_ELECTRIFIED_SURCHARGE;
  if (edge.bridge) base += MAINTENANCE_BRIDGE[edge.bridge];
  return (
    base * (TRACK_LABOUR_SHARE * wageIndex(year) + (1 - TRACK_LABOUR_SHARE) * priceIndex(year))
  );
}

/** Wear units one tile of running inflicts on the track: (engine tonnes × axle load + car tonnes) × speed factor,
 * per 100 t. A light 1830s train barely marks the rail; a long heavy fast one wears it out. */
export function wearUnitsPerTile(
  loco: LocomotiveDef,
  cars: readonly TrainCar[],
  speedKmh: number,
): number {
  let carTons = 0;
  for (const c of cars)
    carTons += CAR_EMPTY_TONS + CAR_LOAD_TONS * (c.loadedUnits / CARGO[c.cargoType].capacity);
  const tons =
    LOCO_TONS[loco.weightClass] * AXLE_LOAD_FACTOR[loco.weightClass] + carTons * CAR_AXLE_FACTOR;
  const speed = speedKmh / WEAR_SPEED_REF_KMH;
  return (tons / 100) * (1 + speed * speed);
}

/** Money per wear unit in `year`: rail and sleepers follow prices, renewal gangs follow wages. */
export function wearCostPerUnit(year: number): number {
  return (
    WEAR_COST_PER_UNIT *
    (WEAR_LABOUR_SHARE * wageIndex(year) + (1 - WEAR_LABOUR_SHARE) * priceIndex(year))
  );
}

/** The share of this train's fares competition takes at the moment (0–1), judged on the cargo most of its cars
 * carry and the average distance between its stops; 0 when it has no route yet. Used by the train panel. */
export function trainCompetition(
  loco: LocomotiveDef,
  train: { cars: readonly TrainCar[]; orders: readonly { stationId: number }[] },
  stations: readonly { id: number; tile: number }[],
  mapWidth: number,
  year: number,
): number {
  if (train.cars.length === 0 || train.orders.length < 2) return 0;
  const counts = new Map<TrainCar["cargoType"], number>();
  for (const c of train.cars) counts.set(c.cargoType, (counts.get(c.cargoType) ?? 0) + 1);
  const cargo = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  let total = 0;
  let legs = 0;
  for (let i = 0; i < train.orders.length; i++) {
    const a = stations.find((s) => s.id === train.orders[i]!.stationId);
    const b = stations.find((s) => s.id === train.orders[(i + 1) % train.orders.length]!.stationId);
    if (!a || !b) continue;
    total += Math.hypot(
      (a.tile % mapWidth) - (b.tile % mapWidth),
      Math.floor(a.tile / mapWidth) - Math.floor(b.tile / mapWidth),
    );
    legs++;
  }
  if (legs === 0) return 0;
  return competitionLoss(year, cargo, (total / legs) * KM_PER_TILE, loco.maxSpeedKmh);
}
