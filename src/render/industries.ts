/**
 * Industry icon rendering (SPEC §8.2, §10.3): recognizable little icons per industry type — a mine
 * headframe, logging camp trees + saw, farm silo, ranch fence, steel mill chimneys, etc. — rather
 * than colored squares. Drawn per tile, baked into the terrain chunk cache.
 */
import type { IndustryType } from "../data/industries";
import { INDUSTRY_COLORS } from "./palette";

function drawSmoke(ctx: CanvasRenderingContext2D, cx: number, topY: number, r: number): void {
  ctx.fillStyle = INDUSTRY_COLORS.smoke;
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, topY - r * 0.4, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INDUSTRY_COLORS.smokeDark;
  ctx.beginPath();
  ctx.arc(cx + r * 0.3, topY - r * 1.1, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Mine headframe: an A-frame tower over a small dark shed, plus a spoil-heap dot pattern. */
function drawHeadframe(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  accent: string,
): void {
  const baseX = px + size * 0.35;
  const baseY = py + size * 0.85;
  const towerH = size * 0.55;
  const topX = px + size * 0.5;
  const topY = baseY - towerH;

  ctx.strokeStyle = INDUSTRY_COLORS.metalDark;
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(topX, topY);
  ctx.lineTo(px + size * 0.65, baseY);
  ctx.moveTo(px + size * 0.42, baseY - towerH * 0.4);
  ctx.lineTo(px + size * 0.58, baseY - towerH * 0.4);
  ctx.stroke();

  // wheel at the top of the headframe
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(topX, topY, size * 0.08, 0, Math.PI * 2);
  ctx.stroke();

  // shed at the base
  ctx.fillStyle = INDUSTRY_COLORS.metal;
  ctx.fillRect(px + size * 0.15, py + size * 0.72, size * 0.28, size * 0.2);

  // small spoil heap
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(px + size * 0.78, py + size * 0.82, size * 0.12, Math.PI, 0);
  ctx.fill();
}

function drawTree(ctx: CanvasRenderingContext2D, cx: number, baseY: number, h: number): void {
  ctx.fillStyle = INDUSTRY_COLORS.timberDark;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - h);
  ctx.lineTo(cx - h * 0.35, baseY);
  ctx.lineTo(cx + h * 0.35, baseY);
  ctx.closePath();
  ctx.fill();
}

/** Logging camp: a couple of pine trees, a log pile, and a circular saw blade. */
function drawLoggingCamp(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
): void {
  drawTree(ctx, px + size * 0.22, py + size * 0.55, size * 0.32);
  drawTree(ctx, px + size * 0.35, py + size * 0.6, size * 0.26);

  // log pile
  ctx.fillStyle = INDUSTRY_COLORS.timber;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(
      px + size * 0.62,
      py + size * (0.62 - i * 0.08),
      size * 0.16,
      size * 0.05,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // saw blade
  const scx = px + size * 0.68;
  const scy = py + size * 0.82;
  const r = size * 0.13;
  ctx.fillStyle = INDUSTRY_COLORS.metal;
  ctx.beginPath();
  ctx.arc(scx, scy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INDUSTRY_COLORS.metalDark;
  ctx.lineWidth = Math.max(1, size * 0.02);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(scx + Math.cos(a) * r, scy + Math.sin(a) * r);
    ctx.lineTo(scx + Math.cos(a) * r * 1.35, scy + Math.sin(a) * r * 1.35);
    ctx.stroke();
  }
}

/** Farm: a silo (cylinder + dome) beside small hatched field rows. */
function drawFarm(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.strokeStyle = INDUSTRY_COLORS.crop;
  ctx.lineWidth = Math.max(1, size * 0.03);
  for (let i = 0; i < 4; i++) {
    const y = py + size * (0.55 + i * 0.09);
    ctx.beginPath();
    ctx.moveTo(px + size * 0.05, y);
    ctx.lineTo(px + size * 0.5, y);
    ctx.stroke();
  }

  const siloX = px + size * 0.72;
  const siloTop = py + size * 0.32;
  const siloW = size * 0.2;
  const siloH = size * 0.42;
  ctx.fillStyle = INDUSTRY_COLORS.concrete;
  ctx.fillRect(siloX - siloW / 2, siloTop, siloW, siloH);
  ctx.beginPath();
  ctx.ellipse(siloX, siloTop, siloW / 2, siloW / 3, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = Math.max(1, size * 0.015);
  ctx.beginPath();
  ctx.moveTo(siloX, siloTop);
  ctx.lineTo(siloX, siloTop + siloH);
  ctx.stroke();
}

/** Ranch: a small square corral fence with posts. */
function drawRanch(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  const left = px + size * 0.2;
  const right = px + size * 0.8;
  const top = py + size * 0.45;
  const bottom = py + size * 0.85;
  ctx.strokeStyle = INDUSTRY_COLORS.timber;
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.strokeRect(left, top, right - left, bottom - top);
  ctx.beginPath();
  ctx.moveTo(left, (top + bottom) / 2);
  ctx.lineTo(right, (top + bottom) / 2);
  ctx.stroke();
  ctx.fillStyle = INDUSTRY_COLORS.timberDark;
  for (const [x, y] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ]) {
    ctx.beginPath();
    ctx.arc(x as number, y as number, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Oil well: a nodding-donkey pumpjack — an A-frame support holding a tilted walking beam with a
 * counterweight on one end and a horsehead on the other, dipping down to a wellhead, plus an oil
 * puddle accent. Deliberately distinct from the mine headframe's straight tower + wheel.
 */
function drawOilWell(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  const baseY = py + size * 0.82;
  const pivotX = px + size * 0.52;
  const pivotY = py + size * 0.45;

  ctx.strokeStyle = INDUSTRY_COLORS.metalDark;
  ctx.lineWidth = Math.max(1, size * 0.035);
  // A-frame support holding the pivot.
  ctx.beginPath();
  ctx.moveTo(pivotX - size * 0.09, baseY);
  ctx.lineTo(pivotX, pivotY);
  ctx.lineTo(pivotX + size * 0.09, baseY);
  ctx.stroke();

  // Tilted walking beam through the pivot.
  const beamHalf = size * 0.26;
  const tilt = size * 0.1;
  const leftX = pivotX - beamHalf;
  const leftY = pivotY - tilt;
  const rightX = pivotX + beamHalf;
  const rightY = pivotY + tilt;
  ctx.beginPath();
  ctx.moveTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.stroke();

  // Counterweight on the left, horsehead on the right.
  ctx.fillStyle = INDUSTRY_COLORS.metal;
  ctx.beginPath();
  ctx.arc(leftX, leftY, size * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(rightX, rightY, size * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Rod from the horsehead down to the wellhead.
  ctx.beginPath();
  ctx.moveTo(rightX, rightY);
  ctx.lineTo(rightX, baseY - size * 0.05);
  ctx.stroke();
  ctx.fillStyle = INDUSTRY_COLORS.metalDark;
  ctx.fillRect(rightX - size * 0.035, baseY - size * 0.06, size * 0.07, size * 0.07);

  // Oil puddle accent.
  ctx.fillStyle = "rgba(30, 28, 24, 0.55)";
  ctx.beginPath();
  ctx.ellipse(px + size * 0.78, py + size * 0.82, size * 0.06, size * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A brick building block with `count` chimneys, each puffing smoke. */
function drawChimneyBuilding(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  count: number,
  wallColor: string,
): void {
  const buildingTop = py + size * 0.5;
  ctx.fillStyle = wallColor;
  ctx.fillRect(px + size * 0.15, buildingTop, size * 0.7, size * 0.35);

  for (let i = 0; i < count; i++) {
    const cx = px + size * (0.3 + i * (0.4 / Math.max(1, count - 1 || 1)));
    const chimneyH = size * (0.25 + (i % 2) * 0.08);
    const top = buildingTop - chimneyH;
    ctx.fillStyle = INDUSTRY_COLORS.metalDark;
    ctx.fillRect(cx - size * 0.04, top, size * 0.08, chimneyH);
    drawSmoke(ctx, cx, top, size * 0.09);
  }
}

/** Steel mill: three chimneys over a metal building. */
function drawSteelMill(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  drawChimneyBuilding(ctx, px, py, size, 3, INDUSTRY_COLORS.metal);
}

/** Sawmill: a timber building with a circular saw blade on its face. */
function drawSawmill(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = INDUSTRY_COLORS.timber;
  ctx.fillRect(px + size * 0.18, py + size * 0.42, size * 0.5, size * 0.43);
  ctx.beginPath();
  ctx.moveTo(px + size * 0.18, py + size * 0.42);
  ctx.lineTo(px + size * 0.43, py + size * 0.25);
  ctx.lineTo(px + size * 0.68, py + size * 0.42);
  ctx.closePath();
  ctx.fill();

  const scx = px + size * 0.72;
  const scy = py + size * 0.68;
  const r = size * 0.14;
  ctx.fillStyle = INDUSTRY_COLORS.metal;
  ctx.beginPath();
  ctx.arc(scx, scy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INDUSTRY_COLORS.metalDark;
  ctx.lineWidth = Math.max(1, size * 0.02);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(scx + Math.cos(a) * r * 0.6, scy + Math.sin(a) * r * 0.6);
    ctx.lineTo(scx + Math.cos(a) * r * 1.25, scy + Math.sin(a) * r * 1.25);
    ctx.stroke();
  }
}

/** Food plant: a building with two small storage tanks. */
function drawFoodPlant(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = INDUSTRY_COLORS.brick;
  ctx.fillRect(px + size * 0.15, py + size * 0.5, size * 0.45, size * 0.35);
  for (let i = 0; i < 2; i++) {
    const tx = px + size * (0.68 + i * 0.14);
    ctx.fillStyle = INDUSTRY_COLORS.concrete;
    ctx.fillRect(tx - size * 0.05, py + size * 0.4, size * 0.1, size * 0.42);
    ctx.beginPath();
    ctx.ellipse(tx, py + size * 0.4, size * 0.05, size * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Factory: a brick building with two chimneys. */
function drawFactory(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  drawChimneyBuilding(ctx, px, py, size, 2, INDUSTRY_COLORS.brick);
}

/** Refinery: tall cylindrical tanks linked by pipes, with a small flare stack. */
function drawRefinery(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  for (let i = 0; i < 3; i++) {
    const tx = px + size * (0.25 + i * 0.2);
    const topY = py + size * (0.35 + (i % 2) * 0.08);
    ctx.fillStyle = INDUSTRY_COLORS.metal;
    ctx.fillRect(tx - size * 0.06, topY, size * 0.12, size * 0.5 - (topY - py));
    ctx.beginPath();
    ctx.ellipse(tx, topY, size * 0.06, size * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = INDUSTRY_COLORS.metalDark;
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath();
  ctx.moveTo(px + size * 0.25, py + size * 0.85);
  ctx.lineTo(px + size * 0.65, py + size * 0.85);
  ctx.stroke();

  // flare stack
  const flareX = px + size * 0.82;
  ctx.strokeStyle = INDUSTRY_COLORS.metalDark;
  ctx.beginPath();
  ctx.moveTo(flareX, py + size * 0.85);
  ctx.lineTo(flareX, py + size * 0.35);
  ctx.stroke();
  ctx.fillStyle = INDUSTRY_COLORS.flame;
  ctx.beginPath();
  ctx.arc(flareX, py + size * 0.3, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

/** Port: a small pier with a loading crane. */
function drawPort(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = INDUSTRY_COLORS.timber;
  ctx.fillRect(px + size * 0.1, py + size * 0.6, size * 0.75, size * 0.14);

  const craneX = px + size * 0.35;
  const baseY = py + size * 0.6;
  ctx.strokeStyle = INDUSTRY_COLORS.metalDark;
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.beginPath();
  ctx.moveTo(craneX, baseY);
  ctx.lineTo(craneX, py + size * 0.22);
  ctx.lineTo(craneX + size * 0.35, py + size * 0.32);
  ctx.stroke();

  ctx.fillStyle = INDUSTRY_COLORS.water;
  ctx.fillRect(px + size * 0.55, py + size * 0.78, size * 0.35, size * 0.16);

  // a shipping-crate block on the pier
  ctx.fillStyle = INDUSTRY_COLORS.brick;
  ctx.fillRect(px + size * 0.14, py + size * 0.48, size * 0.16, size * 0.12);
}

const ICON_DRAWERS: Record<
  IndustryType,
  (ctx: CanvasRenderingContext2D, px: number, py: number, size: number) => void
> = {
  coalMine: (ctx, px, py, size) => drawHeadframe(ctx, px, py, size, "#2A2A2A"),
  ironMine: (ctx, px, py, size) => drawHeadframe(ctx, px, py, size, "#A3583E"),
  loggingCamp: drawLoggingCamp,
  farm: drawFarm,
  ranch: drawRanch,
  oilWell: drawOilWell,
  steelMill: drawSteelMill,
  sawmill: drawSawmill,
  foodPlant: drawFoodPlant,
  factory: drawFactory,
  refinery: drawRefinery,
  port: drawPort,
};

export function drawIndustryIcon(
  ctx: CanvasRenderingContext2D,
  type: IndustryType,
  px: number,
  py: number,
  size: number,
): void {
  ICON_DRAWERS[type](ctx, px, py, size);
}
