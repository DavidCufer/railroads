/** Places a region's real-world cities at their projected lat/lon (SPEC §4.3 step 1/4). */
import { CITY_TIER_DEFS } from "../../src/data/cities";
import { growFootprint, isCoastal } from "../../src/sim/economy/cities";
import type { City } from "../../src/sim/economy/types";
import { inBounds, tileIndex } from "../../src/sim/map/grid";
import { terrainId } from "../../src/sim/map/terrain";
import type { GameMap } from "../../src/sim/map/types";
import type { RngState } from "../../src/sim/rng";
import { project } from "./geo";
import type { RegionDef } from "./regionDef";

const WATER_ID = terrainId("water");
const MOUNTAIN_ID = terrainId("mountain");

function isBuildableLand(map: GameMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  const t = map.terrain[tileIndex(map, x, y)] as number;
  return t !== WATER_ID && t !== MOUNTAIN_ID;
}

/** Nearest tile to (x0,y0) satisfying `ok`, searching outward rings — the hand-authored coastline
 * is a simplification, so a real city's projected point can land just offshore or on a mountain
 * tile; snap it to the closest sensible site rather than failing. */
function nearestTile(
  map: GameMap,
  x0: number,
  y0: number,
  ok: (x: number, y: number) => boolean,
  maxRadius = 10,
): [number, number] {
  if (ok(x0, y0)) return [x0, y0];
  for (let r = 1; r <= maxRadius; r++) {
    let best: [number, number] | null = null;
    let bestDist = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (!ok(x, y)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = [x, y];
        }
      }
    }
    if (best) return best;
  }
  return [x0, y0];
}

export function placeRegionCities(map: GameMap, def: RegionDef, rng: RngState): City[] {
  const claimed = new Uint8Array(map.width * map.height);
  const cities: City[] = [];
  for (let i = 0; i < def.cities.length; i++) {
    const c = def.cities[i]!;
    const [px, py] = project(def.bounds, [c.lon, c.lat]);
    const isLand = (x: number, y: number): boolean => isBuildableLand(map, x, y);
    const [landX, landY] = nearestTile(map, Math.round(px), Math.round(py), isLand);
    // `growFootprint` unconditionally claims its anchor tile, so two real cities close enough for
    // their footprints to touch (e.g. Baltimore/Washington, ~4 tiles apart at this resolution)
    // could otherwise get the same anchor once the first city's growth reaches it — nudge to the
    // nearest still-unclaimed land tile instead of colliding.
    const [ax, ay] = nearestTile(
      map,
      landX,
      landY,
      (x, y) => isLand(x, y) && claimed[tileIndex(map, x, y)] === 0,
    );
    const tierDef = CITY_TIER_DEFS[c.tier];
    const span = tierDef.maxPop - tierDef.minPop;
    const frac = span > 0 ? Math.max(0, Math.min(1, (c.population - tierDef.minPop) / span)) : 0.5;
    const targetTiles = Math.max(
      1,
      Math.round(tierDef.minTiles + frac * (tierDef.maxTiles - tierDef.minTiles)),
    );
    const tiles = growFootprint(map, rng, ax, ay, targetTiles, claimed);
    const city: City = {
      id: i,
      name: c.name,
      tier: c.tier,
      population: c.population,
      anchorX: ax,
      anchorY: ay,
      tiles,
      coastal: false,
      ...(c.foundingYear !== undefined ? { foundingYear: c.foundingYear } : {}),
    };
    city.coastal = isCoastal(map, city);
    cities.push(city);
  }
  // Reserve every city's footprint (including cities not yet founded, SPEC §4.3) so industry
  // placement doesn't put a mine or mill on land that's slated to become part of a city.
  for (const city of cities) {
    for (const idx of city.tiles) map.cityId[idx] = city.id;
  }
  return cities;
}
