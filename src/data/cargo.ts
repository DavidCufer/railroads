/** Cargo types (SPEC §8.1). Balance numbers only — logic lives in src/sim/economy. */

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
  carCost: number;
  /** Revenue per carload per 10 tiles (100 km) at era-1830 prices, on-time delivery. */
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

/** SPEC §7.1: "1 carload = 20 units of its cargo" (passengers: 40 people per car = 1 carload —
 * the sim tracks everything in these abstract "units" so a car is simply full or empty). */
export const CARLOAD_UNITS = 20;

/** SPEC §8.1: shorter deliveries pay nothing (and warn once). */
export const MIN_REVENUE_DISTANCE_TILES = 3;

export const CARGO: Record<CargoType, CargoDef> = {
  passengers: {
    id: "passengers",
    name: "Passengers",
    car: "Passenger",
    carCost: 4_000,
    baseRate: 3_000,
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
    carCost: 4_000,
    baseRate: 4_000,
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
    carCost: 2_000,
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
    carCost: 2_000,
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
    carCost: 2_000,
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
    carCost: 2_000,
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
    carCost: 3_000,
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
    carCost: 3_000,
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
    carCost: 2_000,
    baseRate: 1_800,
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
    carCost: 2_000,
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
    carCost: 3_000,
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
    carCost: 3_000,
    baseRate: 2_600,
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
    carCost: 3_000,
    baseRate: 2_000,
    decayDays: 30,
    urgency: 2.5,
    color: "#E0C93C",
    era: 1890,
    notes: "processed",
  },
};
