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
import { drawImprovementMarker, drawStationBuilding, type StationMarkerType } from "./stationArt";
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
  return dx < 0 ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx);
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

/** Draws a small row of improvement markers below the station's platform (SPEC §6.2, Phase 9) —
 * caps how many render per station so a heavily-improved one doesn't spill markers into the tile
 * below (there are only 8 possible, so this rarely matters, but wraps to a second row past 4). */
function drawImprovementMarkers(
  ctx: CanvasRenderingContext2D,
  station: Station,
  px: number,
  py: number,
  size: number,
): void {
  const improvements = activeImprovements(station);
  if (improvements.length === 0 || size < TILE_SIZE * 0.6) return;
  const cx = px + size / 2;
  const rowY = py + size * 0.98;
  const r = size * 0.17;
  const spacing = size * 0.44;
  const perRow = 3;
  improvements.forEach((type, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const countThisRow = Math.min(perRow, improvements.length - row * perRow);
    const startX = cx - ((countThisRow - 1) * spacing) / 2;
    drawImprovementMarker(ctx, type, startX + col * spacing, rowY + row * spacing, r);
  });
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
    if (s.x < -size || s.y < -size || s.x > viewportW + size || s.y > viewportH + size) continue;
    const edges = graph.edgesAt(station.tile);
    const doubleEdge = edges.find((e) => e.double);
    const edge = doubleEdge ?? edges[0];
    const angle = edge ? stationAngle(edge.direction) : 0;
    // A passing loop keeps the building beyond the outer lane's rail (PLAN 16.1: never under rails).
    const near = doubleEdge
      ? size * (DOUBLE_TRACK_SPACING_TILES / 2 + 0.16)
      : size * PLATFORM_CLEARANCE;
    drawStationBuilding(
      ctx,
      station.type,
      s.x + size / 2,
      s.y + size / 2,
      size,
      angle,
      near,
      -1,
      doubleEdge !== undefined,
    );
    drawImprovementMarkers(ctx, station, s.x, s.y, size);
  }
}

const FONT_PX = 12;

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
    // Drop the label below the improvement markers' rows (zoom ≥ 0.6, three per row).
    const markerRows =
      camera.zoom * TILE_SIZE >= TILE_SIZE * 0.6
        ? Math.ceil(activeImprovements(station).length / 3)
        : 0;
    let labelY = s.y + 2 + markerRows * TILE_SIZE * camera.zoom * 0.44;
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

    const halfWidth = measureTextWidthCached(ctx, ctx.font, station.name) / 2 + 4;
    if (
      intersectsReserved(reserved, s.x - halfWidth, labelY, s.x + halfWidth, labelY + FONT_PX * 1.2)
    ) {
      continue;
    }

    ctx.lineWidth = Math.max(2, FONT_PX * 0.22);
    ctx.strokeStyle = "rgba(10, 12, 16, 0.75)";
    ctx.strokeText(station.name, s.x, labelY);

    ctx.fillStyle = STATION_LABEL_COLOR;
    ctx.fillText(station.name, s.x, labelY);
  }
}
