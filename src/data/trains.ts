/** Locomotive roster and train physics/balance constants (SPEC §7.1, §7.4, §7.5, §7.7).
 * Logic lives in src/sim/trains. */

export type LocomotiveType = "steam" | "diesel" | "electric";
export type WeightClass = "light" | "medium" | "heavy";

export interface LocomotiveDef {
  id: string;
  name: string;
  type: LocomotiveType;
  introYear: number;
  maxSpeedKmh: number;
  power: number;
  maxCars: number;
  weightClass: WeightClass;
  /** 1 (worst) – 5 (best). */
  reliability: number;
  cost: number;
  maintenancePerYear: number;
  /** High-Speed Trainset (SPEC §7.7): passenger & mail cars only. */
  passengerMailOnly?: boolean;
}

/** SPEC §7.7 roster. Names are generic wheel arrangements/descriptions, not trademarks. */
export const LOCOMOTIVES: readonly LocomotiveDef[] = [
  {
    id: "grasshopper-0-4-0",
    name: "Grasshopper 0-4-0",
    type: "steam",
    introYear: 1830,
    maxSpeedKmh: 25,
    power: 2,
    maxCars: 3,
    weightClass: "light",
    reliability: 2,
    cost: 20_000,
    maintenancePerYear: 2_000,
  },
  {
    id: "planet-2-2-0",
    name: "Planet 2-2-0",
    type: "steam",
    introYear: 1832,
    maxSpeedKmh: 35,
    power: 3,
    maxCars: 4,
    weightClass: "light",
    reliability: 2,
    cost: 28_000,
    maintenancePerYear: 2_500,
  },
  {
    id: "norris-4-2-0",
    name: "Norris 4-2-0",
    type: "steam",
    introYear: 1838,
    maxSpeedKmh: 45,
    power: 4,
    maxCars: 5,
    weightClass: "light",
    reliability: 3,
    cost: 34_000,
    maintenancePerYear: 3_000,
  },
  {
    id: "american-4-4-0",
    name: "American 4-4-0",
    type: "steam",
    introYear: 1848,
    maxSpeedKmh: 60,
    power: 6,
    maxCars: 6,
    weightClass: "medium",
    reliability: 3,
    cost: 45_000,
    maintenancePerYear: 4_000,
  },
  {
    id: "mogul-2-6-0",
    name: "Mogul 2-6-0",
    type: "steam",
    introYear: 1862,
    maxSpeedKmh: 55,
    power: 9,
    maxCars: 9,
    weightClass: "medium",
    reliability: 3,
    cost: 55_000,
    maintenancePerYear: 5_000,
  },
  {
    id: "consolidation-2-8-0",
    name: "Consolidation 2-8-0",
    type: "steam",
    introYear: 1872,
    maxSpeedKmh: 50,
    power: 12,
    maxCars: 12,
    weightClass: "heavy",
    reliability: 3,
    cost: 70_000,
    maintenancePerYear: 6_000,
  },
  {
    id: "ten-wheeler-4-6-0",
    name: "Ten-Wheeler 4-6-0",
    type: "steam",
    introYear: 1880,
    maxSpeedKmh: 75,
    power: 9,
    maxCars: 8,
    weightClass: "medium",
    reliability: 4,
    cost: 70_000,
    maintenancePerYear: 6_000,
  },
  {
    id: "atlantic-4-4-2",
    name: "Atlantic 4-4-2",
    type: "steam",
    introYear: 1895,
    maxSpeedKmh: 100,
    power: 8,
    maxCars: 6,
    weightClass: "medium",
    reliability: 4,
    cost: 85_000,
    maintenancePerYear: 7_000,
  },
  {
    id: "pacific-4-6-2",
    name: "Pacific 4-6-2",
    type: "steam",
    introYear: 1905,
    maxSpeedKmh: 115,
    power: 11,
    maxCars: 9,
    weightClass: "heavy",
    reliability: 4,
    cost: 110_000,
    maintenancePerYear: 9_000,
  },
  {
    id: "mikado-2-8-2",
    name: "Mikado 2-8-2",
    type: "steam",
    introYear: 1912,
    maxSpeedKmh: 75,
    power: 16,
    maxCars: 14,
    weightClass: "heavy",
    reliability: 4,
    cost: 120_000,
    maintenancePerYear: 10_000,
  },
  {
    id: "hudson-4-6-4",
    name: "Hudson 4-6-4",
    type: "steam",
    introYear: 1927,
    maxSpeedKmh: 135,
    power: 14,
    maxCars: 10,
    weightClass: "heavy",
    reliability: 4,
    cost: 150_000,
    maintenancePerYear: 12_000,
  },
  {
    id: "articulated-4-8-8-4",
    name: "Articulated 4-8-8-4",
    type: "steam",
    introYear: 1941,
    maxSpeedKmh: 95,
    power: 26,
    maxCars: 22,
    weightClass: "heavy",
    reliability: 3,
    cost: 250_000,
    maintenancePerYear: 22_000,
  },
  {
    id: "early-electric",
    name: "Early Electric",
    type: "electric",
    introYear: 1905,
    maxSpeedKmh: 90,
    power: 12,
    maxCars: 9,
    weightClass: "medium",
    reliability: 3,
    cost: 120_000,
    maintenancePerYear: 6_000,
  },
  {
    id: "streamliner-diesel",
    name: "Streamliner Diesel",
    type: "diesel",
    introYear: 1934,
    maxSpeedKmh: 145,
    power: 12,
    maxCars: 8,
    weightClass: "medium",
    reliability: 3,
    cost: 180_000,
    maintenancePerYear: 12_000,
  },
  {
    id: "e-unit-electric",
    name: "E-Unit Electric",
    type: "electric",
    introYear: 1928,
    maxSpeedKmh: 160,
    power: 18,
    maxCars: 12,
    weightClass: "heavy",
    reliability: 4,
    cost: 200_000,
    maintenancePerYear: 10_000,
  },
  {
    id: "cab-unit-diesel",
    name: "Cab Unit Diesel",
    type: "diesel",
    introYear: 1939,
    maxSpeedKmh: 120,
    power: 16,
    maxCars: 14,
    weightClass: "medium",
    reliability: 4,
    cost: 170_000,
    maintenancePerYear: 11_000,
  },
  {
    id: "road-switcher-diesel",
    name: "Road Switcher Diesel",
    type: "diesel",
    introYear: 1949,
    maxSpeedKmh: 105,
    power: 19,
    maxCars: 16,
    weightClass: "medium",
    reliability: 5,
    cost: 160_000,
    maintenancePerYear: 9_000,
  },
  {
    id: "modern-electric",
    name: "Modern Electric",
    type: "electric",
    introYear: 1960,
    maxSpeedKmh: 180,
    power: 24,
    maxCars: 16,
    weightClass: "heavy",
    reliability: 5,
    cost: 300_000,
    maintenancePerYear: 12_000,
  },
  {
    id: "high-horsepower-diesel",
    name: "High-Horsepower Diesel",
    type: "diesel",
    introYear: 1963,
    maxSpeedKmh: 125,
    power: 26,
    maxCars: 20,
    weightClass: "heavy",
    reliability: 5,
    cost: 280_000,
    maintenancePerYear: 15_000,
  },
  {
    id: "heavy-diesel",
    name: "Heavy Diesel",
    type: "diesel",
    introYear: 1976,
    maxSpeedKmh: 130,
    power: 32,
    maxCars: 24,
    weightClass: "heavy",
    reliability: 5,
    cost: 350_000,
    maintenancePerYear: 17_000,
  },
  {
    id: "high-speed-trainset",
    name: "High-Speed Trainset",
    type: "electric",
    introYear: 1981,
    maxSpeedKmh: 270,
    power: 16,
    maxCars: 10,
    weightClass: "medium",
    reliability: 5,
    cost: 600_000,
    maintenancePerYear: 25_000,
    passengerMailOnly: true,
  },
  {
    id: "heavy-freight-electric",
    name: "Heavy Freight Electric",
    type: "electric",
    introYear: 1994,
    maxSpeedKmh: 140,
    power: 40,
    maxCars: 28,
    weightClass: "heavy",
    reliability: 5,
    cost: 500_000,
    maintenancePerYear: 20_000,
  },
];

export function locomotivesAvailableIn(year: number): LocomotiveDef[] {
  return LOCOMOTIVES.filter((l) => l.introYear <= year);
}

export function locomotiveById(id: string): LocomotiveDef | undefined {
  return LOCOMOTIVES.find((l) => l.id === id);
}

// --- Movement scale (SPEC §7.4, revised in the Phase 5 review) -----------------------------------

/** A train moves `speedKmh / KMH_PER_TILE_PER_DAY` tiles per in-game day. */
export const KMH_PER_TILE_PER_DAY = 30;

/** `speedKmh / TICKS_PER_TILE_DIVISOR` tiles per tick (1 tick = 1 in-game hour, 24/day). */
export const TICKS_PER_TILE_DIVISOR = KMH_PER_TILE_PER_DAY * 24;

// --- Speed model (SPEC §7.4) -----------------------------------------------------------------

export const LOCO_WEIGHT_UNITS = 2;
export const CAR_WEIGHT_LOADED = 1;
export const CAR_WEIGHT_EMPTY = 0.4;
export const GRADE_EFFORT_FACTOR = 0.6;
export const MIN_SPEED_FACTOR = 0.15;
export const MAX_SPEED_FACTOR = 1.0;
/** Max speed through a 45° turn node (SPEC §7.4), as a fraction of the loco's own maxSpeed. */
export const CURVE_SPEED_FACTOR = 0.7;

// --- Blocks & signaling (SPEC §7.5) -------------------------------------------------------------

export const MIN_SPACING_TILES_DOUBLE_TRACK = 2;
export const DEADLOCK_REROUTE_DAYS = 5;
export const DEADLOCK_STUCK_DAYS = 10;
/** Extra tile-distance cost added to a block a train has been stuck waiting on, when it retries
 * routing after `DEADLOCK_REROUTE_DAYS` — large enough that any real alternate path wins. */
export const DEADLOCK_BLOCK_PENALTY = 1_000;
/** A train stuck at a non-target dead end reverses after this many in-game hours (SPEC §7.3). */
export const DEAD_END_REVERSE_HOURS = 6;

// --- Composition / rendering geometry (SPEC §7.1) -----------------------------------------------

export const CAR_LENGTH_TILES = 0.25;
export const LOCO_LENGTH_TILES = 0.5;

// --- Orders / loading placeholder (real cargo flow is Phase 7) ----------------------------------

/** Fixed placeholder dwell time at a station stop, in ticks — Phase 7 replaces this with real
 * load/unload time based on station type, train length and cargo. */
export const TRAIN_LOADING_TICKS = 12;

export const SELL_REFUND_FRACTION = 0.5;
