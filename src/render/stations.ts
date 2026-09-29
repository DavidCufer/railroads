/**
 * Built station rendering (SPEC §6.1: "platform + building, bigger for terminals") and labels.
 * Stations are few enough per game (dozens, not thousands like track/terrain) that drawing them
 * directly every frame — no offscreen chunk cache — is simplest and plenty fast.
 */
import type { CityTier } from "../data/cities";
import type { City } from "../sim/economy/types";
import { DIRS8 } from "../sim/map/grid";
import type { TrackGraph } from "../sim/track/graph";
import { Camera, TILE_SIZE } from "./camera";
import { cityWorldCenter, measureTextWidthCached } from "./labels";
import { STATION_LABEL_COLOR } from "./palette";
import {
  drawStationArt,
  stationArtBottom,
  type StationArtOptions,
  type StationMarkerType,
} from "./stationArt";
import type { Station } from "../sim/stations/types";
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

/** Everything the station art needs for one station at the current graph state. */
function artOptions(
  station: Station,
  graph: TrackGraph,
  mapWidth: number,
  size: number,
): StationArtOptions {
  const edges = graph.edgesAt(station.tile);
  const doubleEdge = edges.find((e) => e.double);
  const edge = doubleEdge ?? edges[0];
  const dirIndex = edge ? edge.direction : 0;
  const angle = edge ? stationAngle(dirIndex) : 0;
  // Forward is the folded direction the art's +x axis follows; the graph edge may point either way.
  const [fdx, fdy] = DIRS8[dirIndex] as readonly [number, number];
  const forward = fdx < 0 || (fdx === 0 && fdy < 0) ? (dirIndex + 4) % 8 : dirIndex;
  const near = doubleEdge ? DOUBLE_TRACK_SPACING_TILES / 2 + 0.16 : PLATFORM_CLEARANCE;
  return {
    type: station.type,
    u: size,
    angle,
    near,
    loop: doubleEdge !== undefined,
    reach: edge
      ? [
          straightReach(graph, station.tile, (forward + 4) % 8, mapWidth),
          straightReach(graph, station.tile, forward, mapWidth),
        ]
      : [0, 0],
    improvements: activeImprovements(station),
  };
}

export function drawStations(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  mapWidth: number,
  stations: readonly Station[],
  graph: TrackGraph,
): void {
  const size = TILE_SIZE * camera.zoom;
  for (const station of stations) {
    const [wx, wy] = tileWorldOrigin(station.tile, mapWidth);
    const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
    const margin = size * 3.5;
    if (s.x < -margin || s.y < -margin || s.x > viewportW + margin || s.y > viewportH + margin)
      continue;
    drawStationArt(ctx, s.x + size / 2, s.y + size / 2, artOptions(station, graph, mapWidth, size));
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
  mapWidth: number,
  stations: readonly Station[],
  cities: readonly City[] = [],
  cityIdAt: (tile: number) => number = () => -1,
  reserved: readonly ReservedScreenRect[] = [],
  graph?: TrackGraph,
): void {
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
    const bottom = graph
      ? stationArtBottom(artOptions(station, graph, mapWidth, TILE_SIZE * camera.zoom))
      : 0.5;
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
