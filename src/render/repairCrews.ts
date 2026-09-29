/**
 * Repair crews on their way to a broken-down train (Phase 26A): a small procedural rail vehicle
 * (handcar, motor trolley, service truck by era) drawn moving along the track path stored on
 * `train.repairCrew`. Render only — it reads state, reserves nothing, and is skipped while the crew
 * is still waiting to leave its base.
 */
import { REPAIR_CREW_VEHICLES } from "../data/trains";
import { crewVehicle, repairCrewPosition } from "../sim/trains/repairCrew";
import type { Train } from "../sim/trains/types";
import { Camera, TILE_SIZE } from "./camera";

const BODY: Record<(typeof REPAIR_CREW_VEHICLES)[number]["vehicle"], string> = {
  handcar: "#8C6A3F",
  "motor trolley": "#C9821F",
  "service truck": "#E3B520",
};

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
  const vehicle = crewVehicle(year).vehicle;
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

    const len = Math.max(6, size * 0.7);
    const wid = Math.max(4, size * 0.4);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-len / 2 + 1, -wid / 2 + 1.5, len, wid);
    ctx.fillStyle = BODY[vehicle];
    ctx.strokeStyle = "#2B2118";
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.fillRect(-len / 2, -wid / 2, len, wid);
    ctx.strokeRect(-len / 2, -wid / 2, len, wid);
    if (vehicle === "handcar") {
      // Pump lever across the deck.
      ctx.beginPath();
      ctx.moveTo(-len * 0.15, -wid * 0.9);
      ctx.lineTo(len * 0.15, wid * 0.9);
      ctx.stroke();
    } else {
      // Cab block.
      ctx.fillStyle = "#F4EFE1";
      ctx.fillRect(-len * 0.05, -wid * 0.32, len * 0.3, wid * 0.64);
    }
    // Amber beacon so it reads as a work vehicle at low zoom.
    ctx.fillStyle = pos.arrived || ticks % 2 === 0 ? "#FFB000" : "#FF6A00";
    ctx.beginPath();
    ctx.arc(-len * 0.3, 0, Math.max(1.5, wid * 0.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
