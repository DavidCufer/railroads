/** Industries (SPEC §8.2). Balance numbers only — placement logic lives in src/sim/economy. */
import type { Terrain } from "../sim/map/terrain";
import { WORLD_SCALE } from "./scale";
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

/** Phase 36: a raw producer's output follows the share of it that trains carried (units loaded at covering stations ÷
 * output, smoothed over about `INDUSTRY_CARRIED_SMOOTHING_MONTHS` months). The yearly change is piecewise linear in that
 * share through these points [share carried, change per year]: unserved shrinks slowly, a little carried is flat, well
 * served grows ~8 %/yr (a mine roughly doubles in 10 years: 1.08^10 = 2.16). Applied monthly, clamped to the mult range. */
export const INDUSTRY_GROWTH_RATE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, -0.04],
  [0.4, 0],
  [0.8, 0.08],
];
export const INDUSTRY_CARRIED_SMOOTHING_MONTHS = 6;
export const INDUSTRY_GROWTH_MULT_MIN = 0.5;
export const INDUSTRY_GROWTH_MULT_MAX = 3;

/** Chance per month that a new raw-producer industry appears somewhere on the map (SPEC §8.2). */
export const NEW_INDUSTRY_CHANCE_PER_MONTH = 0.005;
/** Tiles within this radius of a city are preferred spawn sites ("higher near served cities" —
 * approximated as "near any city", see `industryDynamics.ts`'s doc comment). */
export const NEW_INDUSTRY_CITY_BIAS_RADIUS = 20 * WORLD_SCALE;

/** `produces`/`consumes` below are in each cargo's own real units (SPEC §8.1/PLAN Phase 16). Coal,
 * iron ore, wood, grain, steel, lumber, food and goods keep their pre-Phase-16 numbers unchanged
 * (their 20-unit-per-car capacity didn't change), but livestock (Ranch, Food Plant) and oil/fuel
 * (Oil Well, Refinery) are multiplied by `cargoUnitFactor` (0.75× and 5× respectively) so
 * carloads/month — and therefore the Phase 7.1 balance targets — stay exactly what they were. */
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
    produces: { livestock: 30 }, // 40 × cargoUnitFactor("livestock") (0.75) — same carloads/month
    consumes: {},
    acceptancePoints: {},
    era: 1830,
    recipeMode: "any",
  },
  oilWell: {
    id: "oilWell",
    name: "Oil Well",
    placement: { kind: "terrain", terrain: ["plain", "desert"] },
    produces: { oil: 250 }, // 50 × cargoUnitFactor("oil") (5) — same carloads/month
    consumes: {},
    acceptancePoints: {},
    era: 1860,
    recipeMode: "any",
  },
  steelMill: {
    id: "steelMill",
    name: "Steel Mill",
    placement: { kind: "nearCity", maxTilesFromCity: 6 * WORLD_SCALE },
    produces: { steel: 60 },
    consumes: { coal: 60, ironOre: 60 },
    acceptancePoints: { coal: 8, ironOre: 8 },
    era: 1830,
    recipeMode: "all",
  },
  sawmill: {
    id: "sawmill",
    name: "Sawmill",
    placement: { kind: "nearForestOrCity", maxTilesFromCity: 6 * WORLD_SCALE },
    produces: { lumber: 60 },
    consumes: { wood: 60 },
    acceptancePoints: { wood: 8 },
    era: 1830,
    recipeMode: "any",
  },
  foodPlant: {
    id: "foodPlant",
    name: "Food Plant",
    placement: { kind: "nearCity", maxTilesFromCity: 6 * WORLD_SCALE },
    produces: { food: 60 },
    consumes: { grain: 60, livestock: 45 }, // livestock: 60 × cargoUnitFactor("livestock") (0.75)
    acceptancePoints: { grain: 8, livestock: 8 },
    era: 1830,
    recipeMode: "any",
  },
  factory: {
    id: "factory",
    name: "Factory",
    placement: { kind: "nearCity", maxTilesFromCity: 4 * WORLD_SCALE },
    produces: { goods: 60 },
    consumes: { steel: 60, lumber: 60 },
    acceptancePoints: { steel: 8, lumber: 8 },
    era: 1830,
    recipeMode: "any",
  },
  refinery: {
    id: "refinery",
    name: "Refinery",
    placement: { kind: "nearCity", maxTilesFromCity: 6 * WORLD_SCALE },
    produces: { fuel: 300 }, // 60 × cargoUnitFactor("fuel") (5)
    consumes: { oil: 300 }, // 60 × cargoUnitFactor("oil") (5) — 1:1 recipe ratio preserved
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

// --- Production chains (PLAN Phase 18 D) --------------------------------------------------------

/** A processor's inputs should have a source within this many tiles (map generation guarantees it;
 * the industry panel lists the nearest source of each input). */
export const CHAIN_MAX_DISTANCE_TILES = 25 * WORLD_SCALE;

/** Raw/processed producers of `cargo` (industries whose `produces` include it). */
export function producersOf(cargo: CargoType): IndustryType[] {
  return INDUSTRY_TYPES.filter((t) => t !== "port" && (INDUSTRIES[t].produces[cargo] ?? 0) > 0);
}

/** What a processor needs, as groups that must *all* be satisfied, each satisfied by *any one*
 * listed producer type: Steel Mill → [[Coal Mine], [Iron Mine]] (AND); Factory → [[Steel Mill,
 * Sawmill]] (OR); Food Plant → [[Farm, Ranch]] (OR). Derived from `consumes` + `recipeMode` so it
 * cannot drift from the production rules. Empty for raw producers and ports. */
export function inputGroups(type: IndustryType): IndustryType[][] {
  const def = INDUSTRIES[type];
  const cargos = Object.keys(def.consumes) as CargoType[];
  if (cargos.length === 0) return [];
  if (def.recipeMode === "all") return cargos.map((c) => producersOf(c));
  return [Array.from(new Set(cargos.flatMap((c) => producersOf(c))))];
}

// --- Spacing (Phase 24A) ------------------------------------------------------------------------
/** Minimum straight-line distance (tiles) from an industry to the nearest city footprint tile, so
 * there is room for a station and track between them. Ports are exempt (they sit on the town's
 * coast, but never on a building). */
export const INDUSTRY_MIN_CITY_DISTANCE = 5;
/** Minimum number of empty tiles between two industries' footprints (Chebyshev, so 3 → tiles are
 * at least 4 apart). */
export const INDUSTRY_MIN_GAP_TILES = 3;
/** How far (tiles) a too-close industry may be nudged outward to satisfy the two rules above. */
export const INDUSTRY_NUDGE_MAX_RADIUS = 14;

// --- Resource discoveries (Phase 26A: "empty land becomes useful") -----------------------------

/** Monthly chance a new raw producer is *discovered* in an under-served area (about one every three
 * years), on top of the ordinary `NEW_INDUSTRY_CHANCE_PER_MONTH` spawns that favour cities. */
export const DISCOVERY_CHANCE_PER_MONTH = 1 / 36;
/** The site is drawn from this best fraction of valid sites ranked by distance from the nearest
 * industry or city (larger = emptier land). */
export const DISCOVERY_EMPTY_FRACTION = 0.1;
