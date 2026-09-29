/** Locomotive roster and train physics/balance constants (SPEC §7.1, §7.4, §7.5, §7.7).
 * Logic lives in src/sim/trains. */

import { WORLD_SCALE } from "./scale";

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

/** `locomotivesAvailableIn`, further excluding steam once it's phased out (SPEC §7.6: "steam
 * models can't be bought after 1960") — what the Buy Train / Replace Locomotive pickers should
 * list, since every model on this list is actually purchasable at `year`. */
export function buyableLocomotivesIn(year: number): LocomotiveDef[] {
  return locomotivesAvailableIn(year).filter(
    (l) => l.type !== "steam" || year <= STEAM_PHASE_OUT_YEAR,
  );
}

export function locomotiveById(id: string): LocomotiveDef | undefined {
  return LOCOMOTIVES.find((l) => l.id === id);
}

// --- Movement scale (SPEC §7.4, revised in the Phase 5 review) -----------------------------------

/** A train moves `speedKmh / KMH_PER_TILE_PER_DAY` tiles per in-game day. */
export const KMH_PER_TILE_PER_DAY = 30 / WORLD_SCALE;

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

// --- Signaling (SPEC §7.5, rewritten after play-testing: station-to-station section reservation) -

/** Minimum gap (tiles) a same-direction follower keeps behind a leader in a shared block, on both
 * single and double track (SPEC §7.5: "any number of trains may be in a section heading the same
 * way... keep a 2-tile spacing and brake behind the leader"). */
export const MIN_SPACING_TILES = 2;

// --- Smooth following (Phase 24A) ---------------------------------------------------------------
/** Clear space (tiles) kept between a follower's nose and the tail of a same-direction leader in a
 * shared block. Measured to the leader's *tail* (not its head, as MIN_SPACING_TILES was), so long
 * consists never visually touch. */
export const FOLLOW_MIN_GAP_TILES = 1;
/** km/h of extra speed over the leader's per tile of gap beyond the minimum: the follower's target
 * speed is `leader + gain × (gap − min)`, so the gap closes exponentially (no overshoot as long as
 * gain < KMH_PER_TILE_PER_DAY × 24, the km/h a train covers a tile-per-tick at). */
export const FOLLOW_GAIN_KMH_PER_TILE = 60;
/** Speed change limits per tick (1 tick = 1 in-game hour) for every train: gentle acceleration, a
 * stronger brake. Also the braking rate the follower's stopping-distance cap assumes. */
export const TRAIN_ACCEL_KMH_PER_TICK = 15;
export const TRAIN_BRAKE_KMH_PER_TICK = 30;
/** Safety net (SPEC §7.5, revised after play-testing — was 5/10): a train that has waited this many
 * in-game days *at a station* (for a line/platform to clear) tries an alternate route; if still
 * blocked after `DEADLOCK_STUCK_DAYS` it gives up and shows ⚠. */
export const DEADLOCK_REROUTE_DAYS = 10;
export const DEADLOCK_STUCK_DAYS = 20;
/** Extra tile-distance cost added to a block a train has been stuck waiting on, when it retries
 * routing after `DEADLOCK_REROUTE_DAYS` — large enough that any real alternate path wins. */
/** A train that has waited this many hours for a single-track block makes newly departing
 * same-way trains hold back, so a steady stream in one direction cannot starve the other. */
export const SIGNAL_FAIRNESS_HOURS = 24;
export const DEADLOCK_BLOCK_PENALTY = 1_000;
/** A train stuck at a non-target dead end reverses after this many in-game hours (SPEC §7.3). */
export const DEAD_END_REVERSE_HOURS = 6;

// --- Composition / rendering geometry (SPEC §7.1; PLAN Phase 15: "~20% larger") ------------------

/** Also used by the signaling section-reservation math (src/sim/trains/movement.ts) as the
 * physical length a train's tail trails behind its head — not just a render sizing constant. */
export const CAR_LENGTH_TILES = 0.3;
export const LOCO_LENGTH_TILES = 0.6;

// --- Orders / loading (SPEC §7.2, §6.1 "load/unload 50% slower" overlength penalty) --------------

/** Base ticks (in-game hours) to load or unload one car, before station-type/overlength factors. */
export const TICKS_PER_CAR_HANDLED = 3;
/** Minimum dwell at any stop that isn't a pass-through, even with nothing to load/unload. */
export const MIN_LOADING_TICKS = 4;
/** SPEC §6.1: "Trains longer than the station max can still stop but load/unload 50% slower" —
 * i.e. handling each car takes 2× as long. */
export const OVERLENGTH_SLOWDOWN_MULT = 2;
/** Default cap on how many extra days a "Wait for full load" stop waits when the order doesn't set
 * its own `maxWaitDays` (SPEC §7.2 says the cap is optional but doesn't give a fallback). */
export const DEFAULT_FULL_LOAD_MAX_WAIT_DAYS = 14;

export const SELL_REFUND_FRACTION = 0.5;
/** "Edit cars" on an existing train (PLAN Phase 15): a car the edit removes refunds this fraction
 * of its era-adjusted price; a newly added car is charged in full. */
export const CONSIST_EDIT_REFUND_FRACTION = 0.5;

// --- Breakdowns & aging (SPEC §7.6) --------------------------------------------------------------

/** Base monthly breakdown chance by `reliability` (1 worst – 5 best): "0.5%, 1%, 2%, 4%, 7% for
 * reliability 5…1". */
export const BREAKDOWN_BASE_CHANCE_BY_RELIABILITY: Record<number, number> = {
  5: 0.005,
  4: 0.01,
  3: 0.02,
  2: 0.04,
  1: 0.07,
};
/** Chance multiplies by `(1 + age/20 years)`. */
export const BREAKDOWN_AGE_DIVISOR_YEARS = 20;
/** Chance ×0.5 if serviced at an Engine Shed within the last 60 days. */
export const BREAKDOWN_ENGINE_SHED_WINDOW_DAYS = 60;
export const BREAKDOWN_ENGINE_SHED_MULT = 0.5;
export const BREAKDOWN_REPAIR_MIN_DAYS = 2;
export const BREAKDOWN_REPAIR_MAX_DAYS = 5;
export const BREAKDOWN_REPAIR_COST = 5_000;

/** Once a model is > 25 years past its introduction, maintenance +50%. */
export const OBSOLESCENCE_AGE_YEARS = 25;
export const OBSOLESCENCE_MAINTENANCE_MULT = 1.5;
/** Steam maintenance +50% after this year, on top of (not stacked multiplicatively twice with) the
 * generic age-based obsolescence surcharge above — SPEC §7.6 lists them as two separate rules, so
 * a steam loco that's both >25 years old *and* it's past 1955 only ever pays the higher of the two
 * (see `maintenanceMultiplier` in src/sim/finance/ledger.ts). */
export const STEAM_MAINTENANCE_SURCHARGE_YEAR = 1955;
export const STEAM_MAINTENANCE_SURCHARGE_MULT = 1.5;
/** Steam locomotives can't be bought new after this year. */
export const STEAM_PHASE_OUT_YEAR = 1960;

/** Replace-locomotive trade-in (SPEC §7.6): 30% of the old loco's price, reduced 3%/year of age,
 * floor 10%. */
export const TRADE_IN_BASE_FRACTION = 0.3;
export const TRADE_IN_AGE_REDUCTION_PER_YEAR = 0.03;
export const TRADE_IN_MIN_FRACTION = 0.1;

// --- Water towers (SPEC §6.2) --------------------------------------------------------------------

/** Steam trains that go further than this many tiles without stopping at a Water Tower lose speed
 * (until their next refill) — diesel/electric ignore this entirely. */
export const WATER_TOWER_RANGE_TILES = 40 * WORLD_SCALE;
export const WATER_TOWER_SPEED_PENALTY = 0.2;

// --- "New!" badge (SPEC §7.7) --------------------------------------------------------------------

/** How many years after introduction a locomotive still shows the "New!" badge in the Buy Train
 * dialog — not specified by SPEC beyond "when a new model becomes available", so picked to be long
 * enough to notice on a slow-playing save without cluttering the roster indefinitely. */
export const NEW_LOCOMOTIVE_BADGE_YEARS = 3;

/** PLAN Phase 25A crossing interlock: a train claims the next junction/crossing node cluster once
 * its head is within this many tiles of it (must exceed the longest braking distance:
 * 270 km/h at 30 km/h per tick ≈ 1.7 tiles, plus a tick of travel). */
export const CROSSING_CLAIM_LOOKAHEAD_TILES = 4;
/** A junction/crossing node is "occupied" from this far before the head reaches it until the tail
 * is this far past it; a waiting train stops this far short of the node. */
export const CROSSING_CLEARANCE_TILES = 0.35;

/** Engines slower than this (km/h) get the "slow engines lose the speed bonus on long routes" hint in the
 * Buy Train route step (Phase 26A; see docs/BALANCE.md: the 25 km/h grasshopper loses money on 200 km). */
export const SLOW_ENGINE_KMH = 60;

// --- Repair crews (Phase 26A) --------------------------------------------------------------------

/** A breakdown dispatches a crew from the nearest station with an Engine Shed; it drives along the
 * track to the train. Speed in tiles/day by era (1 tile/day = 15 km/h): handcar, motor trolley,
 * service truck. */
export const REPAIR_CREW_VEHICLES = [
  { fromYear: 1830, tilesPerDay: 2.5, vehicle: "handcar" },
  { fromYear: 1900, tilesPerDay: 3.5, vehicle: "motor trolley" },
  { fromYear: 1950, tilesPerDay: 4.5, vehicle: "service truck" },
] as const;
/** Days before a crew leaves a shed / a far-away station. */
export const REPAIR_CREW_DISPATCH_DAYS = 0.5;
export const REPAIR_CREW_FAR_DISPATCH_DAYS = 3;
/** With no Engine Shed anywhere the crew comes from the nearest station and is this much slower. */
export const REPAIR_CREW_FAR_SPEED_MULT = 0.5;
export const REPAIR_CREW_MAX_TRAVEL_DAYS = 30;
/** Extra call-out cost per tile the crew travels (era-inflated like the flat repair cost). */
export const REPAIR_CREW_COST_PER_TILE = 120;
