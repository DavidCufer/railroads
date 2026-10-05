/**
 * Industry dynamics (SPEC §8.2, Phase 9, reworked in Phase 36): monthly growth of raw producers, and the
 * occasional new industry appearing on the map. Called once per month boundary from src/sim/tick.ts, after
 * `monthlyIndustryStep` (so a freshly-changed `growthMult` takes effect starting the *next* month's production)
 * and before the station flow rollover (so `stationFlow.month` still holds the month that just ended).
 *
 * Growth is deterministic and visible: a producer's output changes smoothly each month by a yearly rate read off
 * `INDUSTRY_GROWTH_RATE_ANCHORS` at the share of its output that trains carried (units loaded at the covering
 * stations ÷ output, smoothed in `IndustryEconomyState.carriedShare`). No random roll.
 */
import { allCityTiles, cityBufferMask, cityDistanceOk, tooCloseToIndustry } from "./spacing";
import { WORLD_SCALE } from "../../data/scale";
import {
  INDUSTRIES,
  INDUSTRY_CARRIED_SMOOTHING_MONTHS,
  INDUSTRY_GROWTH_MULT_MAX,
  INDUSTRY_GROWTH_MULT_MIN,
  INDUSTRY_GROWTH_RATE_ANCHORS,
  INDUSTRY_TYPES,
  NEW_INDUSTRY_CHANCE_PER_MONTH,
  NEW_INDUSTRY_CITY_BIAS_RADIUS,
  type IndustryType,
} from "../../data/industries";
import type { CargoType } from "../../data/cargo";
import { STATION_TYPE_DEFS } from "../../data/stations";
import { TERRAIN_TYPES, terrainId, type Terrain } from "../map/terrain";
import { nextFloat, nextInt } from "../rng";
import { calendarFromTicks } from "../time";
import { getOrCreateIndustryEconomy } from "./processing";
import type { GameState } from "../state";
import type { Industry } from "./types";
import type { Station } from "../stations/types";

const WATER_ID = terrainId("water");

/** Same spacing rule map-gen placement uses between two same-type raw producers
 * (src/sim/economy/industries.ts's `SAME_TYPE_SPACING`) — kept independent since spawning is a
 * different concern, but deliberately matches so spawned industries don't crowd existing ones. */
const SAME_TYPE_SPACING = 6 * WORLD_SCALE;

function clampGrowthMult(mult: number): number {
  return Math.min(INDUSTRY_GROWTH_MULT_MAX, Math.max(INDUSTRY_GROWTH_MULT_MIN, mult));
}

/** Yearly output change for a producer that trains carried `share` (0..1) of its output (piecewise linear). */
export function growthRatePerYear(share: number): number {
  const pts = INDUSTRY_GROWTH_RATE_ANCHORS;
  const first = pts[0] as readonly [number, number];
  const last = pts[pts.length - 1] as readonly [number, number];
  if (share <= first[0]) return first[1];
  if (share >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i] as readonly [number, number];
    const [x0, y0] = pts[i - 1] as readonly [number, number];
    if (share <= x1) return y0 + ((y1 - y0) * (share - x0)) / (x1 - x0);
  }
  return last[1];
}

/** Yearly output change of the raw producers `station` covers that make `cargo` (weighted by output), for the station
 * panel's one-line trend. Undefined when none of them has been measured yet. */
export function stationSupplyGrowth(
  state: GameState,
  station: Station,
  cargo: CargoType,
): number | undefined {
  const sx = station.tile % state.map.width;
  const sy = Math.floor(station.tile / state.map.width);
  const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
  let weighted = 0;
  let total = 0;
  for (const industry of state.industries) {
    if (INDUSTRIES[industry.type].placement.kind !== "terrain") continue;
    if (Math.max(Math.abs(sx - industry.x), Math.abs(sy - industry.y)) > radius) continue;
    const econ = state.industryEconomy.get(industry.id);
    const output = econ?.monthlyOutput[cargo] ?? 0;
    if (!econ || econ.carriedShare === undefined || output <= 0) continue;
    weighted += growthRatePerYear(econ.carriedShare) * output;
    total += output;
  }
  return total > 0 ? weighted / total : undefined;
}

/** Units of `cargo` that trains loaded last month from `industry`: at each covering station, its `sent` figure times this
 * industry's part of that station's supply of the cargo (other sources at the same station are not counted). */
function carriedLastMonth(
  state: GameState,
  industry: Industry,
  cargo: CargoType,
  output: number,
): number {
  const covering: number[] = [];
  for (const station of state.stations) {
    const sx = station.tile % state.map.width;
    const sy = Math.floor(station.tile / state.map.width);
    const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
    if (Math.max(Math.abs(sx - industry.x), Math.abs(sy - industry.y)) <= radius)
      covering.push(station.id);
  }
  let carried = 0;
  for (const id of covering) {
    const supply = state.stationEconomy.get(id)?.supply[cargo] ?? 0;
    const sent = state.stationFlow.get(id)?.month[cargo]?.sent ?? 0;
    if (supply > 0) carried += sent * Math.min(1, output / covering.length / supply);
  }
  return carried;
}

/** Monthly output change for every raw (terrain-placed) producer by the share of its output trains carried (see the
 * header). Processors and Port are unaffected — their output already tracks delivered inputs. */
function stepGrowth(state: GameState): void {
  for (const industry of state.industries) {
    const def = INDUSTRIES[industry.type];
    if (def.placement.kind !== "terrain") continue;
    const cargo = Object.keys(def.produces)[0] as CargoType | undefined;
    if (!cargo) continue;

    const econ = getOrCreateIndustryEconomy(state, industry.id);
    const mult = econ.growthMult ?? 1;
    const output = econ.monthlyOutput[cargo] ?? (def.produces[cargo] ?? 0) * mult;
    if (output <= 0) continue;
    const share = Math.min(1, carriedLastMonth(state, industry, cargo, output) / output);
    const k = 1 / INDUSTRY_CARRIED_SMOOTHING_MONTHS;
    econ.carriedShare =
      econ.carriedShare === undefined ? share : econ.carriedShare * (1 - k) + share * k;
    const monthly = Math.pow(1 + growthRatePerYear(econ.carriedShare), 1 / 12);
    econ.growthMult = clampGrowthMult(mult * monthly);
  }
}

/** Valid sites for a new raw producer of `type` (terrain, spacing from cities/industries/same type),
 * and the subset within `NEW_INDUSTRY_CITY_BIAS_RADIUS` of a city. Shared with discoveries. */
export function industrySites(
  state: GameState,
  type: IndustryType,
): { candidates: number[]; nearCity: number[] } {
  const def = INDUSTRIES[type];
  if (def.placement.kind !== "terrain") return { candidates: [], nearCity: [] };
  const map = state.map;
  const terrainSet = new Set<Terrain>(def.placement.terrain);
  const sameType = state.industries.filter((i) => i.type === type);

  const cityMask = cityBufferMask(map, allCityTiles(map));
  const candidates: number[] = [];
  const nearCity: number[] = [];
  for (let idx = 0; idx < map.terrain.length; idx++) {
    if ((map.industryId[idx] as number) !== -1 || (map.cityId[idx] as number) !== -1) continue;
    const t = map.terrain[idx] as number;
    if (t === WATER_ID) continue;
    if (!terrainSet.has(TERRAIN_TYPES[t] as Terrain)) continue;
    if (!cityDistanceOk(cityMask, map, type, idx)) continue;
    const x = idx % map.width;
    const y = Math.floor(idx / map.width);
    if (tooCloseToIndustry(x, y, state.industries)) continue;
    let farEnough = true;
    for (const other of sameType) {
      if (Math.hypot(x - other.x, y - other.y) < SAME_TYPE_SPACING) {
        farEnough = false;
        break;
      }
    }
    if (!farEnough) continue;
    candidates.push(idx);
    for (const city of state.cities) {
      if (Math.hypot(x - city.anchorX, y - city.anchorY) <= NEW_INDUSTRY_CITY_BIAS_RADIUS) {
        nearCity.push(idx);
        break;
      }
    }
  }

  return { candidates, nearCity };
}

/** Places a raw producer of `type` on tile `idx` and registers it. Returns its id. */
export function placeNewIndustry(state: GameState, type: IndustryType, idx: number): number {
  const map = state.map;
  const id = state.industries.reduce((max, i) => Math.max(max, i.id), -1) + 1;
  map.industryId[idx] = id;
  state.industries.push({ id, type, x: idx % map.width, y: Math.floor(idx / map.width) });
  state.industryEconomy.set(id, {
    inputStock: {},
    monthlyOutput: { ...INDUSTRIES[type].produces },
  });
  state.mapContentVersion++;
  return id;
}

/** With `NEW_INDUSTRY_CHANCE_PER_MONTH` odds, places one new raw producer somewhere valid (SPEC
 * §8.2: "a new industry appears somewhere... higher near served cities" — approximated here as
 * "near any city", to avoid depending on this month's city-growth pass having already run). */
function maybeSpawnIndustry(state: GameState): void {
  if (nextFloat(state.rng) >= NEW_INDUSTRY_CHANCE_PER_MONTH) return;

  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const eligible = INDUSTRY_TYPES.filter(
    (t) => INDUSTRIES[t].placement.kind === "terrain" && INDUSTRIES[t].era <= year,
  );
  if (eligible.length === 0) return;
  const type = eligible[nextInt(state.rng, 0, eligible.length - 1)] as IndustryType;
  const def = INDUSTRIES[type];
  if (def.placement.kind !== "terrain") return;

  const { candidates, nearCity } = industrySites(state, type);
  const pool = nearCity.length > 0 ? nearCity : candidates;
  if (pool.length === 0) return;
  const idx = pool[nextInt(state.rng, 0, pool.length - 1)] as number;
  placeNewIndustry(state, type, idx);
}

export function monthlyIndustryDynamicsStep(state: GameState): void {
  stepGrowth(state);
  maybeSpawnIndustry(state);
}
