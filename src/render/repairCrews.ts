/**
 * Repair crews on their way to a broken-down train (Phase 26A): a small procedural rail vehicle
 * (engine with tool van, crane wagon, motor tractor, service truck by era) drawn moving along the track path stored on
 * `train.repairCrew`. Render only — it reads state, reserves nothing, and is skipped while the crew
 * is still waiting to leave its base.
 */
import { repairCrewPosition } from "../sim/trains/repairCrew";
import type { Train } from "../sim/trains/types";
import { CREW_L, CREW_W, crewTrainCanvas, crewTrainKind } from "./art/repairCrewSprite";
import { devicePixelRatioNow } from "./pixelSnap";
import { Camera, TILE_SIZE } from "./camera";
import { VEHICLE_WIDTH_TILES } from "./trains";

export function drawRepairCrews(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  mapWidth: number,
  trains: readonly Train[],
  ticks: number,
  year: number,
): void {
  const kind = crewTrainKind(year);
  const dpr = devicePixelRatioNow();
  const size = TILE_SIZE * camera.zoom;
  for (const train of trains) {
    const crew = train.repairCrew;
    if (!crew || train.breakdownTicksLeft <= 0) continue;
    if (ticks - crew.startTick < crew.dispatchTicks) continue; // still at the shed
    const pos = repairCrewPosition(mapWidth, crew, ticks);
    if (!pos) continue;
    const ahead = repairCrewPosition(mapWidth, crew, ticks + 2) ?? pos;
    const angle =
      ahead.x === pos.x && ahead.y === pos.y ? 0 : Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
    // Once arrived, stand beside the broken train rather than on top of its nose.
    const offset = pos.arrived ? 0.35 : 0;
    const p = camera.worldToScreen(
      (pos.x + offset) * TILE_SIZE,
      (pos.y - offset) * TILE_SIZE,
      viewportW,
      viewportH,
    );
    if (p.x < -size || p.y < -size || p.x > viewportW + size || p.y > viewportH + size) continue;

    // As wide as a train (owner play-test: at 1.5 tiles long it was over twice a train's width), so about a loco long.
    const len = Math.max(10, size * VEHICLE_WIDTH_TILES * (CREW_L / CREW_W));
    const sprite = crewTrainCanvas(kind, len);
    const scale = len / (sprite.width / dpr);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(-len / 2 + 1, -len * 0.14, len, len * 0.3);
    ctx.drawImage(
      sprite as CanvasImageSource,
      (-sprite.width / 2) * scale,
      (-sprite.height / 2) * scale,
      sprite.width * scale,
      sprite.height * scale,
    );
    // Amber beacon so it reads as a work vehicle at low zoom.
    ctx.fillStyle = pos.arrived || ticks % 2 === 0 ? "#FFB000" : "#FF6A00";
    ctx.beginPath();
    ctx.arc(len * 0.04, 0, Math.max(1.5, len * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
