/** Default station naming (SPEC §6.1: "defaults to the nearest city name, with 'Junction',
 * 'Mine', 'Crossing' etc. suffixes when not in a city, e.g. 'Harlow Coal Mine'"). */
import { INDUSTRIES } from "../../data/industries";
import type { StationType } from "../../data/stations";
import { STATION_TYPE_DEFS } from "../../data/stations";
import type { City, Industry } from "../economy/types";
import type { TrackGraph } from "../track/graph";
import type { GameMap } from "../map/types";
import { stationCatchmentTiles } from "./placement";

function nearestCity(map: GameMap, cities: readonly City[], tile: number): City | null {
  const cx = tile % map.width;
  const cy = Math.floor(tile / map.width);
  let best: City | null = null;
  let bestDist = Infinity;
  for (const city of cities) {
    for (const t of city.tiles) {
      const tx = t % map.width;
      const ty = Math.floor(t / map.width);
      const d = Math.hypot(tx - cx, ty - cy);
      if (d < bestDist) {
        bestDist = d;
        best = city;
      }
    }
  }
  return best;
}

/** Nearest industry within `tile`'s catchment for the given station type, if any (the "Coal
 * Mine" in "Harlow Coal Mine"). */
function nearestIndustryInCatchment(
  map: GameMap,
  industries: readonly Industry[],
  tile: number,
  type: StationType,
): Industry | null {
  const cx = tile % map.width;
  const cy = Math.floor(tile / map.width);
  const catchment = stationCatchmentTiles(map, tile, STATION_TYPE_DEFS[type].catchmentRadius);
  let best: Industry | null = null;
  let bestDist = Infinity;
  for (const idx of catchment) {
    const industryId = map.industryId[idx] as number;
    if (industryId < 0) continue;
    const industry = industries[industryId];
    if (!industry) continue;
    const ix = idx % map.width;
    const iy = Math.floor(idx / map.width);
    const d = Math.hypot(ix - cx, iy - cy);
    if (d < bestDist) {
      bestDist = d;
      best = industry;
    }
  }
  return best;
}

/** True if a track junction (3+ edges) sits directly next to `tile` — the "Junction" suffix case.
 * (`tile` itself can never be a junction: only a dead-end or straight-through tile can take a
 * station at all, per src/sim/stations/placement.ts.) */
function nextToJunction(graph: TrackGraph, tile: number): boolean {
  return graph.neighborsOf(tile).some((n) => graph.edgesAt(n).length >= 3);
}

/** Picks a default name for a new station at `tile`, avoiding any name already in `existingNames`
 * by appending " 2", " 3", etc. */
export function defaultStationName(
  map: GameMap,
  graph: TrackGraph,
  cities: readonly City[],
  industries: readonly Industry[],
  tile: number,
  type: StationType,
  existingNames: ReadonlySet<string>,
): string {
  let base: string;
  const cityId = map.cityId[tile] as number;
  if (cityId >= 0 && cities[cityId]) {
    base = (cities[cityId] as City).name;
  } else {
    const nearest = nearestCity(map, cities, tile);
    if (!nearest) {
      base = STATION_TYPE_DEFS[type].name;
    } else {
      const industry = nearestIndustryInCatchment(map, industries, tile, type);
      if (industry) {
        base = `${nearest.name} ${INDUSTRIES[industry.type].name}`;
      } else if (nextToJunction(graph, tile)) {
        base = `${nearest.name} Junction`;
      } else {
        base = `${nearest.name} Crossing`;
      }
    }
  }

  if (!existingNames.has(base)) return base;
  let n = 2;
  while (existingNames.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
