/** Locomotive roster and train physics/balance constants (SPEC §7.1, §7.4, §7.5, §7.7).
 * Logic lives in src/sim/trains. */

import { KM_PER_TILE, WORLD_SCALE } from "./scale";

export type LocomotiveType = "steam" | "diesel" | "electric";
export type WeightClass = "light" | "medium" | "heavy";

export interface LocomotiveDef {
  id: string;
  name: string;
  type: LocomotiveType;
  introYear: number;
  maxSpeedKmh: number;
  power: number;
  /** Most cars it can haul. Phase 48: early engines raised to the historical train lengths (1830s-50s passenger
   * trains ran 6-12 carriages: companies lengthened trains before adding paths, as every train needs its own crew
   * and path). More cars cost speed through the tractive-effort model in `computeTargetSpeed` (power over train weight,
   * worse on grades), so a long train is slow on a hill, not free. */
  maxCars: number;
  weightClass: WeightClass;
  /** 1 (worst) – 5 (best). */
  reliability: number;
  /** Working weight, engine and tender (or fuel and equipment), tonnes, of the real type this model stands for. Price,
   * upkeep, fuel and track wear all follow it. */
  weightTonnes: number;
  /** Derived (see `locoBasePrice`: steam by weight, diesel and electric by power), at 1830 prices. */
  cost: number;
  /** Derived from `weightTonnes` (see `LOCO_UPKEEP_PER_TONNE`), at 1830 prices. */
  maintenancePerYear: number;
  /** High-Speed Trainset (SPEC §7.7): passenger & mail cars only. */
  passengerMailOnly?: boolean;
  /** Phase 53C: a cab at both ends (a push-pull or multiple-unit set), so it reverses without running round. */
  doubleEnded?: boolean;
}

type LocoSpec = Omit<LocomotiveDef, "cost" | "maintenancePerYear">;

/** Phase 56: steam price per tonne of working weight at 1830 prices. Builders sold steam locomotives by weight (a 4-4-0
 * of 50 t at $45k keeps the old mid-roster price; late steam cost $600-800/t). */
export const STEAM_PRICE_PER_TONNE = 900;
/** Phase 56B: diesels and electrics were sold by installed power, not weight, so their price is power x a rate. The
 * game's `power` stands for the real engine's rating at one conversion per type, fitted to the roster's real engines:
 * diesel 100 hp per unit (EMD F7 1,500 hp = 16, GP9 1,750 hp = 19, SD40-2 3,000 hp = 26, SD70 4,000 hp = 32), electric
 * 200 kW per unit (GG1 3.45 MW = 18, Re 4/4 II 4.7 MW = 24, Re 6/6 7.8 MW = 40). */
export const POWER_RATING_PER_UNIT = { diesel: 100, electric: 200 } as const;
/** Phase 56B: price per hp (diesel) or kW (electric) at 1830 prices, so that the price in the engine's own year is the
 * real one: an EMD F7 (1,500 hp) cost about $215k in 1949, $143/hp, / `eraInflation(1949)` 2.43 = $59; a PRR GG1
 * (3,450 kW) about $460k in 1934, $133/kW, / `eraInflation(1934)` 2.25 = $59. Rounded to $60 for both. */
export const POWER_PRICE_PER_RATING = { diesel: 60, electric: 60 } as const;

/** Price at 1830 prices: steam by weight, diesel and electric by installed power (rounded to $500). */
export function locoBasePrice(spec: Pick<LocoSpec, "type" | "weightTonnes" | "power">): number {
  const raw =
    spec.type === "steam"
      ? spec.weightTonnes * STEAM_PRICE_PER_TONNE
      : spec.power * POWER_RATING_PER_UNIT[spec.type] * POWER_PRICE_PER_RATING[spec.type];
  return Math.round(raw / 500) * 500;
}
/** Phase 56: yearly depot, inspection and overhaul upkeep per tonne at 1830 prices (before the year's running-cost
 * share). A steam engine needed about twice the shed labour of a diesel (boiler washout, valve gear) and electrics
 * the least (no boiler or engine): the 30 % saving the old Early Electric note quoted, widened by weight. */
export const LOCO_UPKEEP_PER_TONNE: Record<LocomotiveType, number> = {
  steam: 100,
  diesel: 75,
  electric: 50,
};
/** Phase 56: repair bill per tonne for each tile run, at 1830 prices and mature costs (US railroads booked steam
 * repairs per locomotive-mile, and the bill rose with engine size). Diesels and electrics ran more miles between shops. */
export const LOCO_REPAIR_PER_TONNE_TILE: Record<LocomotiveType, number> = {
  steam: 0.04,
  diesel: 0.03,
  electric: 0.02,
};

/** SPEC §7.7 roster. Names are generic wheel arrangements/descriptions, not trademarks. */
const LOCOMOTIVE_SPECS: readonly LocoSpec[] = [
  {
    id: "grasshopper-0-4-0",
    name: "Grasshopper 0-4-0",
    type: "steam",
    introYear: 1830,
    maxSpeedKmh: 25,
    power: 2,
    maxCars: 4,
    weightClass: "light",
    reliability: 2,
    /** B&O Grasshopper vertical-boiler 0-4-0, about 7 t, with its wood/water car. */
    weightTonnes: 8,
  },
  {
    id: "planet-2-2-0",
    name: "Planet 2-2-0",
    type: "steam",
    introYear: 1832,
    maxSpeedKmh: 35,
    power: 3,
    maxCars: 6,
    weightClass: "light",
    reliability: 2,
    /** Stephenson Planet 2-2-0, about 10 t plus a small tender. */
    weightTonnes: 12,
  },
  {
    id: "norris-4-2-0",
    name: "Norris 4-2-0",
    type: "steam",
    introYear: 1838,
    maxSpeedKmh: 45,
    power: 4,
    maxCars: 8,
    weightClass: "light",
    reliability: 3,
    /** Norris 4-2-0 (Philadelphia/Baldwin 1838 class), about 12 t plus a 6-8 t tender. */
    weightTonnes: 20,
  },
  {
    id: "american-4-4-0",
    name: "American 4-4-0",
    type: "steam",
    introYear: 1848,
    maxSpeedKmh: 60,
    power: 6,
    maxCars: 10,
    weightClass: "medium",
    reliability: 3,
    /** 4-4-0 of the 1860s: about 28-30 t engine plus a 20 t tender. */
    weightTonnes: 50,
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
    /** 2-6-0: about 36 t engine plus a 24 t tender. */
    weightTonnes: 60,
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
    /** 2-8-0: about 55 t engine plus a 30 t tender. */
    weightTonnes: 85,
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
    /** 4-6-0 of the 1880s: about 45-50 t engine plus a 28 t tender. */
    weightTonnes: 75,
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
    /** 4-4-2 (PRR E2/E6 class): about 70 t engine plus a 40 t tender. */
    weightTonnes: 105,
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
    /** 4-6-2 of the 1910s: about 95-100 t engine plus a 55 t tender. */
    weightTonnes: 150,
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
    /** USRA light 2-8-2: about 120 t engine plus a 60-70 t tender. */
    weightTonnes: 180,
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
    /** NYC J-3a 4-6-4: 160 t engine plus a 90 t tender. */
    weightTonnes: 250,
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
    /** UP Big Boy 4-8-8-4: 548 t engine and tender. */
    weightTonnes: 540,
  },
  {
    id: "early-electric",
    name: "Early Electric",
    type: "electric",
    introYear: 1905,
    // PLAN 28A: faster than the Atlantic (100) and ~30 % cheaper to run than steam of its size (no coal, no
    // firebox, far fewer moving parts) — otherwise a $191k electrification bought nothing.
    maxSpeedKmh: 110,
    power: 12,
    maxCars: 9,
    weightClass: "medium",
    reliability: 3,
    /** NYC/PRR direct-current electrics of 1905-10: 85-100 t. */
    weightTonnes: 90,
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
    /** EMC E-unit A unit: about 130 t. */
    weightTonnes: 130,
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
    /** PRR GG1 (2-C+C-2): about 215 t. */
    weightTonnes: 210,
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
    /** EMD F7 A unit: about 105 t. */
    weightTonnes: 105,
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
    /** EMD GP7/GP9 road switcher: about 113 t. */
    weightTonnes: 115,
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
    /** Bo-Bo main-line electric (Re 4/4 II, AEM-7): 80-92 t. */
    weightTonnes: 90,
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
    /** EMD SD40-2: 184 t. */
    weightTonnes: 180,
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
    /** EMD SD70 class: 190-195 t. */
    weightTonnes: 195,
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
    /** TGV Atlantique: two power cars of 68 t. */
    weightTonnes: 136,
    doubleEnded: true,
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
    /** Re 6/6 / Class 6E class six-axle electric: 120 t. */
    weightTonnes: 120,
  },
];

/** The roster with price (steam: weight; diesel, electric: power) and upkeep (weight) derived. */
export const LOCOMOTIVES: readonly LocomotiveDef[] = LOCOMOTIVE_SPECS.map((spec) => ({
  ...spec,
  cost: locoBasePrice(spec),
  maintenancePerYear: Math.round((spec.weightTonnes * LOCO_UPKEEP_PER_TONNE[spec.type]) / 50) * 50,
}));

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

/** Phase 53C: game days that one real hour of running takes. A real hour at speed v covers v km; the game covers
 * `v / KMH_PER_TILE_PER_DAY` tiles a day of `KM_PER_TILE` km each, so the same distance takes
 * `KMH_PER_TILE_PER_DAY / KM_PER_TILE` days (3): the compression the game already applies to every journey. */
export const GAME_DAYS_PER_REAL_HOUR = KMH_PER_TILE_PER_DAY / KM_PER_TILE;

/** Phase 53C: real hours a train spends reversing at the end of its run, before it can leave. A steam engine had to be
 * turned (turntable or wye) or run round its train by pointwork, and coaled and watered: 19th-century practice put the
 * engine's turn at a terminus at about an hour (a 2-3 hour run was followed by a half-hour to an hour of turning).
 * A diesel or electric locomotive only runs round (about half an hour, uncoupling, crossing over and recoupling). A
 * set with a cab at both ends (`LocomotiveDef.doubleEnded`) only changes ends: the driver walks through, about a
 * quarter of an hour (the 10-15 min scheduled turn of an Intercity set at a terminus). */
export const TURNAROUND_HOURS: Record<LocomotiveType, number> = {
  steam: 1,
  diesel: 0.5,
  electric: 0.5,
};
export const DOUBLE_ENDED_TURNAROUND_HOURS = 0.25;

/** Game ticks (hours) a locomotive takes to turn at a terminus. */
export function turnaroundTicks(loco: LocomotiveDef): number {
  const hours = loco.doubleEnded ? DOUBLE_ENDED_TURNAROUND_HOURS : TURNAROUND_HOURS[loco.type];
  return Math.round(hours * GAME_DAYS_PER_REAL_HOUR * 24);
}

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
/** Phase 55: the longest a train holds at a passing place to let a faster one by (SPEC §7.5), in real hours. Real
 * "putting the slow train inside" costs the slow train minutes to an hour (timetables allowed a local 10-20 minutes at
 * a crossing station for an express), so an hour is generous. In game ticks it is `GAME_DAYS_PER_REAL_HOUR` days (72
 * ticks), well under `DEADLOCK_REROUTE_DAYS`, so a hold can never look like a jam to the safety nets. */
export const OVERTAKE_MAX_HOLD_REAL_HOURS = 1;
export const OVERTAKE_MAX_HOLD_HOURS = Math.round(
  OVERTAKE_MAX_HOLD_REAL_HOURS * GAME_DAYS_PER_REAL_HOUR * 24,
);
/** A train stuck at a non-target dead end reverses after this many in-game hours (SPEC §7.3). */
export const DEAD_END_REVERSE_HOURS = 6;

// --- Composition / rendering geometry (SPEC §7.1; PLAN Phase 15: "~20% larger") ------------------

/** Also used by the signaling section-reservation math (src/sim/trains/movement.ts) as the
 * physical length a train's tail trails behind its head — not just a render sizing constant. A car is
 * its drawn length (9 px, Phase 50: shortened from 14.4 so a full early train fits a station's platforms) plus the 1 px coupler gap at 32 px per tile, so the sim's tail is where the
 * renderer draws it (Phase 27: it used to be 0.3, a train's last cars poked 0.7 tile beyond where the
 * interlock thought the tail was). */
export const CAR_LENGTH_TILES = 10 / 32;
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
/** Servicing by distance (Phase 30A, PLAYTEST-2 Top 10 #8). A locomotive is serviced (boiler washed out, valves and
 * bearings checked, oil changed) at an Engine Shed; any stop at a station with a shed counts. Wear-out between
 * services is by kilometres run, not by calendar days: the breakdown chance is ×`BREAKDOWN_SERVICE_MIN_MULT` fresh
 * from the shed and rises by `BREAKDOWN_SERVICE_PER_INTERVAL` for every `SERVICE_INTERVAL_KM` run since, to a cap.
 * A train that visits a shed once per interval averages ×1.0 (the old unserviced baseline); one that never does is
 * worse, so sheds along a long line pay. */
export const SERVICE_INTERVAL_KM = { steam: 8_000, diesel: 30_000, electric: 50_000 } as const;
export const BREAKDOWN_SERVICE_MIN_MULT = 0.5;
export const BREAKDOWN_SERVICE_PER_INTERVAL = 1.0;
export const BREAKDOWN_SERVICE_MAX_MULT = 3.5;
/** A service stop is skipped unless this share of the interval has been run since the last one. */
export const SERVICE_MIN_INTERVAL_FRACTION = 0.1;
/** Extra time (hours) a serviced train spends in the shed on top of the normal stop. */
export const SERVICE_DELAY_TICKS = 8;
export const BREAKDOWN_REPAIR_MIN_DAYS = 2;
export const BREAKDOWN_REPAIR_MAX_DAYS = 5;

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
/** PLAN Phase 27 B: per-junction clearance is derived from the geometry of its legs (see
 * `src/sim/track/conflicts.ts`) — two vehicle rectangles (`JUNCTION_VEHICLE_SEP_TILES`: drawn width 0.26 +
 * margin) plus `JUNCTION_LANE_SEP_TILES` for each double-track leg (the lane offset), spread over the angle
 * between the legs, clamped to this range. */
export const JUNCTION_VEHICLE_SEP_TILES = 0.36;
export const JUNCTION_LANE_SEP_TILES = 0.16;
export const JUNCTION_CLEARANCE_MIN_TILES = 0.35;
export const JUNCTION_CLEARANCE_MAX_TILES = 1.4;

/** Engines slower than this (km/h) get the "slow engines lose the speed bonus on long routes" hint in the
 * Buy Train route step (Phase 26A; see docs/BALANCE.md: the 25 km/h grasshopper loses money on 200 km). */
export const SLOW_ENGINE_KMH = 60;

// --- Repair crews (Phase 26A) --------------------------------------------------------------------

/** A breakdown dispatches a crew from the nearest station with an Engine Shed; it drives along the
 * track to the train. Speed in tiles/day by era (1 tile/day = 15 km/h): handcar, motor trolley,
 * service truck. */
export const REPAIR_CREW_VEHICLES = [
  { fromYear: 1830, tilesPerDay: 2.5, vehicle: "handcar", costPerTile: 0 },
  { fromYear: 1900, tilesPerDay: 3.5, vehicle: "motor trolley", costPerTile: 4 },
  { fromYear: 1950, tilesPerDay: 4.5, vehicle: "service truck", costPerTile: 8 },
] as const;
/** Days before a crew leaves a shed / a far-away station. */
export const REPAIR_CREW_DISPATCH_DAYS = 0.5;
export const REPAIR_CREW_FAR_DISPATCH_DAYS = 3;
/** With no Engine Shed anywhere the crew comes from the nearest station and is this much slower. */
export const REPAIR_CREW_FAR_SPEED_MULT = 0.5;
export const REPAIR_CREW_MAX_TRAVEL_DAYS = 30;

/** Phase 47: the "add a train" hint. A line shows it when its trains have run at least this full over their last
 * ~`LOAD_SHARE_WINDOW_TILES` tiles (`Train.loadShare`) and more people or cargo wait for it than one train carries. A train
 * needs `minAgeDays` of running before its load counts. */
export const ADD_TRAIN_HINT = { minLoad: 0.8, minAgeDays: 30 } as const;
