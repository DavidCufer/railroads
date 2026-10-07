/**
 * The long-haul chain (Phase 40): one valuable chain per map, present from the first day and spread far apart.
 * Silver (mine -> Smelter -> Mint) for games that start before 1940, uranium (mine -> Enrichment Plant -> Nuclear
 * Power Plant) after. The customer (Mint / Power Plant) stands next to one of the biggest towns; the mine and the
 * processor are placed so each leg is at least a third of the map and all three lie on one landmass, so a railway can
 * reach them. Deterministic: only the passed rng (a copy of the map's stream, see createGameState) is used.
 */
import {
  INDUSTRIES,
  LONG_HAUL_ATTEMPTS,
  LONG_HAUL_EDGE_MARGIN,
  LONG_HAUL_LEG_MAP_FRACTION,
  LONG_HAUL_LEG_MAX_MULT,
  LONG_HAUL_RELAX,
  LONG_HAUL_SINK_CITY_RANKS,
  LONG_HAUL_SPAN_MULT,
  longHaulChainFor,
  type IndustryType,
} from "../../data/industries";
import { inBounds, tileIndex } from "../map/grid";
import { terrainId, TERRAIN_TYPES as TERRAIN_NAMES } from "../map/terrain";
import type { GameMap } from "../map/types";
import { nextInt, type RngState } from "../rng";
import { allCityTiles, cityBufferMask, tooCloseToIndustry } from "./spacing";
import type { City, Industry } from "./types";

const WATER_ID = terrainId("water");
const MOUNTAIN_ID = terrainId("mountain");

/** Connected-land labels (8-neighbour, water breaks them); -1 on water. */
function landComponents(map: GameMap): Int32Array {
  const label = new Int32Array(map.width * map.height).fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let start = 0; start < label.length; start++) {
    if (label[start] !== -1 || (map.terrain[start] as number) === WATER_ID) continue;
    label[start] = next;
    stack.push(start);
    while (stack.length > 0) {
      const t = stack.pop() as number;
      const x = t % map.width;
      const y = Math.floor(t / map.width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!inBounds(map, x + dx, y + dy)) continue;
          const n = tileIndex(map, x + dx, y + dy);
          if (label[n] !== -1 || (map.terrain[n] as number) === WATER_ID) continue;
          label[n] = next;
          stack.push(n);
        }
    }
    next++;
  }
  return label;
}

const dist = (map: GameMap, a: number, b: number): number =>
  Math.hypot(
    (a % map.width) - (b % map.width),
    Math.floor(a / map.width) - Math.floor(b / map.width),
  );

function pickFrom(rng: RngState, list: readonly number[]): number {
  return list[nextInt(rng, 0, list.length - 1)] as number;
}

/** Adds the chain's three industries (ids continue `industries`, `map.industryId` is updated) and returns the new
 * list; the input is returned unchanged when the map has no room for the chain (tiny or shattered maps). */
export function addLongHaulChain(
  map: GameMap,
  rng: RngState,
  cities: readonly City[],
  industries: readonly Industry[],
  startYear: number,
): Industry[] {
  const chain = longHaulChainFor(startYear);
  const mineDef = INDUSTRIES[chain.mine];
  const mineTerrain: readonly string[] =
    mineDef.placement.kind === "chain" ? (mineDef.placement.terrain ?? []) : [];
  const sinkRadius =
    INDUSTRIES[chain.sink].placement.kind === "chain"
      ? ((INDUSTRIES[chain.sink].placement as { nearCityTiles?: number }).nearCityTiles ?? 8)
      : 8;

  const land = landComponents(map);
  const cityMask = cityBufferMask(map, allCityTiles(map));
  const free = (idx: number, allowMountain: boolean): boolean => {
    const t = map.terrain[idx] as number;
    if (t === WATER_ID || (t === MOUNTAIN_ID && !allowMountain)) return false;
    const x = idx % map.width;
    const y = Math.floor(idx / map.width);
    if (
      x < LONG_HAUL_EDGE_MARGIN ||
      y < LONG_HAUL_EDGE_MARGIN ||
      x >= map.width - LONG_HAUL_EDGE_MARGIN ||
      y >= map.height - LONG_HAUL_EDGE_MARGIN
    )
      return false;
    if (map.cityId[idx] !== -1 || map.industryId[idx] !== -1) return false;
    return (
      (cityMask[idx] as number) === 0 &&
      !tooCloseToIndustry(idx % map.width, Math.floor(idx / map.width), industries)
    );
  };

  const onMineTerrain: number[] = [];
  const anyLand: number[] = [];
  for (let idx = 0; idx < land.length; idx++) {
    if ((land[idx] as number) < 0 || !free(idx, true)) continue;
    const name = TERRAIN_NAMES[map.terrain[idx] as number] as string;
    if (mineTerrain.includes(name)) onMineTerrain.push(idx);
    if ((map.terrain[idx] as number) !== MOUNTAIN_ID) anyLand.push(idx);
  }
  if (onMineTerrain.length === 0 && anyLand.length === 0) return [...industries];

  const towns = cities
    .filter((c) => c.tiles.length > 0)
    .sort((a, b) => b.population - a.population || a.id - b.id)
    .slice(0, LONG_HAUL_SINK_CITY_RANKS);
  const baseLeg = LONG_HAUL_LEG_MAP_FRACTION * Math.max(map.width, map.height);

  for (const relax of LONG_HAUL_RELAX) {
    const leg = baseLeg * relax;
    const legMax = baseLeg * LONG_HAUL_LEG_MAX_MULT;
    for (const town of towns) {
      const centre = town.anchorY * map.width + town.anchorX;
      const sinkSites = anyLand.filter(
        (idx) => dist(map, idx, centre) <= sinkRadius && (land[idx] as number) === land[centre],
      );
      if (sinkSites.length === 0) continue;
      for (let attempt = 0; attempt < LONG_HAUL_ATTEMPTS; attempt++) {
        const sink = pickFrom(rng, sinkSites);
        const component = land[sink] as number;
        const mines = (onMineTerrain.length > 0 ? onMineTerrain : anyLand).filter(
          (idx) =>
            (land[idx] as number) === component &&
            dist(map, idx, sink) >= leg * LONG_HAUL_SPAN_MULT &&
            dist(map, idx, sink) <= legMax * 1.5,
        );
        if (mines.length === 0) break;
        const mine = pickFrom(rng, mines);
        const processors = anyLand.filter(
          (idx) =>
            (land[idx] as number) === component &&
            dist(map, idx, mine) >= leg &&
            dist(map, idx, mine) <= legMax &&
            dist(map, idx, sink) >= leg &&
            dist(map, idx, sink) <= legMax &&
            !tooCloseToIndustry(idx % map.width, Math.floor(idx / map.width), [
              { x: mine % map.width, y: Math.floor(mine / map.width) },
              { x: sink % map.width, y: Math.floor(sink / map.width) },
            ]),
        );
        if (processors.length === 0) continue;
        const processor = pickFrom(rng, processors);
        const out = [...industries];
        const add = (type: IndustryType, idx: number): void => {
          const id = out.length;
          map.industryId[idx] = id;
          out.push({ id, type, x: idx % map.width, y: Math.floor(idx / map.width) });
        };
        add(chain.mine, mine);
        add(chain.processor, processor);
        add(chain.sink, sink);
        return out;
      }
    }
  }
  return [...industries];
}
