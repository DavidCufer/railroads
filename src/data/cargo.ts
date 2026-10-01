/** Cargo types (SPEC §8.1). Balance numbers only — logic lives in src/sim/economy. */

import { WORLD_SCALE } from "./scale";

export const CARGO_TYPES = [
  "passengers",
  "mail",
  "coal",
  "ironOre",
  "wood",
  "grain",
  "livestock",
  "oil",
  "steel",
  "lumber",
  "food",
  "goods",
  "fuel",
] as const;

export type CargoType = (typeof CARGO_TYPES)[number];

export interface CargoDef {
  id: CargoType;
  /** Display name. */
  name: string;
  /** Car type name used to haul this cargo. */
  car: string;
  /** Longer car-type label for the Buy Train/Edit Consist car picker (PLAN Phase 16: "show capacity
   * per car type"), e.g. "Passenger car" rather than the bare `car` noun. */
  carLabel: string;
  carCost: number;
  /** Real-world units a full car of this cargo holds (PLAN Phase 16: "every cargo gets a real unit
   * and per-car capacity" — passengers 40 people, mail 30 bags, most freight 20 tons, livestock 15
   * head, oil/fuel 100 barrels). Replaces the old cargo-agnostic `CARLOAD_UNITS` as the actual car
   * cap; see `cargoUnitFactor` for how production/supply tables were rescaled to match while keeping
   * carloads/month unchanged. */
  capacity: number;
  /** Short unit word shown after a count once it's above car-load granularity (train panel car
   * fill, city/station per-month supply, SPEC §6.3's "Waiting" amounts) — "" for passengers, whose
   * name alone already reads naturally as a headcount ("28 passengers", not "28 " + unit). */
  unit: string;
  /** Full noun phrase for a delivered/waiting count (PLAN Phase 16's station panel "N waiting" line
   * and floating delivery label), e.g. "tons of coal", "head of livestock" — reads naturally where
   * the short `unit` word alone wouldn't ("13 mail bags waiting", not "13 bags waiting"). */
  unitsNoun: string;
  /** Revenue per carload per `REVENUE_DISTANCE_TILES` tiles (100 km) at era-1830 prices, on-time delivery. Still "per
   * carload" (unchanged by Phase 16) — src/sim/trains/loading.ts scales it by the fraction of a full
   * car actually delivered (`loadedUnits / capacity`) for partial loads. */
  baseRate: number;
  /** Expected transit days before revenue starts falling. */
  decayDays: number;
  /** Urgency multiplier used in the revenue formula's `expected` transit time (SPEC §8.1): higher
   * urgency means a shorter expected transit time before the time bonus fades. */
  urgency: number;
  color: string;
  /** Year this cargo becomes relevant (processed cargo needs the producing industry's era too). */
  era: number;
  notes?: string;
}

/** SPEC §6.3: waiting cargo at a station older than this many days starts to decay
 * `WAITING_DECAY_RATE_PER_DAY`/day. Passengers and mail decay sooner than freight. */
export function waitingDecayThresholdDays(cargo: CargoType): number {
  if (cargo === "passengers") return 10;
  if (cargo === "mail") return 15;
  return 30;
}

export const WAITING_DECAY_RATE_PER_DAY = 0.05;

/** Passengers and mail are people and post, not goods in a shed (Phase 30A, PLAYTEST-2 exploit 1): they have
 * no storage cap and no warehouse. A pile nobody has collected from for `graceDays` starts to give up: every day
 * `giveUpPerDay` of it leaves (takes the coach or stays at home), so a pile settles at about
 * `supply / giveUpPerDay` and a long gap between trains simply loses people. Mail waits a little longer: a
 * posted letter can sit in the sorting office, but an unserved mail contract moves to the road mail coach. */
export const WAITING_PATIENCE: Partial<
  Record<CargoType, { graceDays: number; giveUpPerDay: number }>
> = {
  passengers: { graceDays: 10, giveUpPerDay: 0.05 },
  mail: { graceDays: 15, giveUpPerDay: 0.05 },
};

/** True for cargo whose waiting pile is made of people / post (patience, no storage cap). */
export function givesUpWaiting(cargo: CargoType): boolean {
  return WAITING_PATIENCE[cargo] !== undefined;
}

/** Pre-Phase-16 cargo-agnostic carload size (every car held exactly 20 abstract "units", full or
 * empty — see PROGRESS.md's Phase 16 entry for the play-test bug this caused). Real per-cargo
 * capacities (`CargoDef.capacity`) replaced it as the actual car cap, but this is kept as the
 * common baseline `cargoUnitFactor` scales against, and to normalize goal/growth-score accounting
 * (src/sim/economy/cityGrowth.ts, `src/sim/goals`) so a full carload of *any* cargo still
 * contributes the same amount it always did, regardless of its real capacity. */
export const CARLOAD_UNITS = 20;

/** How many times bigger this cargo's real per-car capacity is than the old flat 20-unit carload —
 * e.g. 2 for passengers (40/car), 0.75 for livestock (15/car). Production/supply tables
 * (src/data/industries.ts, src/data/cities.ts) were multiplied by this factor so carloads/month stay
 * exactly what they were before Phase 16 (PLAN: "balance tests must stay green without retuning").
 * Also used to scale per-cargo storage caps (`src/sim/stations/improvements.ts`) and save migration
 * (`src/save/migrate.ts`'s v2→v3 step). */
export function cargoUnitFactor(cargo: CargoType): number {
  return CARGO[cargo].capacity / CARLOAD_UNITS;
}

/** Tiles per 100 km — the distance unit `baseRate` is quoted for (SPEC §8.1: 10 tiles at 10 km/tile). */
export const REVENUE_DISTANCE_TILES = 10 * WORLD_SCALE;

/** Tiles a 60 km/h reference train covers per day, for the revenue `expected` transit time (SPEC §8.1). */
export const EXPECTED_TILES_PER_DAY = 2 * WORLD_SCALE;

/** SPEC §8.1: shorter deliveries pay nothing (and warn once). */
export const MIN_REVENUE_DISTANCE_TILES = 3 * WORLD_SCALE;

export const CARGO: Record<CargoType, CargoDef> = {
  passengers: {
    id: "passengers",
    name: "Passengers",
    car: "Passenger",
    carLabel: "Passenger car",
    carCost: 4_000,
    capacity: 40,
    unit: "",
    unitsNoun: "passengers",
    baseRate: 1_650,
    decayDays: 3,
    urgency: 1.0,
    color: "#F2F2F2",
    era: 1830,
    notes: "two-way from cities",
  },
  mail: {
    id: "mail",
    name: "Mail",
    car: "Mail",
    carLabel: "Mail car",
    carCost: 4_000,
    capacity: 30,
    unit: "bags",
    unitsNoun: "mail bags",
    baseRate: 2_150, // Phase 26A: 1.3× a passenger car (1,650), was 4,000 (2.4×)
    decayDays: 2,
    urgency: 0.8,
    color: "#D8453C",
    era: 1830,
    notes: "two-way from cities",
  },
  coal: {
    id: "coal",
    name: "Coal",
    car: "Coal hopper",
    carLabel: "Coal hopper",
    carCost: 2_000,
    capacity: 20,
    unit: "t",
    unitsNoun: "tons of coal",
    baseRate: 1_200,
    decayDays: 30,
    urgency: 2.5,
    color: "#2A2A2A",
    era: 1830,
  },
  ironOre: {
    id: "ironOre",
    name: "Iron Ore",
    car: "Ore hopper",
    carLabel: "Ore hopper",
    carCost: 2_000,
    capacity: 20,
    unit: "t",
    unitsNoun: "tons of iron ore",
    baseRate: 1_100,
    decayDays: 30,
    urgency: 2.5,
    color: "#A3583E",
    era: 1830,
  },
  wood: {
    id: "wood",
    name: "Wood",
    car: "Flatcar",
    carLabel: "Flatcar",
    carCost: 2_000,
    capacity: 20,
    unit: "t",
    unitsNoun: "tons of wood",
    baseRate: 1_000,
    decayDays: 30,
    urgency: 2.5,
    color: "#7A5230",
    era: 1830,
    notes: "logs",
  },
  grain: {
    id: "grain",
    name: "Grain",
    car: "Grain hopper",
    carLabel: "Grain hopper",
    carCost: 2_000,
    capacity: 20,
    unit: "t",
    unitsNoun: "tons of grain",
    baseRate: 1_300,
    decayDays: 20,
    urgency: 2.5,
    color: "#D9B23C",
    era: 1830,
  },
  livestock: {
    id: "livestock",
    name: "Livestock",
    car: "Livestock",
    carLabel: "Livestock car",
    carCost: 3_000,
    capacity: 15,
    unit: "head",
    unitsNoun: "head of livestock",
    baseRate: 2_000,
    decayDays: 6,
    urgency: 1.2,
    color: "#C7A876",
    era: 1830,
    notes: "needs Livestock Pens to load",
  },
  oil: {
    id: "oil",
    name: "Oil",
    car: "Tanker",
    carLabel: "Tanker car",
    carCost: 3_000,
    capacity: 100,
    unit: "bbl",
    unitsNoun: "barrels of oil",
    baseRate: 1_600,
    decayDays: 30,
    urgency: 2.5,
    color: "#2E4A2E",
    era: 1860,
  },
  steel: {
    id: "steel",
    name: "Steel",
    car: "Flatcar",
    carLabel: "Flatcar",
    carCost: 2_000,
    capacity: 20,
    unit: "t",
    unitsNoun: "tons of steel",
    baseRate: 2_000,
    decayDays: 30,
    urgency: 2.5,
    color: "#5D7A99",
    era: 1830,
    notes: "processed",
  },
  lumber: {
    id: "lumber",
    name: "Lumber",
    car: "Flatcar",
    carLabel: "Flatcar",
    carCost: 2_000,
    capacity: 20,
    unit: "t",
    unitsNoun: "tons of lumber",
    baseRate: 1_500,
    decayDays: 30,
    urgency: 2.5,
    color: "#B08D5E",
    era: 1830,
    notes: "processed",
  },
  food: {
    id: "food",
    name: "Food",
    car: "Boxcar",
    carLabel: "Boxcar",
    carCost: 3_000,
    capacity: 20,
    unit: "crates",
    unitsNoun: "crates of food",
    baseRate: 2_200,
    decayDays: 8,
    urgency: 1.3,
    color: "#E08A3C",
    era: 1830,
    notes: "processed; cold storage helps",
  },
  goods: {
    id: "goods",
    name: "Goods",
    car: "Boxcar",
    carLabel: "Boxcar",
    carCost: 3_000,
    capacity: 20,
    unit: "crates",
    unitsNoun: "crates of goods",
    baseRate: 2_900,
    decayDays: 15,
    urgency: 1.6,
    color: "#8B5CA8",
    era: 1830,
    notes: "processed",
  },
  fuel: {
    id: "fuel",
    name: "Fuel",
    car: "Tanker",
    carLabel: "Tanker car",
    carCost: 3_000,
    capacity: 100,
    unit: "bbl",
    unitsNoun: "barrels of fuel",
    baseRate: 2_000,
    decayDays: 30,
    urgency: 2.5,
    color: "#E0C93C",
    era: 1890,
    notes: "processed",
  },
};
