/** Effect helpers for SPEC §6.2's station improvement roster (Phase 9) — small enough to keep out
 * of src/sim/stations/economy.ts and src/sim/trains/loading.ts's own doc comments. Engine Shed and
 * Water Tower predate this file and keep their own bespoke boolean fields/checks. */
import {
  FREIGHT_YARD_LOAD_SPEED_MULT,
  STATION_TYPE_DEFS,
  WAREHOUSE_STORAGE_MULT,
  type StationImprovementType,
} from "../../data/stations";
import { cargoUnitFactor, givesUpWaiting, type CargoType } from "../../data/cargo";
import type { Station } from "./types";

export function hasImprovement(station: Station, type: StationImprovementType): boolean {
  return station.improvements.includes(type);
}

/** Per-cargo storage cap at `station`, doubled by a Warehouse (SPEC §6.2). `STATION_TYPE_DEFS`'s
 * `storagePerCargo` is denominated in the old cargo-agnostic 20-unit carload (PLAN Phase 16); scaled
 * by `cargoUnitFactor` so every cargo still gets the same *carload* capacity regardless of its real
 * per-car unit count. `cargo` is optional only for the rare caller that wants the un-scaled base
 * figure (e.g. comparing before/after a Warehouse, independent of any specific cargo). */
export function stationStorageCap(station: Station, cargo?: CargoType): number {
  const base = STATION_TYPE_DEFS[station.type].storagePerCargo;
  // Phase 30A: a Warehouse stores freight only. Passengers and mail have no storage cap at all (they give
  // up waiting instead, see `WAITING_PATIENCE_DAYS`); the figure returned for them is only the station
  // type's nominal pile size, which the station panel uses to scale its bar.
  const withWarehouse =
    hasImprovement(station, "warehouse") && !(cargo && givesUpWaiting(cargo))
      ? base * WAREHOUSE_STORAGE_MULT
      : base;
  return cargo ? withWarehouse * cargoUnitFactor(cargo) : withWarehouse;
}

/** Room for transfer stock at a Warehouse hub — any cargo, ×`WAREHOUSE_STORAGE_MULT` (a hub holds goods in
 * transit, not people waiting). */
export function transferStorageCap(station: Station, cargo: CargoType): number {
  return (
    STATION_TYPE_DEFS[station.type].storagePerCargo *
    WAREHOUSE_STORAGE_MULT *
    cargoUnitFactor(cargo)
  );
}

/** True if `cargo` waiting at `station` is exempt from waiting-cargo decay (SPEC §6.2): a Warehouse
 * exempts freight (never passengers or mail, who give up regardless), Cold Storage food/livestock. */
export function cargoDecayExempt(station: Station, cargo: CargoType): boolean {
  if (givesUpWaiting(cargo)) return false;
  if (hasImprovement(station, "warehouse")) return true;
  if (hasImprovement(station, "coldStorage") && (cargo === "food" || cargo === "livestock")) {
    return true;
  }
  return false;
}

/** Loading/unloading dwell-time multiplier at `station` (SPEC §6.2: Freight Yard halves it, on top
 * of the station type's own `loadSpeedMult`). */
export function stationLoadSpeedMult(station: Station): number {
  const base = STATION_TYPE_DEFS[station.type].loadSpeedMult;
  return hasImprovement(station, "freightYard") ? base * FREIGHT_YARD_LOAD_SPEED_MULT : base;
}
