/**
 * Built station rendering (SPEC §6.1: "platform + building, bigger for terminals") and labels.
 * Stations are few enough per game (dozens, not thousands like track/terrain) that drawing them
 * directly every frame — no offscreen chunk cache — is simplest and plenty fast.
 */
import type { StationType } from "../data/stations";
import type { CityTier } from "../data/cities";
import type { City } from "../sim/economy/types";
import { Camera, TILE_SIZE } from "./camera";
import { cityWorldCenter } from "./labels";
import {
  STATION_BUILDING_COLOR,
  STATION_BUILDING_ROOF_COLOR,
  STATION_LABEL_COLOR,
  STATION_PLATFORM_COLOR,
} from "./palette";
import type { Station } from "../sim/stations/types";

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

    ctx.lineWidth = Math.max(2, FONT_PX * 0.22);
    ctx.strokeStyle = "rgba(10, 12, 16, 0.75)";
    ctx.strokeText(station.name, s.x, labelY);

    ctx.fillStyle = STATION_LABEL_COLOR;
    ctx.fillText(station.name, s.x, labelY);
  }
}
