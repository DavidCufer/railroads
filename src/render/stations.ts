/**
 * Built station rendering (SPEC §6.1: "platform + building, bigger for terminals") and labels.
 * Stations are few enough per game (dozens, not thousands like track/terrain) that drawing them
 * directly every frame — no offscreen chunk cache — is simplest and plenty fast.
 */
import type { StationImprovementType, StationType } from "../data/stations";
import type { CityTier } from "../data/cities";
import type { City } from "../sim/economy/types";
import { Camera, TILE_SIZE } from "./camera";
import { cityWorldCenter } from "./labels";
import {
  STATION_BUILDING_COLOR,
  STATION_BUILDING_ROOF_COLOR,
  STATION_IMPROVEMENT_COLORS,
  STATION_LABEL_COLOR,
  STATION_PLATFORM_COLOR,
} from "./palette";
import type { Station } from "../sim/stations/types";
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

/** Building half-width (fraction of a tile) and platform length by type — visibly bigger for a
 * terminal than a depot, per SPEC §6.1. */
/* Phase 5 review carry-over: a Terminal needs to read as clearly bigger than a Depot, not just a
 * slightly larger version of the same box — so the terminal building here is nearly double the
 * depot's linear size (not ~1.5×) on top of getting the second roof block. */
const TYPE_SCALE: Record<StationType, { building: number; platform: number; roofCount: number }> = {
  depot: { building: 0.3, platform: 0.5, roofCount: 1 },
  station: { building: 0.42, platform: 0.75, roofCount: 1 },
  terminal: { building: 0.58, platform: 0.95, roofCount: 2 },
};

function drawStationIcon(
  ctx: CanvasRenderingContext2D,
  type: StationType,
  px: number,
  py: number,
  size: number,
): void {
  const { building, platform, roofCount } = TYPE_SCALE[type];
  const cx = px + size / 2;
  const cy = py + size / 2;

  // Platform: a light strip along the tile, under/behind the building.
  ctx.fillStyle = STATION_PLATFORM_COLOR;
  const platformLen = size * platform;
  const platformH = size * 0.14;
  ctx.fillRect(cx - platformLen / 2, cy + size * 0.22, platformLen, platformH);

  // Building block(s), with a peaked-roof accent — a second, offset block for the terminal so it
  // reads as visibly larger/busier than a depot's single small building.
  const buildW = size * building;
  const buildH = size * building * 0.72;
  for (let i = 0; i < roofCount; i++) {
    const offset = roofCount > 1 ? (i - (roofCount - 1) / 2) * buildW * 0.9 : 0;
    const bx = cx + offset - buildW / 2;
    const by = cy - size * 0.08 - buildH;

    ctx.fillStyle = STATION_BUILDING_COLOR;
    ctx.fillRect(bx, by, buildW, buildH);

    ctx.fillStyle = STATION_BUILDING_ROOF_COLOR;
    ctx.beginPath();
    ctx.moveTo(bx - size * 0.03, by);
    ctx.lineTo(bx + buildW / 2, by - buildH * 0.45);
    ctx.lineTo(bx + buildW + size * 0.03, by);
    ctx.closePath();
    ctx.fill();
  }
}

/** Marker type drawn beside a station — the six generic improvements plus Engine Shed/Water Tower,
 * which keep their own bespoke boolean fields (Phase 6/8) rather than living in
 * `station.improvements`. */
type StationMarkerType = StationImprovementType | "engineShed" | "waterTower";

/** Active improvements at `station`, in a fixed display order (SPEC §6.2). */
function activeImprovements(station: Station): StationMarkerType[] {
  const list: StationMarkerType[] = [];
  if (station.hasEngineShed) list.push("engineShed");
  if (station.hasWaterTower) list.push("waterTower");
  list.push(...station.improvements);
  return list;
}

/** A tiny distinct-shaped marker per improvement type, small enough to sit in a row beside the
 * station building without dominating it, but clear enough at zoom >= 1 to tell at a glance which
 * improvements a station has (SPEC §6.2, Phase 9 review: "should visibly change the station
 * graphic"). Only drawn from zoom 1 up — below that the whole station icon itself is barely a few
 * px, and these would just be noise. */
function drawImprovementMarker(
  ctx: CanvasRenderingContext2D,
  type: StationMarkerType,
  cx: number,
  cy: number,
  r: number,
): void {
  const color = STATION_IMPROVEMENT_COLORS[type] ?? "#B8BDC4";
  ctx.fillStyle = color;
  switch (type) {
    case "waterTower":
      // A small tank on a stalk.
      ctx.fillRect(cx - r * 0.12, cy, r * 0.24, r);
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "hotel":
      // A taller block with a small peaked roof.
      ctx.fillRect(cx - r * 0.5, cy - r * 0.3, r, r * 1.3);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy - r * 0.3);
      ctx.lineTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    case "postOffice":
      // A small envelope.
      ctx.fillRect(cx - r * 0.65, cy - r * 0.45, r * 1.3, r * 0.9);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.65, cy - r * 0.45);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + r * 0.65, cy - r * 0.45);
      ctx.stroke();
      break;
    case "warehouse":
      // A wide barn-like block.
      ctx.fillRect(cx - r * 0.75, cy - r * 0.5, r * 1.5, r);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy - r * 0.5);
      ctx.lineTo(cx, cy - r * 1.0);
      ctx.lineTo(cx + r * 0.85, cy - r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case "coldStorage":
      // A pale box with a snowflake dot.
      ctx.fillRect(cx - r * 0.55, cy - r * 0.55, r * 1.1, r * 1.1);
      ctx.fillStyle = "#2E5E8C";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "freightYard":
      // Two short parallel siding lines.
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, r * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r * 0.3);
      ctx.lineTo(cx + r * 0.7, cy - r * 0.3);
      ctx.moveTo(cx - r * 0.7, cy + r * 0.3);
      ctx.lineTo(cx + r * 0.7, cy + r * 0.3);
      ctx.stroke();
      break;
    case "livestockPens":
      // A small fenced square.
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, r * 0.22);
      ctx.strokeRect(cx - r * 0.55, cy - r * 0.55, r * 1.1, r * 1.1);
      break;
    case "engineShed":
    default:
      // A small shed with a round "wheel" accent.
      ctx.fillRect(cx - r * 0.55, cy - r * 0.35, r * 1.1, r * 0.9);
      ctx.fillStyle = "#B59A5C";
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.1, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
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
  const rowY = py + size * 0.78;
  const r = size * 0.09;
  const spacing = size * 0.24;
  const perRow = 4;
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
): void {
  const size = TILE_SIZE * camera.zoom;
  for (const station of stations) {
    const [wx, wy] = tileWorldOrigin(station.tile, mapWidth);
    const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
    if (s.x < -size || s.y < -size || s.x > viewportW + size || s.y > viewportH + size) continue;
    drawStationIcon(ctx, station.type, s.x, s.y, size);
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
    let labelY = s.y + 2;
    const cityId = cityIdAt(station.tile);
    const city = cityId >= 0 ? cities[cityId] : undefined;
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

    const halfWidth = ctx.measureText(station.name).width / 2 + 4;
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
