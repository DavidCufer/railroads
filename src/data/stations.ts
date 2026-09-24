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
  },
  station: {
    id: "station",
    name: "Station",
    catchmentRadius: 2,
    maxTrainLength: 10,
    storagePerCargo: 80,
    cost: 40_000,
    monthlyMaintenance: 250,
  },
  terminal: {
    id: "terminal",
    name: "Terminal",
    catchmentRadius: 3,
    maxTrainLength: 16,
    storagePerCargo: 150,
    cost: 100_000,
    monthlyMaintenance: 600,
  },
};

/** Upgrade order Depot → Station → Terminal (SPEC §6.1). */
export const STATION_UPGRADE_ORDER: readonly StationType[] = ["depot", "station", "terminal"];

/** Cargo acceptance threshold to "accept" a cargo at a station (SPEC §6.3: "like RRT"). */
export const STATION_ACCEPTANCE_THRESHOLD = 8;
