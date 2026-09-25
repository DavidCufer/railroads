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
  /** How multi-input processing combines `consumes` (SPEC §8.2): "all" needs every input in lock
   * step (Steel Mill: output = min(coal, ore)); "any" accepts either input on its own (Food Plant:
   * grain OR livestock; Factory: steel OR lumber). Irrelevant when `consumes` has 0-1 entries. */
  recipeMode: "all" | "any";
}

/** Cap on a processor's undelivered input stockpile per cargo (SPEC §8.2 doesn't specify one —
 * without a cap a permanently-unserved processor's `consumes` inputs would never be picked up
 * anyway, but a served-then-abandoned one shouldn't stockpile forever; ~4 months at full capacity
 * is a reasonable buffer). */
export const INDUSTRY_INPUT_STORAGE_CAP = 240;

// --- Industry dynamics (SPEC §8.2, Phase 9) -----------------------------------------------------
// Applies only to raw (terrain-placed) producers — Coal Mine, Iron Mine, Logging Camp, Farm,
// Ranch, Oil Well. "Served" is approximated from a covering station's `StationCargoPile.waitingDays`
// for that cargo (src/sim/economy/industryDynamics.ts) rather than a literal rolling 12-month
// pickup log, to avoid new per-industry-per-month bookkeeping: a station that's actively drawing a
// pile down keeps resetting `waitingDays` to 0 on every load, so a low value already means "picked
// up recently" and a high one means "sitting unclaimed" — see that module's own doc comment.
export const INDUSTRY_SERVED_WAITING_DAYS_THRESHOLD = 12;
export const INDUSTRY_GROWTH_CHANCE_PER_MONTH = 0.03;
export const INDUSTRY_SHRINK_CHANCE_PER_MONTH = 0.01;
export const INDUSTRY_GROWTH_STEP = 1.2;
export const INDUSTRY_SHRINK_STEP = 0.8;
export const INDUSTRY_GROWTH_MULT_MIN = 0.5;
export const INDUSTRY_GROWTH_MULT_MAX = 3;

/** Chance per month that a new raw-producer industry appears somewhere on the map (SPEC §8.2). */
export const NEW_INDUSTRY_CHANCE_PER_MONTH = 0.005;
/** Tiles within this radius of a city are preferred spawn sites ("higher near served cities" —
 * approximated as "near any city", see `industryDynamics.ts`'s doc comment). */
export const NEW_INDUSTRY_CITY_BIAS_RADIUS = 20;

export const INDUSTRIES: Record<IndustryType, IndustryDef> = {
  coalMine: {
    id: "coalMine",
    name: "Coal Mine",
    placement: { kind: "terrain", terrain: ["hills", "mountain"] },
    produces: { coal: 60 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
    recipeMode: "any",
  },
  ironMine: {
    id: "ironMine",
    name: "Iron Mine",
    placement: { kind: "terrain", terrain: ["hills", "mountain"] },
    produces: { ironOre: 60 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
    recipeMode: "any",
  },
  loggingCamp: {
    id: "loggingCamp",
    name: "Logging Camp",
    placement: { kind: "terrain", terrain: ["forest"] },
    produces: { wood: 60 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
    recipeMode: "any",
  },
  farm: {
    id: "farm",
    name: "Farm",
    placement: { kind: "terrain", terrain: ["plain"] },
    produces: { grain: 60 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
    recipeMode: "any",
  },
  ranch: {
    id: "ranch",
    name: "Ranch",
    placement: { kind: "terrain", terrain: ["plain", "desert"] },
    produces: { livestock: 40 },
    consumes: {},
    acceptancePoints: {},
    era: 1830,
    recipeMode: "any",
  },
  oilWell: {
    id: "oilWell",
    name: "Oil Well",
    placement: { kind: "terrain", terrain: ["plain", "desert"] },
    produces: { oil: 50 },
    consumes: {},
    acceptancePoints: {},
    era: 1860,
    recipeMode: "any",
  },
  steelMill: {
    id: "steelMill",
    name: "Steel Mill",
    placement: { kind: "nearCity", maxTilesFromCity: 6 },
    produces: { steel: 60 },
    consumes: { coal: 60, ironOre: 60 },
    acceptancePoints: { coal: 8, ironOre: 8 },
    era: 1830,
    recipeMode: "all",
  },
  sawmill: {
    id: "sawmill",
    name: "Sawmill",
    placement: { kind: "nearForestOrCity", maxTilesFromCity: 6 },
    produces: { lumber: 60 },
    consumes: { wood: 60 },
    acceptancePoints: { wood: 8 },
    era: 1830,
    recipeMode: "any",
  },
  foodPlant: {
    id: "foodPlant",
    name: "Food Plant",
    placement: { kind: "nearCity", maxTilesFromCity: 6 },
    produces: { food: 60 },
    consumes: { grain: 60, livestock: 60 },
    acceptancePoints: { grain: 8, livestock: 8 },
    era: 1830,
    recipeMode: "any",
  },
  factory: {
    id: "factory",
    name: "Factory",
    placement: { kind: "nearCity", maxTilesFromCity: 4 },
    produces: { goods: 60 },
    consumes: { steel: 60, lumber: 60 },
    acceptancePoints: { steel: 8, lumber: 8 },
    era: 1830,
    recipeMode: "any",
  },
  refinery: {
    id: "refinery",
    name: "Refinery",
    placement: { kind: "nearCity", maxTilesFromCity: 6 },
    produces: { fuel: 60 },
    consumes: { oil: 60 },
    acceptancePoints: { oil: 8 },
    era: 1880,
    recipeMode: "any",
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
    recipeMode: "any",
  },
};
