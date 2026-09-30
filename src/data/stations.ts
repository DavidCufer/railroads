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
  /** Slots for trains inside this station at once — counting trains actually stopped/loading here
   * plus trains that have already reserved a section ending here (SPEC §7.5, revised after
   * play-testing: "the minimum is 2, so every station can act as a passing loop"). */
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
    trainCapacity: 2,
    loadSpeedMult: 1.0,
  },
  station: {
    id: "station",
    name: "Station",
    catchmentRadius: 2,
    maxTrainLength: 10,
    storagePerCargo: 80,
    cost: 40_000,
    trainCapacity: 3,
    loadSpeedMult: 0.85,
  },
  terminal: {
    id: "terminal",
    name: "Terminal",
    catchmentRadius: 3,
    maxTrainLength: 16,
    storagePerCargo: 150,
    cost: 100_000,
    trainCapacity: 5,
    loadSpeedMult: 0.7,
  },
};

/** Upgrade order Depot → Station → Terminal (SPEC §6.1). */
export const STATION_UPGRADE_ORDER: readonly StationType[] = ["depot", "station", "terminal"];

/** Cargo acceptance threshold to "accept" a cargo at a station (SPEC §6.3: "like RRT"). */
export const STATION_ACCEPTANCE_THRESHOLD = 8;

/** Water Tower improvement (SPEC §6.2): steam era, refills steam locomotives stopping here. Built
 * via `buildWaterTower`/`hasWaterTower` (Phase 8) rather than the generic `improvements` list below
 * — it predates this phase and several call sites already key off that boolean directly. */
export const WATER_TOWER_COST = 8_000;

/** Engine Shed (SPEC §6.2, PLAN Phase 28A Bug 6): the company's first station gets one free; any station can
 * build another. A shed lets the player buy trains there, services trains that stop (breakdown chance −50 %)
 * and is a repair-crew base — the nearest shed sends the crew, so sheds near the far ends of a network make
 * call-outs short and cheap. Era-scaled like every build cost. */
export const ENGINE_SHED_COST = 30_000;

/** The rest of SPEC §6.2's improvement roster (Water Tower and Engine Shed keep their own bespoke
 * fields/commands from earlier phases — see `Station.hasEngineShed`/`hasWaterTower`). Each is
 * buildable once per station via the generic `buildImprovement` command (src/sim/commands.ts). */
export const STATION_IMPROVEMENT_TYPES = [
  "postOffice",
  "hotel",
  "warehouse",
  "coldStorage",
  "freightYard",
  "livestockPens",
] as const;

export type StationImprovementType = (typeof STATION_IMPROVEMENT_TYPES)[number];

export interface StationImprovementDef {
  id: StationImprovementType;
  name: string;
  cost: number;
  /** Year this improvement becomes buildable — undefined means "always" (SPEC §6.2). */
  availableYear?: number;
  description: string;
}

export const STATION_IMPROVEMENTS: Record<StationImprovementType, StationImprovementDef> = {
  postOffice: {
    id: "postOffice",
    name: "Post Office",
    cost: 25_000,
    description: "Mail supply +50%; mail revenue +25% for mail loaded here.",
  },
  hotel: {
    id: "hotel",
    name: "Hotel",
    cost: 50_000,
    description:
      "Passenger revenue +25% for passengers delivered here; +20% city growth contribution.",
  },
  warehouse: {
    id: "warehouse",
    name: "Warehouse",
    cost: 30_000,
    description: "Storage ×2; waiting cargo doesn't decay.",
  },
  coldStorage: {
    id: "coldStorage",
    name: "Cold Storage",
    cost: 40_000,
    availableYear: 1880,
    description: "Food/livestock waiting here don't decay; their revenue +15% when loaded here.",
  },
  freightYard: {
    id: "freightYard",
    name: "Freight Yard",
    cost: 60_000,
    availableYear: 1870,
    description: "Loading/unloading 2× faster.",
  },
  livestockPens: {
    id: "livestockPens",
    name: "Livestock Pens",
    cost: 12_000,
    description: "Required to load livestock at this station.",
  },
};

/** Mail supply multiplier from a Post Office (SPEC §6.2). */
export const POST_OFFICE_MAIL_SUPPLY_MULT = 1.5;
/** Revenue multiplier for mail loaded at a Post Office station. */
export const POST_OFFICE_MAIL_REVENUE_MULT = 1.25;
/** Revenue multiplier for passengers delivered (unloaded) at a Hotel station. */
export const HOTEL_PASSENGER_REVENUE_MULT = 1.25;
/** City growth contribution multiplier for passengers/mail delivered at a Hotel station. */
export const HOTEL_GROWTH_CONTRIBUTION_MULT = 1.2;
/** Storage capacity multiplier from a Warehouse. */
export const WAREHOUSE_STORAGE_MULT = 2;
/** Revenue multiplier for food/livestock loaded at a Cold Storage station. */
export const COLD_STORAGE_REVENUE_MULT = 1.15;
/** Loading/unloading speed multiplier from a Freight Yard (applied on top of station-type mult). */
export const FREIGHT_YARD_LOAD_SPEED_MULT = 0.5;
