/**
 * Industry dynamics (SPEC §8.2, Phase 9): monthly growth/shrink for served/unserved raw producers,
 * and the occasional new industry appearing on the map. Called once per month boundary from
 * src/sim/tick.ts, after `monthlyIndustryStep` (so a freshly-changed `growthMult` takes effect
 * starting the *next* month's production, matching how processors' own output already lags a
 * month behind their inputs).
 *
 * "Served ≥50% of output picked up over the last 12 months" (SPEC's literal wording) would need a
 * new rolling per-industry pickup log; instead this reuses `StationCargoPile.waitingDays`, which a
 * covering station already resets to 0 every time a train loads any of that pile (see
 * src/sim/trains/loading.ts's `applyLoad`) and otherwise climbs without bound (an unserved pile
 * sits pinned near its storage cap forever — see src/sim/economy/cargoFlow.ts — so `waitingDays`
 * keeps counting up instead of getting reset). A low value already means "picked up recently"; this
 * is a simpler, no-new-state proxy for the same idea, checked monthly rather than over a trailing
 * 12-month window (a deliberate simplification — see PROGRESS.md).
 */
import {
  INDUSTRIES,
  INDUSTRY_GROWTH_CHANCE_PER_MONTH,
  INDUSTRY_GROWTH_MULT_MAX,
  INDUSTRY_GROWTH_MULT_MIN,
  INDUSTRY_GROWTH_STEP,
  INDUSTRY_SERVED_WAITING_DAYS_THRESHOLD,
  INDUSTRY_SHRINK_CHANCE_PER_MONTH,
  INDUSTRY_SHRINK_STEP,
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

const WATER_ID = terrainId("water");

/** Same spacing rule map-gen placement uses between two same-type raw producers
 * (src/sim/economy/industries.ts's `SAME_TYPE_SPACING`) — kept independent since spawning is a
 * different concern, but deliberately matches so spawned industries don't crowd existing ones. */
const SAME_TYPE_SPACING = 6;

function clampGrowthMult(mult: number): number {
  return Math.min(INDUSTRY_GROWTH_MULT_MAX, Math.max(INDUSTRY_GROWTH_MULT_MIN, mult));
}

/** True if some station whose catchment covers `industry`'s tile has recently drawn its `cargo`
 * pile down (see this module's doc comment for why `waitingDays` is the proxy used here). */
function isServed(state: GameState, industry: Industry, cargo: CargoType): boolean {
  for (const station of state.stations) {
    const sx = station.tile % state.map.width;
    const sy = Math.floor(station.tile / state.map.width);
    const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
    if (Math.max(Math.abs(sx - industry.x), Math.abs(sy - industry.y)) > radius) continue;
    const pile = state.stationCargo.get(station.id)?.[cargo];
    if (pile && pile.waitingDays <= INDUSTRY_SERVED_WAITING_DAYS_THRESHOLD) return true;
  }
  return false;
}

/** Growth/shrink roll for every raw (terrain-placed) producer (SPEC §8.2: "raw producers that are
 * served... 3%/month chance to grow +20% (max 3×)... unserved... 1%/month to shrink −20% (min
 * 50%)"). Processors and Port are unaffected — their output already tracks delivered inputs. */
function stepGrowthAndShrink(state: GameState): void {
  for (const industry of state.industries) {
    const def = INDUSTRIES[industry.type];
    if (def.placement.kind !== "terrain") continue;
    const cargo = Object.keys(def.produces)[0] as CargoType | undefined;
    if (!cargo) continue;

    const econ = getOrCreateIndustryEconomy(state, industry.id);
    const mult = econ.growthMult ?? 1;
    const roll = nextFloat(state.rng);
    if (isServed(state, industry, cargo)) {
      if (roll < INDUSTRY_GROWTH_CHANCE_PER_MONTH) {
        econ.growthMult = clampGrowthMult(mult * INDUSTRY_GROWTH_STEP);
      }
    } else if (roll < INDUSTRY_SHRINK_CHANCE_PER_MONTH) {
      econ.growthMult = clampGrowthMult(mult * INDUSTRY_SHRINK_STEP);
    }
  }
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

  const map = state.map;
  const terrainSet = new Set<Terrain>(def.placement.terrain);
  const sameType = state.industries.filter((i) => i.type === type);

  const candidates: number[] = [];
  const nearCity: number[] = [];
  for (let idx = 0; idx < map.terrain.length; idx++) {
    if ((map.industryId[idx] as number) !== -1 || (map.cityId[idx] as number) !== -1) continue;
    const t = map.terrain[idx] as number;
    if (t === WATER_ID) continue;
    if (!terrainSet.has(TERRAIN_TYPES[t] as Terrain)) continue;
    const x = idx % map.width;
    const y = Math.floor(idx / map.width);
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

  const pool = nearCity.length > 0 ? nearCity : candidates;
  if (pool.length === 0) return;
  const idx = pool[nextInt(state.rng, 0, pool.length - 1)] as number;
  const id = state.industries.reduce((max, i) => Math.max(max, i.id), -1) + 1;
  map.industryId[idx] = id;
  state.industries.push({ id, type, x: idx % map.width, y: Math.floor(idx / map.width) });
  state.industryEconomy.set(id, { inputStock: {}, monthlyOutput: { ...def.produces } });
  state.mapContentVersion++;
}

export function monthlyIndustryDynamicsStep(state: GameState): void {
  stepGrowthAndShrink(state);
  maybeSpawnIndustry(state);
}
