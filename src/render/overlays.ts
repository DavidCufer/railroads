/**
 * Map overlays (SPEC §10.2's "Overlays" menu, Phase 9): all-station catchments, a per-cargo supply
 * heatmap, track-type colors, and train profit colors. Each is a standalone draw call, toggled
 * independently from the ☰ menu (src/ui/menuPanel.ts) and composited on top of the normal scene in
 * src/main.ts's render loop — none of them mutate state, matching every other renderer here.
 */
import { CARGO, type CargoType } from "../data/cargo";
import { locomotiveById } from "../data/trains";
import { STATION_TYPE_DEFS } from "../data/stations";
import type { StationEconomy } from "../sim/stations/economy";
import { stationCatchmentTiles } from "../sim/stations/placement";
import type { Station } from "../sim/stations/types";
import type { GameMap } from "../sim/map/types";
import type { TrackGraph } from "../sim/track/graph";
import type { Train } from "../sim/trains/types";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "../sim/time";
import { Camera, TILE_SIZE } from "./camera";
import {
  OVERLAY_CATCHMENT_BORDER,
  OVERLAY_CATCHMENT_FILL,
  OVERLAY_PROFIT_BAD,
  OVERLAY_PROFIT_GOOD,
  OVERLAY_PROFIT_NEUTRAL,
  OVERLAY_TRACK_DOUBLE,
  OVERLAY_TRACK_ELECTRIFIED,
  OVERLAY_TRACK_SINGLE,
} from "./palette";

function tileWorldOrigin(tile: number, mapWidth: number): [number, number] {
  return [(tile % mapWidth) * TILE_SIZE, Math.floor(tile / mapWidth) * TILE_SIZE];
}

/** Tints every built station's catchment (SPEC §10.2's "catchment of all stations"). */
export function drawCatchmentsOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  map: GameMap,
  stations: readonly Station[],
): void {
  const size = TILE_SIZE * camera.zoom;
  ctx.save();
  ctx.fillStyle = OVERLAY_CATCHMENT_FILL;
  const painted = new Set<number>();
  for (const station of stations) {
    const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
    for (const tile of stationCatchmentTiles(map, station.tile, radius)) {
      if (painted.has(tile)) continue;
      painted.add(tile);
      const [wx, wy] = tileWorldOrigin(tile, map.width);
      const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
      if (s.x < -size || s.y < -size || s.x > viewportW + size || s.y > viewportH + size) continue;
      ctx.fillRect(s.x, s.y, size + 0.5, size + 0.5);
    }
  }
  ctx.strokeStyle = OVERLAY_CATCHMENT_BORDER;
  ctx.lineWidth = Math.max(1, camera.zoom);
  for (const station of stations) {
    const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
    const [wx, wy] = tileWorldOrigin(station.tile, map.width);
    const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
    const span = (radius * 2 + 1) * size;
    ctx.strokeRect(s.x - radius * size, s.y - radius * size, span, span);
  }
  ctx.restore();
}

/** Heat-tints station catchments by their supply of one cargo (SPEC §10.2's "cargo supply
 * heatmap per cargo") — brighter/more opaque where more is supplied, using that cargo's own color
 * (same palette the waiting-cargo bars and delivery labels already use) so it reads consistently
 * with the rest of the UI. */
export function drawCargoHeatmapOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  map: GameMap,
  stations: readonly Station[],
  stationEconomy: ReadonlyMap<number, StationEconomy>,
  cargo: CargoType,
): void {
  const size = TILE_SIZE * camera.zoom;
  const color = CARGO[cargo].color;
  ctx.save();
  for (const station of stations) {
    const supply = stationEconomy.get(station.id)?.supply[cargo] ?? 0;
    if (supply <= 0) continue;
    const alpha = Math.min(0.6, 0.12 + supply / 200);
    ctx.fillStyle = withAlphaHex(color, alpha);
    const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
    for (const tile of stationCatchmentTiles(map, station.tile, radius)) {
      const [wx, wy] = tileWorldOrigin(tile, map.width);
      const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
      if (s.x < -size || s.y < -size || s.x > viewportW + size || s.y > viewportH + size) continue;
      ctx.fillRect(s.x, s.y, size + 0.5, size + 0.5);
    }
  }
  ctx.restore();
}

function withAlphaHex(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Recolors every track edge by single/double/electrified (SPEC §10.2) — a flat, high-contrast
 * overlay independent of the normal track renderer's own (subtler) tie/catenary rendering, meant
 * to be readable even at low zoom. */
export function drawTrackTypeOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  mapWidth: number,
  trackGraph: TrackGraph,
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, 3 * camera.zoom);
  for (const edge of trackGraph.allEdges()) {
    const color = edge.electrified
      ? OVERLAY_TRACK_ELECTRIFIED
      : edge.double
        ? OVERLAY_TRACK_DOUBLE
        : OVERLAY_TRACK_SINGLE;
    const ax = (edge.a % mapWidth) * TILE_SIZE + TILE_SIZE / 2;
    const ay = Math.floor(edge.a / mapWidth) * TILE_SIZE + TILE_SIZE / 2;
    const bx = (edge.b % mapWidth) * TILE_SIZE + TILE_SIZE / 2;
    const by = Math.floor(edge.b / mapWidth) * TILE_SIZE + TILE_SIZE / 2;
    const sa = camera.worldToScreen(ax, ay, viewportW, viewportH);
    const sb = camera.worldToScreen(bx, by, viewportW, viewportH);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Profit heuristic for a train (Phase 9's "train profit colors" overlay): average lifetime
 * revenue per day compared with its locomotive's daily maintenance cost. There's no full per-train
 * P&L (that would need attributing track/station upkeep down to individual trains), so this is a
 * deliberately simple proxy — good enough to flag "this train basically never delivers anything"
 * at a glance, which is the overlay's actual job. */
function profitColor(train: Train, nowTicks: number): string {
  const loco = locomotiveById(train.locoModelId);
  if (!loco) return OVERLAY_PROFIT_NEUTRAL;
  const ageDays = (nowTicks - train.purchaseTick) / HOURS_PER_DAY;
  if (ageDays < 30) return OVERLAY_PROFIT_NEUTRAL; // too new to judge yet
  const avgDailyRevenue = train.lifetimeRevenue / ageDays;
  const dailyMaintenance = loco.maintenancePerYear / DAYS_PER_YEAR;
  if (avgDailyRevenue > dailyMaintenance * 1.5) return OVERLAY_PROFIT_GOOD;
  if (avgDailyRevenue < dailyMaintenance * 0.5) return OVERLAY_PROFIT_BAD;
  return OVERLAY_PROFIT_NEUTRAL;
}

/** Draws a colored ring under each train's current position (SPEC §10.2) — composited *before*
 * the normal train sprites so the loco/cars still render crisply on top. */
export function drawTrainProfitOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  trains: readonly Train[],
  nowTicks: number,
): void {
  const r = Math.max(6, TILE_SIZE * camera.zoom * 0.42);
  ctx.save();
  for (const train of trains) {
    const s = camera.worldToScreen(
      train.renderToX * TILE_SIZE,
      train.renderToY * TILE_SIZE,
      viewportW,
      viewportH,
    );
    if (s.x < -r || s.y < -r || s.x > viewportW + r || s.y > viewportH + r) continue;
    ctx.fillStyle = profitColor(train, nowTicks);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
