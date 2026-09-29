/**
 * Chain-aware industry placement (PLAN Phase 18 D). Random placement puts processors near cities
 * without regard to where their inputs are, which left "the factory needs steel, the steel mill
 * needs coal, and there is none nearby". After the normal placement this pass makes sure every
 * processor has a source of each required input group within `CHAIN_MAX_DISTANCE_TILES`
 * (SPEC §8.2), adding producers on suitable terrain, or — on generated maps only — moving the
 * processor to a city that does have them, and that at least one Factory exists so a complete chain
 * to Goods is always available. Deterministic with the map seed (only the passed rng is used).
 */
import {
  CHAIN_MAX_DISTANCE_TILES,
  INDUSTRIES,
  inputGroups,
  type IndustryType,
} from "../../data/industries";
import { inBounds, tileIndex } from "../map/grid";
import { terrainId, TERRAIN_TYPES as TERRAIN_NAMES } from "../map/terrain";
import type { GameMap } from "../map/types";
import { nextInt, type RngState } from "../rng";
import type { City, Industry } from "./types";

const WATER_ID = terrainId("water");
const MOUNTAIN_ID = terrainId("mountain");
const FOREST_ID = terrainId("forest");

/** New producers are placed at least this far from the processor they feed, and within
 * `PLACE_MAX` — comfortably inside the guaranteed range so a later move of either stays valid. */
const PLACE_MIN = 5;
const PLACE_MAX = 22;
const PROCESSOR_TYPES = (Object.keys(INDUSTRIES) as IndustryType[]).filter(
  (t) => inputGroups(t).length > 0,
);

export interface ChainOptions {
  /** Region maps keep their hand-placed industries: only add producers, never move or drop one. */
  keepExisting?: boolean;
}

function eraOk(type: IndustryType, startYear: number): boolean {
  return INDUSTRIES[type].era <= startYear;
}

/** The nearest existing industry of any type in `alts` to `at`, or undefined. */
export function nearestOf(
  industries: readonly Industry[],
  alts: readonly IndustryType[],
  at: { x: number; y: number },
  exclude?: Industry,
): { industry: Industry; distance: number } | undefined {
  let best: { industry: Industry; distance: number } | undefined;
  for (const i of industries) {
    if (i === exclude || !alts.includes(i.type)) continue;
    const d = Math.hypot(i.x - at.x, i.y - at.y);
    if (!best || d < best.distance) best = { industry: i, distance: d };
  }
  return best;
}

/** True if `processor`'s every input group has a source within range that is itself supplied
 * (recursively, so a Factory fed by a Steel Mill needs that mill's coal and ore too). */
export function chainIsComplete(
  industries: readonly Industry[],
  processor: Industry,
  startYear: number,
  seen: Set<Industry> = new Set(),
): boolean {
  if (seen.has(processor)) return false;
  seen.add(processor);
  for (const group of inputGroups(processor.type)) {
    const alts = group.filter((t) => eraOk(t, startYear));
    if (alts.length === 0) continue; // nothing in this era can supply it; not the map's fault
    const ok = industries.some(
      (i) =>
        alts.includes(i.type) &&
        Math.hypot(i.x - processor.x, i.y - processor.y) <= CHAIN_MAX_DISTANCE_TILES &&
        chainIsComplete(industries, i, startYear, new Set(seen)),
    );
    if (!ok) return false;
  }
  return true;
}

/** True if a Factory (Goods) has a complete chain and stands within `reach` tiles of some city. */
export function hasGoodsChainNearCity(
  industries: readonly Industry[],
  cities: readonly City[],
  startYear: number,
  reach = 30,
): boolean {
  return industries.some(
    (f) =>
      f.type === "factory" &&
      chainIsComplete(industries, f, startYear) &&
      cities.some((c) => Math.hypot(c.anchorX - f.x, c.anchorY - f.y) <= reach),
  );
}

interface Ctx {
  map: GameMap;
  rng: RngState;
  cities: readonly City[];
  work: Industry[];
  startYear: number;
}

/** Free, dry, city-free tile. Mountains are only fine for producers that ask for them by terrain
 * (coal/iron mines); processors and ports stay off them, as in the base placement. */
function siteFree(ctx: Ctx, idx: number, allowMountain = false): boolean {
  const { map } = ctx;
  const t = map.terrain[idx] as number;
  if (t === WATER_ID || (t === MOUNTAIN_ID && !allowMountain)) return false;
  return map.cityId[idx] === -1 && map.industryId[idx] === -1;
}

function isNearForest(map: GameMap, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (!inBounds(map, x + dx, y + dy)) continue;
      if ((map.terrain[tileIndex(map, x + dx, y + dy)] as number) === FOREST_ID) return true;
    }
  }
  return false;
}

/** Candidate tiles for a new `type` industry `PLACE_MIN..PLACE_MAX` tiles from `near`. */
function candidateSites(
  ctx: Ctx,
  type: IndustryType,
  near: { x: number; y: number },
  relaxed = false,
): number[] {
  const { map, cities } = ctx;
  const placement = INDUSTRIES[type].placement;
  const out: number[] = [];
  const r = PLACE_MAX;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = near.x + dx;
      const y = near.y + dy;
      if (!inBounds(map, x, y)) continue;
      const d = Math.hypot(dx, dy);
      if (d < PLACE_MIN || d > PLACE_MAX) continue;
      const idx = tileIndex(map, x, y);
      if (!siteFree(ctx, idx, placement.kind === "terrain" && !relaxed)) continue;
      if (placement.kind === "terrain") {
        const name = TERRAIN_NAMES[map.terrain[idx] as number];
        // `relaxed`: no suitable terrain anywhere near — settle for any dry land rather than leave a
        // processor without inputs.
        if (!relaxed && !(placement.terrain as readonly string[]).includes(name as string))
          continue;
        // Keep same-type raw producers from stacking on each other.
        if (ctx.work.some((i) => i.type === type && Math.hypot(i.x - x, i.y - y) < 4)) continue;
      } else if (placement.kind === "nearCity" || placement.kind === "nearForestOrCity") {
        const maxCity = placement.maxTilesFromCity;
        const nearCity = cities.some((c) =>
          c.tiles.some(
            (t) => Math.hypot((t % map.width) - x, Math.floor(t / map.width) - y) <= maxCity,
          ),
        );
        if (!nearCity) continue;
      } else continue; // coastal ports are never chain inputs
      out.push(idx);
    }
  }
  if (placement.kind === "nearForestOrCity") {
    const forested = out.filter((idx) =>
      isNearForest(map, idx % map.width, Math.floor(idx / map.width), 6),
    );
    if (forested.length > 0) return forested;
  }
  return out;
}

function addIndustry(ctx: Ctx, type: IndustryType, idx: number): Industry {
  const industry: Industry = {
    id: -1,
    type,
    x: idx % ctx.map.width,
    y: Math.floor(idx / ctx.map.width),
  };
  ctx.map.industryId[idx] = 0; // occupied; real ids are assigned by the final renumbering
  ctx.work.push(industry);
  return industry;
}

/** Tries to add a source for the `alts` group next to `processor`, then feeds that source in turn. */
function placeSource(
  ctx: Ctx,
  processor: Industry,
  alts: readonly IndustryType[],
  depth: number,
  relaxed: boolean,
): boolean {
  const options = alts.filter((t) => eraOk(t, ctx.startYear));
  // Deterministic rotation of which alternative is tried first.
  const first = options.length > 0 ? nextInt(ctx.rng, 0, options.length - 1) : 0;
  for (let k = 0; k < options.length; k++) {
    const type = options[(first + k) % options.length] as IndustryType;
    const sites = candidateSites(ctx, type, processor, relaxed);
    if (sites.length === 0) continue;
    const idx = sites[nextInt(ctx.rng, 0, sites.length - 1)] as number;
    const added = addIndustry(ctx, type, idx);
    if (depth < 3) feed(ctx, added, depth + 1, relaxed);
    return true;
  }
  return false;
}

/** Makes sure every input group of `processor` has a source in range; returns false if it can't. */
function feed(ctx: Ctx, processor: Industry, depth: number, relaxed = false): boolean {
  let all = true;
  for (const group of inputGroups(processor.type)) {
    const alts = group.filter((t) => eraOk(t, ctx.startYear));
    if (alts.length === 0) continue;
    // Satisfied by a source in range that is itself fed (a starved Steel Mill does not count).
    const fed = ctx.work.some(
      (i) =>
        alts.includes(i.type) &&
        i !== processor &&
        Math.hypot(i.x - processor.x, i.y - processor.y) <= CHAIN_MAX_DISTANCE_TILES &&
        chainIsComplete(ctx.work, i, ctx.startYear, new Set([processor])),
    );
    if (fed) continue;
    if (!placeSource(ctx, processor, alts, depth, relaxed)) all = false;
  }
  return all;
}

/** Moves `processor` to the best city-side site where its inputs already exist; false if none. */
function relocate(ctx: Ctx, processor: Industry): boolean {
  const { map, cities } = ctx;
  const placement = INDUSTRIES[processor.type].placement;
  if (placement.kind !== "nearCity" && placement.kind !== "nearForestOrCity") return false;
  const satisfied = (x: number, y: number): boolean =>
    inputGroups(processor.type).every((group) => {
      const alts = group.filter((t) => eraOk(t, ctx.startYear));
      if (alts.length === 0) return true;
      const have = nearestOf(ctx.work, alts, { x, y }, processor);
      return have !== undefined && have.distance <= CHAIN_MAX_DISTANCE_TILES - 3;
    });
  const sites: number[] = [];
  const seen = new Set<number>();
  for (const city of cities) {
    for (const t of city.tiles) {
      const cx = t % map.width;
      const cy = Math.floor(t / map.width);
      const r = Math.ceil(placement.maxTilesFromCity);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.hypot(dx, dy) > placement.maxTilesFromCity) continue;
          if (!inBounds(map, cx + dx, cy + dy)) continue;
          const idx = tileIndex(map, cx + dx, cy + dy);
          if (seen.has(idx)) continue;
          seen.add(idx);
          if (siteFree(ctx, idx) && satisfied(cx + dx, cy + dy)) sites.push(idx);
        }
      }
    }
  }
  if (sites.length === 0) return false;
  const idx = sites[nextInt(ctx.rng, 0, sites.length - 1)] as number;
  map.industryId[processor.y * map.width + processor.x] = -1;
  processor.x = idx % map.width;
  processor.y = Math.floor(idx / map.width);
  map.industryId[idx] = 0;
  return true;
}

/** Runs the pass and returns the final, sequentially numbered industry list (`map.industryId` is
 * rewritten to match). With nothing to fix the result equals the input. */
export function ensureIndustryChains(
  map: GameMap,
  rng: RngState,
  cities: readonly City[],
  industries: readonly Industry[],
  startYear: number,
  options: ChainOptions = {},
): Industry[] {
  const ctx: Ctx = { map, rng, cities, work: industries.map((i) => ({ ...i })), startYear };
  const originals = new Set(ctx.work);

  // At least one Factory, or there is no chain to Goods at all: put one next to the biggest city.
  const factoryOk = eraOk("factory", startYear);
  if (factoryOk && !ctx.work.some((i) => i.type === "factory") && cities.length > 0) {
    const big = [...cities].sort((a, b) => b.population - a.population)[0] as City;
    const sites = candidateSites(ctx, "factory", { x: big.anchorX, y: big.anchorY });
    // candidateSites keeps a minimum distance from `near`; also allow tiles right at the city.
    if (sites.length > 0) {
      addIndustry(ctx, "factory", sites[nextInt(rng, 0, sites.length - 1)] as number);
    }
  }

  for (let pass = 0; pass < 3; pass++) {
    for (const processor of [...ctx.work]) {
      if (!PROCESSOR_TYPES.includes(processor.type)) continue;
      if (feed(ctx, processor, 0)) continue;
      const movable = !options.keepExisting && originals.has(processor);
      // Best: move the processor to where its inputs already are (generated maps only).
      if (movable && relocate(ctx, processor) && feed(ctx, processor, 0)) continue;
      // Region maps keep every hand-placed processor, so there settle for any dry land for the
      // missing producer; generated maps drop a processor that cannot be fed instead (a raw
      // producer must stay on its own terrain).
      if (options.keepExisting && feed(ctx, processor, 0, true)) continue;
      if (movable && !chainIsComplete(ctx.work, processor, startYear)) {
        map.industryId[processor.y * map.width + processor.x] = -1;
        ctx.work.splice(ctx.work.indexOf(processor), 1);
      }
    }
  }

  // Renumber: ids are indices into the industry list.
  const result = ctx.work.map((i, id) => ({ ...i, id }));
  for (const i of result) map.industryId[i.y * map.width + i.x] = i.id;
  return result;
}
