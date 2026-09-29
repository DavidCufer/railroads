/**
 * Built station rendering (SPEC §6.1: "platform + building, bigger for terminals") and labels.
 * Stations are few enough per game (dozens, not thousands like track/terrain) that drawing them
 * directly every frame — no offscreen chunk cache — is simplest and plenty fast.
 */
import type { CityTier } from "../data/cities";
import type { City } from "../sim/economy/types";
import { DIRS8 } from "../sim/map/grid";
import type { GameMap } from "../sim/map/types";
import type { GameState } from "../sim/state";
import type { TrackGraph } from "../sim/track/graph";
import type { TrackEdge } from "../sim/track/types";
import { Camera, TILE_SIZE } from "./camera";
import { ChunkCache } from "./chunkCache";
import { cityWorldCenter, measureTextWidthCached } from "./labels";
import { STATION_LABEL_COLOR } from "./palette";
import {
  drawStationArt,
  stationArtBottom,
  stationArtTop,
  type StationArtOptions,
  type StationMarkerType,
} from "./stationArt";
import type { Station } from "../sim/stations/types";
import { footprintTiles, layoutStation, localObstacles, type StationLayout } from "./stationLayout";
import { DOUBLE_TRACK_SPACING_TILES } from "./trackPath";
import { intersectsReserved, type ReservedScreenRect } from "./reservedRects";

/** Matches labels.ts's TIER_FONT_PX — used here only to estimate a city label's rendered height,
 * to know how far below it a station label needs to sit to clear it (Phase 5 review carry-over:
 * a station inside a city's footprint had its name collide with the city's own label). */
const CITY_TIER_FONT_PX: Record<CityTier, number> = {
  village: 11,
  town: 13,
  city: 16,
  metropolis: 19,
};

function tileWorldOrigin(tile: number, mapWidth: number): [number, number] {
  return [(tile % mapWidth) * TILE_SIZE, Math.floor(tile / mapWidth) * TILE_SIZE];
}

/** Track direction at the station, folded so the building never ends up upside down. */
function stationAngle(dirIndex: number): number {
  const [dx, dy] = DIRS8[dirIndex] as readonly [number, number];
  return dx < 0 || (dx === 0 && dy < 0) ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx);
}

/** Clearance from the track centre line to the platform edge: past the rails' tie ends. */
const PLATFORM_CLEARANCE = 0.17;

/** Active improvements at `station`, in a fixed display order (SPEC §6.2). */
function activeImprovements(station: Station): StationMarkerType[] {
  const list: StationMarkerType[] = [];
  if (station.hasEngineShed) list.push("engineShed");
  if (station.hasWaterTower) list.push("waterTower");
  list.push(...station.improvements);
  return list;
}

/** Tiles of unbroken straight track continuing from `tile` along direction `dirIndex` (capped). */
function straightReach(
  graph: TrackGraph,
  tile: number,
  dirIndex: number,
  mapWidth: number,
): number {
  const [dx, dy] = DIRS8[dirIndex] as readonly [number, number];
  let n = 0;
  let cur = tile;
  for (; n < 3; n++) {
    const x = (cur % mapWidth) + dx;
    const y = Math.floor(cur / mapWidth) + dy;
    const next = y * mapWidth + x;
    if (x < 0 || y < 0 || !graph.hasEdge(cur, next)) break;
    cur = next;
  }
  // A diagonal step is √2 long along the track.
  return n * Math.hypot(dx, dy);
}

/** Everything the station renderers need to know about the world around the stations. */
export interface StationWorld {
  map: GameMap;
  stations: readonly Station[];
  graph: TrackGraph;
  /** Changes whenever track or map content changes (`trackVersion`, `mapContentVersion`). */
  version: string;
}

export function stationWorldOf(state: GameState): StationWorld {
  return {
    map: state.map,
    stations: state.stations,
    graph: state.trackGraph,
    version: `${state.trackVersion}|${state.mapContentVersion}`,
  };
}

/** Direction (DIRS8 index, as seen from the station tile) of the line the station stands on: the pair of
 * opposite edges if there is one (a branch added later must not turn the platforms), preferring a passing
 * loop; otherwise the only edge. */
function stationDirection(graph: TrackGraph, tile: number): { dir: number; loop: boolean } | null {
  const edges = graph.edgesAt(tile);
  if (edges.length === 0) return null;
  const outward = (e: TrackEdge): number => (e.a === tile ? e.direction : (e.direction + 4) % 8);
  let best: { dir: number; loop: boolean; score: number } | null = null;
  for (const e of edges) {
    const dir = outward(e);
    const opposite = edges.find((o) => o !== e && outward(o) === (dir + 4) % 8);
    const score = (e.double ? 4 : 0) + (opposite ? 2 : 0) + (opposite?.double ? 1 : 0);
    if (!best || score > best.score) best = { dir, loop: e.double === true, score };
  }
  return best ? { dir: best.dir, loop: best.loop } : null;
}

interface SiteInfo {
  angle: number;
  near: number;
  loop: boolean;
  reach: readonly [number, number];
  layout: StationLayout;
}

/** Radius (tiles) around a station scanned for things its art must keep clear of. */
const SITE_RADIUS = 5;

function computeSite(station: Station, world: StationWorld): SiteInfo {
  const { graph, map } = world;
  const width = map.width;
  const found = stationDirection(graph, station.tile);
  const dirIndex = found ? found.dir : 0;
  const angle = found ? stationAngle(dirIndex) : 0;
  const [fdx, fdy] = DIRS8[dirIndex] as readonly [number, number];
  const forward = fdx < 0 || (fdx === 0 && fdy < 0) ? (dirIndex + 4) % 8 : dirIndex;
  const loop = found?.loop === true;
  const near = loop ? DOUBLE_TRACK_SPACING_TILES / 2 + 0.16 : PLATFORM_CLEARANCE;
  const reach: [number, number] = found
    ? [
        straightReach(graph, station.tile, (forward + 4) % 8, width),
        straightReach(graph, station.tile, forward, width),
      ]
    : [0, 0];
  const sx = station.tile % width;
  const sy = Math.floor(station.tile / width);
  // Foreign track (edges touching tiles near the station) and blocked tiles (industries, other stations).
  const tracks: Array<[number, number, number, number]> = [];
  const seen = new Set<number>();
  const squares: Array<[number, number, number]> = [];
  const others = new Set<number>();
  for (const o of world.stations) if (o.tile !== station.tile) others.add(o.tile);
  for (
    let y = Math.max(0, sy - SITE_RADIUS);
    y <= Math.min(map.height - 1, sy + SITE_RADIUS);
    y++
  ) {
    for (let x = Math.max(0, sx - SITE_RADIUS); x <= Math.min(width - 1, sx + SITE_RADIUS); x++) {
      const t = y * width + x;
      for (const e of graph.edgesAt(t)) {
        const key = Math.min(e.a, e.b) * map.width * map.height + Math.max(e.a, e.b);
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push([
          (e.a % width) + 0.5,
          Math.floor(e.a / width) + 0.5,
          (e.b % width) + 0.5,
          Math.floor(e.b / width) + 0.5,
        ]);
      }
      if ((map.industryId[t] as number) >= 0) squares.push([x, y, 0]);
      else if (others.has(t)) squares.push([x, y, 0.6]);
    }
  }
  const obstacles = localObstacles(sx + 0.5, sy + 0.5, angle, tracks, squares);
  const layout = layoutStation(
    { type: station.type, near, loop, reach, improvements: activeImprovements(station) },
    obstacles,
  );
  return { angle, near, loop, reach, layout };
}

const siteCache = new Map<number, { key: string; site: SiteInfo }>();

function siteFor(station: Station, world: StationWorld): SiteInfo {
  const key = `${world.version}|${world.stations.length}|${activeImprovements(station).join(",")}|${station.type}`;
  const hit = siteCache.get(station.id);
  if (hit && hit.key === key) return hit.site;
  const site = computeSite(station, world);
  siteCache.set(station.id, { key, site });
  return site;
}

/** Everything the station art needs for one station at the current graph state. */
function artOptions(station: Station, world: StationWorld, size: number): StationArtOptions {
  const site = siteFor(station, world);
  return {
    type: station.type,
    u: size,
    angle: site.angle,
    near: site.near,
    loop: site.loop,
    layout: site.layout,
  };
}

/** City tiles covered by any station's platforms, building or improvements: the renderer leaves the
 * houses off these tiles so the station stands on a clean site. */
export function stationFootprintCityTiles(world: StationWorld): ReadonlySet<number> {
  const key = `${world.version}|${world.stations.map((s) => `${s.id}:${s.type}:${activeImprovements(s).join(",")}`).join(";")}`;
  if (footprintMemo && footprintMemo.key === key) return footprintMemo.tiles;
  const out = new Set<number>();
  const w = world.map.width;
  for (const station of world.stations) {
    const site = siteFor(station, world);
    const sx = (station.tile % w) + 0.5;
    const sy = Math.floor(station.tile / w) + 0.5;
    for (const [tx, ty] of footprintTiles(site.layout, site.angle, sx, sy)) {
      if (tx < 0 || ty < 0 || tx >= w || ty >= world.map.height) continue;
      const t = ty * w + tx;
      if ((world.map.cityId[t] as number) >= 0) out.add(t);
    }
  }
  footprintMemo = { key, tiles: out };
  return out;
}

let footprintMemo: { key: string; tiles: ReadonlySet<number> } | null = null;

/** Half-extent of a station sprite in tiles: covers the building, platforms and improvement rows at any
 * rotation. */
const SPRITE_HALF = 3.6;
/** Sprites are baked at the smallest bucket ≥ the on-screen tile size, so they only ever shrink. */
const SPRITE_BUCKETS = [16, 24, 32, 48, 64, 96, 128, 192];
const spriteCache = new ChunkCache<HTMLCanvasElement>(24);

function spriteKey(o: StationArtOptions, bucket: number): string {
  return `${o.type}|${o.angle.toFixed(3)}|${o.near.toFixed(3)}|${o.loop ? 1 : 0}|${o.layout.key}|${bucket}`;
}

/** Station art drawn once into an offscreen sprite and blitted afterwards (static art stays cached;
 * only the blit runs per frame). */
function drawStationSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  o: StationArtOptions,
): void {
  const bucket =
    SPRITE_BUCKETS.find((b) => b >= o.u) ?? (SPRITE_BUCKETS[SPRITE_BUCKETS.length - 1] as number);
  const key = spriteKey(o, bucket);
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = document.createElement("canvas");
    const side = Math.ceil(SPRITE_HALF * 2 * bucket);
    sprite.width = side;
    sprite.height = side;
    const sctx = sprite.getContext("2d");
    if (sctx) drawStationArt(sctx, side / 2, side / 2, { ...o, u: bucket });
    spriteCache.set(key, sprite);
  }
  const scale = o.u / bucket;
  const half = (sprite.width / 2) * scale;
  ctx.drawImage(sprite, cx - half, cy - half, half * 2, half * 2);
}

/** Tiles above the station tile centre that the main building reaches (supply-bubble anchor). */
export function stationTopExtent(station: Station, world: StationWorld): number {
  return stationArtTop(artOptions(station, world, TILE_SIZE));
}

export function drawStations(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  world: StationWorld,
): void {
  const size = TILE_SIZE * camera.zoom;
  const mapWidth = world.map.width;
  for (const station of world.stations) {
    const [wx, wy] = tileWorldOrigin(station.tile, mapWidth);
    const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
    const margin = size * (SPRITE_HALF + 0.1);
    if (s.x < -margin || s.y < -margin || s.x > viewportW + margin || s.y > viewportH + margin)
      continue;
    drawStationSprite(ctx, s.x + size / 2, s.y + size / 2, artOptions(station, world, size));
  }
}

const FONT_PX = 12;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawStationLabels(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  world: StationWorld,
  cities: readonly City[] = [],
  cityIdAt: (tile: number) => number = () => -1,
  reserved: readonly ReservedScreenRect[] = [],
): void {
  const mapWidth = world.map.width;
  const stations = world.stations;
  ctx.font = `600 ${FONT_PX}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";

  for (const station of stations) {
    const [wx, wy] = tileWorldOrigin(station.tile, mapWidth);
    const s = camera.worldToScreen(wx + TILE_SIZE / 2, wy + TILE_SIZE, viewportW, viewportH);
    if (s.x < -80 || s.y < -20 || s.x > viewportW + 80 || s.y > viewportH + 20) continue;

    // A station inside a city's footprint can land its label right on top of the city's own name
    // (drawn at the footprint centroid, which the station tile may sit very close to) — if so,
    // push the station label down to clear it instead of overlapping (Phase 5 review carry-over).
    // Drop the name plate below the art (improvements included).
    const bottom = stationArtBottom(artOptions(station, world, TILE_SIZE * camera.zoom));
    let labelY = s.y - TILE_SIZE * camera.zoom * 0.5 + bottom * TILE_SIZE * camera.zoom + 2;
    const cityId = cityIdAt(station.tile);
    const city = cityId >= 0 ? cities[cityId] : undefined;
    // A station named after the city it sits in (the common case — SPEC §6.1's default naming)
    // would draw its label almost right on top of the city's own — the station building plus the
    // city label already say everything a second, identical label would (STYLE review carry-over).
    if (city && city.name === station.name) continue;
    if (city) {
      const center = cityWorldCenter(city, mapWidth);
      const cityScreen = camera.worldToScreen(center.x, center.y, viewportW, viewportH);
      const cityFontPx = CITY_TIER_FONT_PX[city.tier] * camera.zoom;
      const cityLabelBottom = cityScreen.y + cityFontPx * 0.4 + cityFontPx * 1.15;
      const stationLabelTop = labelY;
      const horizontalOverlap = Math.abs(cityScreen.x - s.x) < 90 * camera.zoom;
      if (
        horizontalOverlap &&
        stationLabelTop < cityLabelBottom &&
        labelY + FONT_PX * 1.15 > cityScreen.y
      ) {
        labelY = cityLabelBottom + 2;
      }
    }

    const halfWidth = measureTextWidthCached(ctx, ctx.font, station.name) / 2 + 5;
    if (
      intersectsReserved(
        reserved,
        s.x - halfWidth,
        labelY,
        s.x + halfWidth,
        labelY + FONT_PX * 1.2 + 4,
      )
    ) {
      continue;
    }

    // Enamel sign: navy rounded plate, cream hairline border, cream sans text.
    const plateW = halfWidth * 2 + 4;
    const plateH = FONT_PX + 6;
    const px = s.x - plateW / 2;
    const py = labelY - 2;
    ctx.fillStyle = "rgba(10, 12, 16, 0.25)";
    roundRectPath(ctx, px + 1, py + 1.5, plateW, plateH, 4);
    ctx.fill();
    ctx.fillStyle = "#1F3A5F";
    roundRectPath(ctx, px, py, plateW, plateH, 4);
    ctx.fill();
    ctx.strokeStyle = "#F2E8D5";
    ctx.lineWidth = 1;
    roundRectPath(ctx, px + 1.5, py + 1.5, plateW - 3, plateH - 3, 3);
    ctx.stroke();
    ctx.fillStyle = STATION_LABEL_COLOR;
    ctx.fillText(station.name, s.x, labelY + 1);
  }
}
