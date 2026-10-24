/** Station types (SPEC §6.1). Balance numbers only — logic lives in src/sim/stations. */

import { TRAIN_LENGTH_SCALE } from "./trains";

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

/** Phase 58: the longest train each station type takes without cutting it, in real cars, times the one
 * `TRAIN_LENGTH_SCALE` (the same scale as the engines' `maxCars`). Typical practice, not a surveyed figure: a Depot is a
 * halt with a short siding, 12 cars (6 game cars, as before); a Station has a passing siding for the long freights of its
 * line, 40 cars (10 game cars before, which no freight engine from 1870 fitted); a Terminal has yard tracks for the longest
 * main-line freight, 120 cars (the Articulated's 120-wagon trains, so no engine of the roster outruns the biggest yard). */
export const STATION_TRACK_REAL_CARS: Record<StationType, number> = {
  depot: 12,
  station: 40,
  terminal: 120,
};
const platformCars = (t: StationType): number =>
  Math.round(STATION_TRACK_REAL_CARS[t] * TRAIN_LENGTH_SCALE);

export const STATION_TYPE_DEFS: Record<StationType, StationTypeDef> = {
  depot: {
    id: "depot",
    name: "Depot",
    catchmentRadius: 1,
    maxTrainLength: platformCars("depot"),
    storagePerCargo: 40,
    cost: 15_000,
    trainCapacity: 2,
    loadSpeedMult: 1.0,
  },
  station: {
    id: "station",
    name: "Station",
    catchmentRadius: 2,
    maxTrainLength: platformCars("station"),
    storagePerCargo: 80,
    cost: 40_000,
    trainCapacity: 3,
    loadSpeedMult: 0.85,
  },
  terminal: {
    id: "terminal",
    name: "Terminal",
    catchmentRadius: 3,
    maxTrainLength: platformCars("terminal"),
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

/** Phase 68 prices below: all at 1830 prices ($, era-scaled when built). A real cost is converted as pounds x 4.87
 * ($ per pound, 1830s gold par) / `eraInflation` of its year; sources in PROGRESS (Phase 68). Where no real cost was
 * found the price is the payback rule: the improvement's yearly gain at the busiest station of a two-big-town line
 * (the S4 line, about 30 % of its revenue lands there: $760k a year in 1842, $2.1M in 1900) times 3-5 years. */
/** Water Tower improvement (SPEC §6.2): steam era, refills steam locomotives stopping here. Built
 * via `buildWaterTower`/`hasWaterTower` (Phase 8) rather than the generic `improvements` list below
 * — it predates this phase and several call sites already key off that boolean directly. Phase 68: $8k -> $15k, a
 * tank and column are about a quarter of a goods shed ($65k); no real cost found. */
export const WATER_TOWER_COST = 15_000;

/** Engine Shed (SPEC §6.2, PLAN Phase 28A Bug 6): the company's first station gets one free; any station can
 * build another. A shed lets the player buy trains there, services trains that stop (breakdown chance −50 %)
 * and is a repair-crew base — the nearest shed sends the crew, so sheds near the far ends of a network make
 * call-outs short and cheap. Era-scaled like every build cost. Phase 68: $30k -> $65k, a brick building of the size of a
 * goods shed (Ballarat, 1862, 18,326 pounds); no engine-shed cost was found. */
export const ENGINE_SHED_COST = 65_000;

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
    cost: 100_000,
    // Phase 68 ($25k): payback. Mail at the busy station is ~15 % of 30 % of the line ($34k a year in 1842); +50 % supply and +25 % pay = +$30k a year; x3.5 years = $100k.
    description: "Mail supply +50%; mail revenue +25% for mail loaded here.",
  },
  hotel: {
    id: "hotel",
    name: "Hotel",
    cost: 225_000,
    // Phase 68 ($50k): Great Western Royal Hotel, Paddington, 60,000 pounds in 1854 (x4.87 / 1.29); also 4 years of +25 % on the busy station's $57k (1842).
    description:
      "Passenger revenue +25% for passengers delivered here; +20% city growth contribution.",
  },
  warehouse: {
    id: "warehouse",
    name: "Warehouse",
    cost: 65_000,
    // Phase 68 ($30k): Ballarat goods sheds, 18,326 pounds in 1862 (x4.87 / 1.38).
    description: "Storage ×2; waiting cargo doesn't decay.",
  },
  coldStorage: {
    id: "coldStorage",
    name: "Cold Storage",
    cost: 140_000,
    // Phase 68 ($40k): Weaste (Salford) cold-air stores, 52,000 pounds in 1899 (x4.87 / 1.83).
    availableYear: 1880,
    description: "Food/livestock waiting here don't decay; their revenue +15% when loaded here.",
  },
  freightYard: {
    id: "freightYard",
    name: "Freight Yard",
    cost: 120_000,
    // Phase 68 ($60k): no real cost found; a yard is a goods shed plus sidings and cranes, about twice the shed.
    availableYear: 1870,
    description: "Loading/unloading 2× faster.",
  },
  livestockPens: {
    id: "livestockPens",
    name: "Livestock Pens",
    cost: 20_000,
    // Phase 68 ($12k): no real cost found; fenced pens and a ramp, a third of a goods shed.
    description: "Required to load livestock at this station.",
  },
};

/** Passing loop (Phase 30A): a few hundred metres of second track with two sets of points, at 1830 prices. Cheaper
 * than a Depot because it has no buildings or staff; the upkeep is the extra track and the points. */
export const PASSING_LOOP_COST = 12_000;
/** Monthly upkeep of a passing loop at 1830 prices (a Depot's building upkeep without staff). */
export const PASSING_LOOP_UPKEEP_MONTHLY = 12;

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
