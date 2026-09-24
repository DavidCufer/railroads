/**
 * Station-mode catchment overlay (SPEC §6.1: "the catchment overlay is shown while choosing —
 * tiles tinted"), shown while the placement panel's type picker is open so the tint grows/shrinks
 * live as the player taps Depot/Station/Terminal.
 */
import { Camera, TILE_SIZE } from "./camera";
import {
  STATION_CATCHMENT_BLOCKED_FILL,
  STATION_CATCHMENT_BORDER,
  STATION_CATCHMENT_FILL,
} from "./palette";

export interface StationCatchmentPreview {
  /** The tile the station would sit on. */
  tile: number;
  /** Every tile in its catchment (including `tile` itself). */
  catchment: readonly number[];
  /** False if this site can't actually take a station (wrong shape, already occupied). */
  ok: boolean;
}

function tileWorldOrigin(tile: number, mapWidth: number): [number, number] {
  return [(tile % mapWidth) * TILE_SIZE, Math.floor(tile / mapWidth) * TILE_SIZE];
}

export function drawStationCatchment(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  mapWidth: number,
  preview: StationCatchmentPreview,
): void {
  const fill = preview.ok ? STATION_CATCHMENT_FILL : STATION_CATCHMENT_BLOCKED_FILL;
  const size = TILE_SIZE * camera.zoom;

  ctx.save();
  ctx.fillStyle = fill;
  for (const tile of preview.catchment) {
    const [wx, wy] = tileWorldOrigin(tile, mapWidth);
    const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
    ctx.fillRect(s.x, s.y, size + 0.5, size + 0.5);
  }

  // Ring on the station tile itself so it reads distinctly from the tint.
  const [cwx, cwy] = tileWorldOrigin(preview.tile, mapWidth);
  const center = camera.worldToScreen(
    cwx + TILE_SIZE / 2,
    cwy + TILE_SIZE / 2,
    viewportW,
    viewportH,
  );
  ctx.strokeStyle = STATION_CATCHMENT_BORDER;
  ctx.lineWidth = Math.max(1.5, 2.5 * camera.zoom);
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(4, TILE_SIZE * 0.28 * camera.zoom), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
