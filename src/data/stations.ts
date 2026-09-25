/** Station types (SPEC §6.1). Balance numbers only — logic lives in src/sim/stations. */

export const STATION_TYPES = ["depot", "station", "terminal"] as const;

export type StationType = (typeof STATION_TYPES)[number];

export interface StationTypeDef {
  id: StationType;
  name: string;
  /** Catchment radius in tiles (Chebyshev/square) — depot 1 (3×3), station 2 (5×5), terminal 3 (7×7). */
  catchmentRadius: number;
  maxTrainLength: number;
  storagePerCargo: number;
  cost: number;
  monthlyMaintenance: number;
  /** Trains that can be docked (loading) at once (SPEC §7.5) — this is what lets a station act as
   * a passing loop on a single-track line. See src/data/trains.ts `STATION_TRAIN_CAPACITY`. */
  trainCapacity: number;
  /** Loading/unloading time multiplier (SPEC Phase 7: "time cost (station type...)") — bigger
   * stations have more platforms/staff and handle cars faster. Multiplies
   * `TICKS_PER_CAR_HANDLED` (src/data/trains.ts); lower is faster. */
  loadSpeedMult: number;
}

export const STATION_TYPE_DEFS: Record<StationType, StationTypeDef> = {
  depot: {
    id: "depot",
    name: "Depot",
    catchmentRadius: 1,
    maxTrainLength: 6,
    storagePerCargo: 40,
    cost: 15_000,
    monthlyMaintenance: 100,
    trainCapacity: 1,
    loadSpeedMult: 1.0,
  },
  station: {
    id: "station",
    name: "Station",
    catchmentRadius: 2,
    maxTrainLength: 10,
    storagePerCargo: 80,
    cost: 40_000,
    monthlyMaintenance: 250,
    trainCapacity: 2,
    loadSpeedMult: 0.85,
  },
  terminal: {
    id: "terminal",
    name: "Terminal",
    catchmentRadius: 3,
    maxTrainLength: 16,
    storagePerCargo: 150,
    cost: 100_000,
    monthlyMaintenance: 600,
    trainCapacity: 4,
    loadSpeedMult: 0.7,
  },
};

/** Upgrade order Depot → Station → Terminal (SPEC §6.1). */
export const STATION_UPGRADE_ORDER: readonly StationType[] = ["depot", "station", "terminal"];

/** Cargo acceptance threshold to "accept" a cargo at a station (SPEC §6.3: "like RRT"). */
export const STATION_ACCEPTANCE_THRESHOLD = 8;

/** Water Tower improvement (SPEC §6.2): steam era, refills steam locomotives stopping here. The
 * rest of §6.2's improvement roster (Post Office, Hotel, Warehouse, ...) is Phase 9's job — this
 * one is pulled forward because the steam speed-penalty rule (SPEC §7.6-adjacent, "water towers")
 * is explicitly in Phase 8's scope. */
export const WATER_TOWER_COST = 8_000;
