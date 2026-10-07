/**
 * Dot markers for industries and stations when zoomed out (Phase 25B): below the zoom where the
 * baked industry art is legible each industry is a small dot in the colour of its main product and
 * each station a white-bordered dot in the station colour. They fade in between `MARKER_FADE_START`
 * and `MARKER_FULL_ZOOM`, so the art and the dot cross-fade instead of popping. Screen-space, drawn
 * every frame (a few dozen arcs); picking is tile based, so a tap on the dot's tile still hits.
 */
import { CARGO } from "../data/cargo";
import { INDUSTRIES } from "../data/industries";
import type { CargoType } from "../data/cargo";
import type { IndustryType } from "../data/industries";
import type { GameMap } from "../sim/map/types";
import type { Industry } from "../sim/economy/types";
import type { Station } from "../sim/stations/types";
import { Camera, TILE_SIZE } from "./camera";
import { MINIMAP_STATION_COLOR } from "./palette";

/** Zoom at (and below) which markers are fully opaque. */
export const MARKER_FULL_ZOOM = 0.5;
/** Zoom at (and above) which markers are gone. */
export const MARKER_FADE_START = 0.8;
export const INDUSTRY_MARKER_RADIUS_PX = 5;
export const STATION_MARKER_RADIUS_PX = 4;

export function markerAlpha(zoom: number): number {
  const t = (MARKER_FADE_START - zoom) / (MARKER_FADE_START - MARKER_FULL_ZOOM);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** The cargo whose colour marks an industry: its biggest product, else its first input. */
export function mainCargoOf(type: IndustryType): CargoType | null {
  const def = INDUSTRIES[type];
  let best: CargoType | null = null;
  let bestAmount = 0;
  for (const [cargo, amount] of Object.entries(def.produces) as Array<[CargoType, number]>) {
    if (amount > bestAmount) {
      best = cargo;
      bestAmount = amount;
    }
  }
  return (
    best ??
    (Object.keys(def.consumes)[0] as CargoType | undefined) ??
    // a pure customer (the Mint) is coloured by what it buys
    (Object.keys(def.acceptancePoints)[0] as CargoType | undefined) ??
    null
  );
}

export function industryMarkerColor(type: IndustryType): string {
  const cargo = mainCargoOf(type);
  return cargo ? CARGO[cargo].color : "#B8BDC4";
}

function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  outline: string,
  outlineWidth: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

export function drawZoomMarkers(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  map: GameMap,
  industries: readonly Industry[],
  stations: readonly Station[],
): void {
  const alpha = markerAlpha(camera.zoom);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const m = INDUSTRY_MARKER_RADIUS_PX + 4;
  industries.forEach((ind, i) => {
    // Only industries the map still lists on their tile (demolition/tests clear the map).
    if ((map.industryId[ind.y * map.width + ind.x] as number) !== i) return;
    const s = camera.worldToScreen(
      (ind.x + 0.5) * TILE_SIZE,
      (ind.y + 0.5) * TILE_SIZE,
      viewportW,
      viewportH,
    );
    if (s.x < -m || s.y < -m || s.x > viewportW + m || s.y > viewportH + m) return;
    // Light halo first, so a dark fill (coal) still reads on dark ground, then the dark outline.
    dot(
      ctx,
      s.x,
      s.y,
      INDUSTRY_MARKER_RADIUS_PX + 1.2,
      "rgba(255,255,255,0.55)",
      "rgba(0,0,0,0)",
      0,
    );
    dot(
      ctx,
      s.x,
      s.y,
      INDUSTRY_MARKER_RADIUS_PX - 0.75,
      industryMarkerColor(ind.type),
      "rgba(14,14,18,0.95)",
      1.5,
    );
  });
  for (const st of stations) {
    const x = st.tile % map.width;
    const y = Math.floor(st.tile / map.width);
    const s = camera.worldToScreen(
      (x + 0.5) * TILE_SIZE,
      (y + 0.5) * TILE_SIZE,
      viewportW,
      viewportH,
    );
    if (s.x < -m || s.y < -m || s.x > viewportW + m || s.y > viewportH + m) continue;
    dot(ctx, s.x, s.y, STATION_MARKER_RADIUS_PX, MINIMAP_STATION_COLOR, "#FFFFFF", 2);
    ctx.beginPath();
    ctx.arc(s.x, s.y, STATION_MARKER_RADIUS_PX + 1.25, 0, Math.PI * 2);
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = "rgba(14,14,18,0.8)";
    ctx.stroke();
  }
  ctx.restore();
}
