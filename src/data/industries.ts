/** Industries (SPEC §8.2). Balance numbers only — placement logic lives in src/sim/economy. */
import type { Terrain } from "../sim/map/terrain";
import type { CargoType } from "./cargo";

export const INDUSTRY_TYPES = [
  "coalMine",
  "ironMine",
  "loggingCamp",
  "farm",
  "ranch",
  "oilWell",
  "steelMill",
  "sawmill",
  "foodPlant",
  "factory",
  "refinery",
  "port",
] as const;

export type IndustryType = (typeof INDUSTRY_TYPES)[number];

/** How a generator picks a site for this industry. */
export type IndustryPlacement =
  | { kind: "terrain"; terrain: readonly Terrain[] }
  | { kind: "nearCity"; maxTilesFromCity: number }
  | { kind: "nearForestOrCity"; maxTilesFromCity: number }
  | { kind: "coastalCity" };

export interface IndustryDef {
  id: IndustryType;
  name: string;
  placement: IndustryPlacement;
  /** Units/month produced per cargo (raw producers, or processed output). */
  produces: Partial<Record<CargoType, number>>;
  /** Units/month consumed per cargo (processors only). */
  consumes: Partial<Record<CargoType, number>>;
  /** Acceptance points per cargo — how eagerly a covering station should pick up inputs. */
  acceptancePoints: Partial<Record<CargoType, number>>;
  /** Year this industry starts appearing. */
  era: number;
}

export const INDUSTRIES: Record<IndustryType, IndustryDef> = {
  coalMine: {
    id: "coalMine",
    name: "Coal Mine",
    placement: { kind: "terrain", terrain: ["hills", "mountain"] },
    produces: { coal: 60 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
  },
  ironMine: {
    id: "ironMine",
    name: "Iron Mine",
    placement: { kind: "terrain", terrain: ["hills", "mountain"] },
    produces: { ironOre: 50 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
  },
  loggingCamp: {
    id: "loggingCamp",
    name: "Logging Camp",
    placement: { kind: "terrain", terrain: ["forest"] },
    produces: { wood: 60 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
  },
  farm: {
    id: "farm",
    name: "Farm",
    placement: { kind: "terrain", terrain: ["plain"] },
    produces: { grain: 60 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
  },
  ranch: {
    id: "ranch",
    name: "Ranch",
    placement: { kind: "terrain", terrain: ["plain", "desert"] },
    produces: { livestock: 40 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
  },
  oilWell: {
    id: "oilWell",
    name: "Oil Well",
    placement: { kind: "terrain", terrain: ["plain", "desert"] },
    produces: { oil: 50 },
    consumes: {},
    acceptancePoints: {},
    era: 1860,
  },
  steelMill: {
    id: "steelMill",
    name: "Steel Mill",
    placement: { kind: "nearCity", maxTilesFromCity: 6 },
    produces: { steel: 60 },
    consumes: { coal: 60, ironOre: 60 },
    acceptancePoints: { coal: 8, ironOre: 8 },
    era: 1830,
  },
  sawmill: {
    id: "sawmill",
    name: "Sawmill",
    placement: { kind: "nearForestOrCity", maxTilesFromCity: 6 },
    produces: { lumber: 60 },
    consumes: { wood: 60 },
    acceptancePoints: { wood: 8 },
    era: 1830,
  },
  foodPlant: {
    id: "foodPlant",
    name: "Food Plant",
    placement: { kind: "nearCity", maxTilesFromCity: 6 },
    produces: { food: 60 },
    consumes: { grain: 60, livestock: 60 },
    acceptancePoints: { grain: 8, livestock: 8 },
    era: 1830,
  },
  factory: {
    id: "factory",
    name: "Factory",
    placement: { kind: "nearCity", maxTilesFromCity: 4 },
    produces: { goods: 60 },
    consumes: { steel: 60, lumber: 60 },
    acceptancePoints: { steel: 8, lumber: 8 },
    era: 1830,
  },
  refinery: {
    id: "refinery",
    name: "Refinery",
    placement: { kind: "nearCity", maxTilesFromCity: 6 },
    produces: { fuel: 60 },
    consumes: { oil: 60 },
    acceptancePoints: { oil: 8 },
    era: 1880,
  },
  port: {
    id: "port",
    name: "Port",
    placement: { kind: "coastalCity" },
    produces: { goods: 20 },
    consumes: {},
    acceptancePoints: {
      coal: 8,
      ironOre: 8,
      wood: 8,
      grain: 8,
      livestock: 8,
      oil: 8,
      steel: 8,
      lumber: 8,
      food: 8,
      fuel: 8,
    },
    era: 1830,
  },
};
