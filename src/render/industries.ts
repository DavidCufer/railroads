/**
 * Industry art (SPEC §8.2, §10.3; STYLE §10, PLAN 21.1): each industry is a small top-down building
 * cluster about 2×2 tiles across (the sim's footprint is one tile; the art spills half a tile each
 * way), lit from the upper left with shadows to the lower right, and distinct at zoom 1 without
 * labels: mine headframe + spoil heap + rail spur, logging camp with log stacks, sawmill with log
 * piles and sawdust, steel mill with a blast furnace, chimneys and a warm glow, farm with house,
 * barn and silo, pumpjacks on a dirt pad, refinery tanks and tower, saw-tooth factory, and so on.
 * Drawn in tile units (origin = the industry tile's top-left) and baked into the terrain chunk
 * cache; chimney *smoke* is live (`industrySmokeSources`).
 */
import type { IndustryType } from "../data/industries";
import {
  chimneyTop,
  darken,
  flat,
  gable,
  ground,
  lighten,
  line,
  logPile,
  makePaint,
  mound,
  SHADOW,
  spur,
  tank,
  treeTop,
  type Paint,
} from "./mapShapes";

type Draw = (p: Paint) => void;

/** How far the art extends past the industry tile on each side, in tiles. */
export const INDUSTRY_ART_MARGIN = 0.5;

/** The drawings are laid out on a 2x2 tile box; this enlarges them about the tile centre. */
const ART_SCALE = 1.2;

/** Saw-tooth factory roof: repeating lit slope / shaded slope / glazing bands. */
function sawtooth(
  p: Paint,
  x: number,
  y: number,
  w: number,
  h: number,
  teeth: number,
  color: string,
): void {
  const { ctx, px } = p;
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + 0.05, y + 0.065, w, h);
  ctx.fillStyle = darken(color, 0.5);
  ctx.fillRect(x - px, y - px, w + px * 2, h + px * 2);
  const tw = w / teeth;
  for (let i = 0; i < teeth; i++) {
    const tx = x + tw * i;
    ctx.fillStyle = lighten(color, 0.16);
    ctx.fillRect(tx, y, tw * 0.6, h);
    ctx.fillStyle = darken(color, 0.68);
    ctx.fillRect(tx + tw * 0.6, y, tw * 0.22, h);
    ctx.fillStyle = "#A9CAD6";
    ctx.fillRect(tx + tw * 0.82, y, tw * 0.18, h);
    if (p.detail) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(tx + tw * 0.82, y, tw * 0.05, h);
    }
  }
  if (p.detail) {
    ctx.strokeStyle = "rgba(20, 12, 6, 0.5)";
    ctx.lineWidth = px;
    ctx.strokeRect(x, y, w, h);
  }
}

/** Rocky headframe: A-frame legs with cross bracing and a winding wheel, long shadow. */
function headframe(p: Paint, x: number, y: number, s: number, frame: string): void {
  const { ctx, px } = p;
  // Tall structure → long shadow.
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.moveTo(x + s, y + s);
  ctx.lineTo(x + s + 0.32, y + s + 0.4);
  ctx.lineTo(x + s * 0.5 + 0.32, y + s + 0.4);
  ctx.lineTo(x, y + s);
  ctx.closePath();
  ctx.fill();
  // Concrete footing.
  ctx.fillStyle = "#6E6A62";
  ctx.fillRect(x - 0.03, y - 0.03, s + 0.06, s + 0.06);
  // Two legs (thick), cross braces.
  ctx.strokeStyle = frame;
  ctx.lineWidth = Math.max(s * 0.2, px * 2);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.12, y);
  ctx.lineTo(x + s * 0.12, y + s);
  ctx.moveTo(x + s * 0.88, y);
  ctx.lineTo(x + s * 0.88, y + s);
  ctx.stroke();
  ctx.lineWidth = Math.max(px * 1.4, s * 0.09);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.12, y);
  ctx.lineTo(x + s * 0.88, y + s * 0.5);
  ctx.lineTo(x + s * 0.12, y + s);
  ctx.moveTo(x + s * 0.88, y);
  ctx.lineTo(x + s * 0.12, y + s * 0.5);
  ctx.lineTo(x + s * 0.88, y + s);
  ctx.stroke();
  // Winding wheel.
  const cx = x + s / 2;
  const cy = y + s / 2;
  ctx.fillStyle = "#2B2B30";
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#D8B24A";
  ctx.lineWidth = Math.max(px * 1.4, s * 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  if (p.detail) {
    ctx.lineWidth = px * 1.2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * s * 0.26, cy + Math.sin(a) * s * 0.26);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "#D8B24A";
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

function drawMine(p: Paint, ore: string, oreHi: string, frameColor: string): void {
  ground(p, 0.5, 0.52, 0.98, 0.9, "#8F8777");
  // Rail spur running in along the bottom to a loading pile.
  spur(p, -0.4, 1.2, 0.78, 1.2);
  mound(p, 0.9, 1.18, 0.14, oreHi);
  // Spoil heap, big and dark/red, lower right.
  mound(p, 1.03, 0.72, 0.36, ore);
  // Conveyor from the headhouse to the heap.
  line(p, 0.32, 0.45, 0.88, 0.7, 0.06, "#3A3A40");
  // Headhouse shed.
  gable(p, -0.3, 0.38, 0.55, 0.36, "#7B6B5E", { height: 1.1 });
  p.ctx.fillStyle = "#2A2622";
  p.ctx.fillRect(-0.24, 0.62, 0.1, 0.08);
  headframe(p, 0.2, -0.16, 0.34, frameColor);
  // Ore cart on the spur.
  p.ctx.fillStyle = SHADOW;
  p.ctx.fillRect(0.18 + 0.03, 1.14 + 0.03, 0.34, 0.12);
  p.ctx.fillStyle = "#5A5A62";
  p.ctx.fillRect(0.18, 1.14, 0.34, 0.12);
  p.ctx.fillStyle = ore;
  p.ctx.fillRect(0.2, 1.155, 0.3, 0.09);
}

function drawCoalMine(p: Paint): void {
  drawMine(p, "#2C2C31", "#4A4A52", "#3B3B42");
}

function drawIronMine(p: Paint): void {
  drawMine(p, "#A5503A", "#C2694C", "#4B3F3A");
}

function drawLoggingCamp(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.52, 0.92, 0.84, "#AB966E");
  // Stumps.
  for (const [sx, sy] of [
    [0.05, 0.9],
    [0.2, 1.05],
    [0.95, 0.2],
  ] as const) {
    ctx.fillStyle = "#5A4128";
    ctx.beginPath();
    ctx.arc(sx, sy, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#D2B380";
    ctx.beginPath();
    ctx.arc(sx - 0.008, sy - 0.008, 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  // Log stacks.
  logPile(p, 0.35, 0.4, 0.6, 0.3, 4);
  logPile(p, 0.55, 0.8, 0.55, 0.22, 3);
  logPile(p, -0.3, 0.7, 0.42, 0.2, 3);
  // Cabin.
  gable(p, -0.25, 0.08, 0.38, 0.3, "#7A4E32", { height: 1.1 });
  ctx.fillStyle = "#EDE0BF";
  ctx.fillRect(-0.12, 0.36, 0.08, 0.03);
  // Saw blade on a frame.
  ctx.fillStyle = "#B8BCC2";
  ctx.beginPath();
  ctx.arc(0.95, 0.65, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#565A60";
  ctx.lineWidth = p.px * 1.4;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0.95 + Math.cos(a) * 0.08, 0.65 + Math.sin(a) * 0.08);
    ctx.lineTo(0.95 + Math.cos(a) * 0.11, 0.65 + Math.sin(a) * 0.11);
    ctx.stroke();
  }
  // Forest fringe.
  const trees: Array<[number, number, number, number]> = [
    [-0.32, -0.05, 0.17, 1],
    [-0.1, -0.3, 0.14, 0],
    [0.25, -0.28, 0.16, 1],
    [0.62, -0.32, 0.13, 0],
    [1.02, -0.22, 0.17, 1],
    [1.3, 0.05, 0.14, 0],
    [1.34, 0.5, 0.16, 1],
    [-0.36, 0.42, 0.13, 0],
    [-0.28, 1.05, 0.16, 1],
    [1.25, 0.98, 0.15, 0],
    [0.1, 1.3, 0.14, 1],
    [0.85, 1.32, 0.16, 0],
  ];
  for (const [tx, ty, tr, tone] of trees) treeTop(p, tx, ty, tr, tone);
}

function drawSawmill(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.52, 0.98, 0.86, "#A99468");
  // Mill shed with corrugated roof.
  gable(p, -0.3, 0.02, 1.05, 0.42, "#8B7B62", { height: 1.2 });
  if (p.detail) {
    ctx.fillStyle = "#2A2019";
    ctx.fillRect(-0.3, 0.16, 0.03, 0.14);
    for (const x of [0.0, 0.3, 0.6]) {
      ctx.fillStyle = "#3A3028";
      ctx.fillRect(x, 0.2, 0.1, 0.05);
    }
  }
  chimneyTop(p, 0.82, 0.14, 0.05, 0.34, "#5A4A3C");
  // Log intake belt from the log pile up to the mill.
  line(p, 0.1, 0.9, 0.1, 0.48, 0.06, "#5A4A3A");
  // Round log pile.
  for (const [lx, ly] of [
    [0.02, 0.98],
    [0.17, 0.96],
    [0.3, 1.0],
    [0.09, 1.11],
    [0.24, 1.12],
    [0.38, 1.14],
    [-0.06, 1.14],
    [0.16, 1.24],
    [0.3, 1.26],
  ] as const) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.arc(lx + 0.02, ly + 0.03, 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6E4A2C";
    ctx.beginPath();
    ctx.arc(lx, ly, 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#D8B88A";
    ctx.beginPath();
    ctx.arc(lx, ly, 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,80,40,0.5)";
    ctx.lineWidth = p.px;
    ctx.beginPath();
    ctx.arc(lx, ly, 0.025, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Lumber stacks: pale planks.
  for (let i = 0; i < 3; i++) {
    const y = 0.62 + i * 0.2;
    ctx.fillStyle = SHADOW;
    ctx.fillRect(0.68 + 0.03, y + 0.04, 0.62, 0.15);
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#D8BC86" : "#E6CE9C";
      ctx.fillRect(0.68, y + j * 0.0375, 0.62, 0.0375);
    }
    ctx.fillStyle = "rgba(90,60,30,0.4)";
    ctx.fillRect(0.68, y + 0.07, 0.62, p.px);
  }
  // Sawdust heap.
  mound(p, 1.0, 0.3, 0.18, "#E2CB98");
}

function drawSteelMill(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.52, 1.0, 0.9, "#8C887C");
  // Rolling mill (saw-tooth) along the bottom.
  sawtooth(p, -0.3, 0.86, 1.05, 0.42, 5, "#6E7682");
  // Slag and coke/ore heaps.
  mound(p, 1.15, 0.98, 0.24, "#8E4A38");
  mound(p, 1.22, 0.62, 0.15, "#3B3B3F");
  // Conveyor skip from the ore heap to the furnace top.
  line(p, 1.0, 0.85, 0.5, 0.42, 0.05, "#4A4E56");
  // Glow around the furnace.
  const fx = 0.32;
  const fy = 0.36;
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 0.55);
  glow.addColorStop(0, "rgba(255, 150, 60, 0.7)");
  glow.addColorStop(0.5, "rgba(255, 130, 50, 0.25)");
  glow.addColorStop(1, "rgba(255, 120, 40, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(fx, fy, 0.55, 0, Math.PI * 2);
  ctx.fill();
  // Stoves + blast furnace.
  tank(p, 0.72, 0.28, 0.1, "#8A8E96", 1.5);
  tank(p, 0.72, 0.56, 0.1, "#8A8E96", 1.5);
  tank(p, fx, fy, 0.21, "#6C7078", 2);
  ctx.fillStyle = "#F2A04A";
  ctx.beginPath();
  ctx.arc(fx - 0.02, fy - 0.02, 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFD98A";
  ctx.beginPath();
  ctx.arc(fx - 0.04, fy - 0.04, 0.045, 0, Math.PI * 2);
  ctx.fill();
  // Three chimneys with long shadows.
  for (const [sx, sy] of STEEL_MILL_STACKS) chimneyTop(p, sx, sy, 0.055, 0.32, "#55555C");
  // Furnace pipes.
  line(p, 0.5, 0.36, 0.64, 0.3, 0.035, "#4A4E56");
  line(p, 0.5, 0.42, 0.64, 0.56, 0.035, "#4A4E56");
}

function drawFarm(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.5, 0.9, 0.82, "#B8A56E");
  // Fenced yard.
  ctx.strokeStyle = "#7A5B36";
  ctx.lineWidth = p.px * 1.6;
  ctx.strokeRect(-0.2, -0.12, 1.4, 1.05);
  // Farmhouse.
  gable(p, -0.15, -0.05, 0.42, 0.3, "#8E4B3A", { wall: "#EDE3CC", height: 1.1 });
  ctx.fillStyle = "#4A3830";
  ctx.fillRect(0.14, 0.02, 0.05, 0.05);
  // Red barn.
  gable(p, 0.42, -0.05, 0.6, 0.46, "#B03830", { wall: "#8A2A24", ridgeX: false, height: 1.3 });
  if (p.detail) {
    ctx.strokeStyle = "#F0E6D0";
    ctx.lineWidth = p.px * 1.5;
    ctx.beginPath();
    ctx.moveTo(0.42, 0.41);
    ctx.lineTo(1.02, 0.41);
    ctx.stroke();
  }
  // Silos.
  tank(p, 1.12, 0.12, 0.12, "#C6C9CE", 1.6);
  tank(p, 1.12, 0.42, 0.09, "#C6C9CE", 1.3);
  // Hay bales.
  for (const [hx, hy] of [
    [0.1, 0.62],
    [0.28, 0.66],
    [0.46, 0.64],
    [0.2, 0.8],
  ] as const) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.arc(hx + 0.02, hy + 0.025, 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#D6B855";
    ctx.beginPath();
    ctx.arc(hx, hy, 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,90,20,0.55)";
    ctx.lineWidth = p.px;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.04, 0, Math.PI * 2);
    ctx.stroke();
  }
  treeTop(p, -0.32, 0.2, 0.14);
  treeTop(p, -0.25, 0.85, 0.12, 1);
  treeTop(p, 1.28, 0.85, 0.13);
}

function drawRanch(p: Paint): void {
  const { ctx } = p;
  // Grazing pasture: fenced, greener than the surroundings.
  ground(p, 0.5, 0.6, 0.98, 0.72, "#9DB068", 0.05);
  ctx.strokeStyle = SHADOW;
  ctx.lineWidth = p.px * 2.2;
  ctx.strokeRect(-0.33, 0.33, 1.7, 0.98);
  ctx.strokeStyle = "#7A5636";
  ctx.lineWidth = p.px * 2.2;
  ctx.strokeRect(-0.35, 0.3, 1.7, 0.98);
  ctx.beginPath();
  ctx.moveTo(0.5, 0.3);
  ctx.lineTo(0.5, 1.28);
  ctx.stroke();
  ctx.fillStyle = "#4A3320";
  for (let i = 0; i <= 8; i++) {
    ctx.fillRect(-0.35 + i * 0.2125 - p.px, 0.3 - p.px, p.px * 2, p.px * 2);
    ctx.fillRect(-0.35 + i * 0.2125 - p.px, 1.28 - p.px, p.px * 2, p.px * 2);
  }
  const animals: Array<[number, number, string]> = [
    [-0.1, 0.6, "#F2E8D5"],
    [0.12, 0.85, "#7A4E32"],
    [0.3, 0.55, "#F2E8D5"],
    [0.75, 0.7, "#F2E8D5"],
    [0.95, 0.95, "#7A4E32"],
    [0.68, 1.1, "#F2E8D5"],
    [1.15, 0.6, "#7A4E32"],
    [-0.15, 1.05, "#7A4E32"],
  ];
  for (const [ax, ay, c] of animals) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(ax + 0.02, ay + 0.025, 0.07, 0.045, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(ax, ay, 0.07, 0.045, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darken(c, 0.5);
    ctx.beginPath();
    ctx.arc(ax + 0.07, ay + 0.02, 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
  // Barn and water trough / tank.
  gable(p, -0.15, -0.28, 0.7, 0.42, "#9C4A34", { ridgeX: true, height: 1.3 });
  tank(p, 0.85, -0.05, 0.11, "#9AA4AE", 1.2);
  ctx.fillStyle = "#3F7096";
  ctx.fillRect(0.45, 1.05, 0.22, 0.07);
}

function pumpjack(p: Paint, cx: number, cy: number, flip = 1): void {
  const { ctx, px } = p;
  // Skid and shadow.
  ctx.fillStyle = SHADOW;
  ctx.fillRect(cx - 0.17 + 0.04, cy - 0.06 + 0.05, 0.36, 0.16);
  ctx.fillStyle = "#3C4048";
  ctx.fillRect(cx - 0.17, cy - 0.06, 0.34, 0.14);
  // Walking beam (tilted).
  const x0 = cx - 0.24 * flip;
  const x1 = cx + 0.24 * flip;
  line(p, x0, cy - 0.05, x1, cy + 0.03, 0.075, "#2C4A78");
  // Horsehead.
  ctx.fillStyle = "#1E3454";
  ctx.beginPath();
  ctx.arc(x0, cy - 0.05, 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4A72AA";
  ctx.beginPath();
  ctx.arc(x0 - 0.01, cy - 0.06, 0.045, 0, Math.PI * 2);
  ctx.fill();
  // Counterweight.
  ctx.fillStyle = "#5C6068";
  ctx.beginPath();
  ctx.arc(x1, cy + 0.03, 0.06, 0, Math.PI * 2);
  ctx.fill();
  // Pivot.
  ctx.fillStyle = "#D8B24A";
  ctx.beginPath();
  ctx.arc(cx, cy - 0.01, 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2B2B30";
  ctx.beginPath();
  ctx.arc(cx, cy - 0.01, 0.018, 0, Math.PI * 2);
  ctx.fill();
  void px;
}

function drawOilWell(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.52, 0.96, 0.85, "#8E8878");
  // Oil-stained patches.
  ctx.fillStyle = "rgba(20, 18, 16, 0.45)";
  for (const [ox, oy, rx, ry] of [
    [0.3, 0.55, 0.28, 0.16],
    [0.85, 0.85, 0.2, 0.12],
    [0.7, 0.25, 0.14, 0.08],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(ox, oy, rx, ry, 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pipeline to the tanks.
  line(p, 0.3, 0.6, 1.02, 0.4, 0.03, "#3A3E44");
  line(p, 0.8, 0.9, 1.02, 0.4, 0.03, "#3A3E44");
  pumpjack(p, 0.24, 0.6);
  pumpjack(p, 0.78, 0.93, -1);
  tank(p, 1.12, 0.2, 0.17, "#C9CDD2", 1.3);
  tank(p, 1.12, 0.62, 0.13, "#B4B8BE", 1.2);
  gable(p, -0.2, -0.05, 0.36, 0.24, "#6A6E76", { height: 1 });
}

function drawRefinery(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.52, 1.0, 0.9, "#A29E90");
  // Pipe rack.
  for (const [x0, y0, x1, y1] of [
    [0.2, 0.28, 0.72, 0.28],
    [0.2, 0.28, 0.2, 0.9],
    [0.2, 0.9, 0.68, 0.9],
    [0.72, 0.28, 0.72, 0.9],
  ] as const) {
    line(p, x0, y0, x1, y1, 0.04, "#7A7E86");
  }
  line(p, 0.72, 0.28, 1.08, 0.18, 0.035, "#7A7E86");
  tank(p, 0.15, 0.25, 0.21, "#E4E1D6", 1.4);
  tank(p, 0.15, 0.9, 0.17, "#E4E1D6", 1.3);
  tank(p, 0.7, 0.92, 0.15, "#D4D1C6", 1.3);
  // Stripe on the big tank roofs.
  ctx.strokeStyle = "#B8452F";
  ctx.lineWidth = p.px * 2;
  ctx.beginPath();
  ctx.arc(0.15, 0.25, 0.13, 0, Math.PI * 2);
  ctx.stroke();
  // Distillation tower.
  chimneyTop(p, 0.72, 0.5, 0.07, 0.38, "#9AA0A8");
  ctx.strokeStyle = "#5A5E66";
  ctx.lineWidth = p.px * 1.3;
  for (const r of [0.05, 0.075]) {
    ctx.beginPath();
    ctx.arc(0.72, 0.5, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Flare stack with flame.
  const fx = 1.12;
  const fy = 0.14;
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 0.3);
  glow.addColorStop(0, "rgba(255, 170, 70, 0.8)");
  glow.addColorStop(1, "rgba(255, 130, 40, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(fx, fy, 0.3, 0, Math.PI * 2);
  ctx.fill();
  chimneyTop(p, fx, fy, 0.035, 0.34, "#6A6E76");
  ctx.fillStyle = "#F2A04A";
  ctx.beginPath();
  ctx.arc(fx, fy, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFE29A";
  ctx.beginPath();
  ctx.arc(fx - 0.01, fy - 0.01, 0.025, 0, Math.PI * 2);
  ctx.fill();
  gable(p, 0.98, 0.7, 0.36, 0.28, "#6E727A", { height: 1 });
}

function drawFactory(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.55, 1.0, 0.86, "#B2AD9C");
  sawtooth(p, -0.32, 0.3, 1.05, 0.66, 6, "#B0553F");
  // Office block and loading dock.
  gable(p, 0.82, 0.55, 0.48, 0.36, "#7A828C", { height: 1.1 });
  ctx.fillStyle = "#6B5138";
  ctx.fillRect(-0.32, 0.98, 1.05, 0.07);
  ctx.fillStyle = "#3A2F24";
  for (let i = 0; i < 4; i++) ctx.fillRect(-0.22 + i * 0.26, 0.96, 0.14, 0.03);
  // Crates.
  for (const [cx, cy, c] of [
    [0.85, 1.07, "#9A7448"],
    [0.98, 1.1, "#B08A58"],
    [1.1, 1.05, "#9A7448"],
  ] as const) {
    flat(p, cx, cy, 0.1, 0.1, c, 0.6);
  }
  // Brick chimneys.
  for (const [sx, sy] of FACTORY_STACKS) chimneyTop(p, sx, sy, 0.06, 0.3, "#9A5A48");
  gable(p, -0.32, -0.05, 0.4, 0.26, "#6A6E76", { height: 1 });
}

function drawFoodPlant(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.52, 0.98, 0.88, "#B5AF9C");
  gable(p, -0.32, 0.36, 0.85, 0.52, "#C99A5E", { wall: "#A0724A", height: 1.2 });
  if (p.detail) {
    ctx.fillStyle = "#6B4A30";
    for (let i = 0; i < 3; i++) ctx.fillRect(-0.2 + i * 0.25, 0.86, 0.14, 0.03);
  }
  // Silos.
  tank(p, 0.86, 0.22, 0.14, "#E6E3D6", 1.5);
  tank(p, 1.16, 0.22, 0.12, "#E6E3D6", 1.4);
  tank(p, 1.1, 0.6, 0.14, "#E6E3D6", 1.5);
  line(p, 0.85, 0.22, 1.15, 0.22, 0.03, "#8A8E96");
  // Boiler house with a stack.
  gable(p, -0.32, -0.05, 0.42, 0.3, "#8A5A45", { height: 1.1 });
  chimneyTop(p, 0.5, 0.12, 0.05, 0.24, "#8A5A45");
  // Delivery bay and crates.
  ctx.fillStyle = "#6B5138";
  ctx.fillRect(0.6, 0.9, 0.55, 0.07);
  flat(p, 0.7, 1.05, 0.12, 0.1, "#B08A58", 0.6);
  flat(p, 0.86, 1.08, 0.12, 0.1, "#9A7448", 0.6);
}

function drawPort(p: Paint): void {
  const { ctx } = p;
  // Quay (paved) above a water basin.
  ground(p, 0.5, 0.35, 0.98, 0.62, "#B4AE9C", 0.04);
  ctx.fillStyle = "#3F7096";
  ctx.beginPath();
  ctx.roundRect(-0.42, 0.72, 1.84, 0.7, 0.08);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = p.px * 1.5;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = p.px * 1.2;
  ctx.beginPath();
  for (const [x, y] of [
    [0.8, 0.95],
    [1.1, 1.2],
    [-0.1, 1.25],
    [0.4, 1.3],
  ] as const) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.14, y);
  }
  ctx.stroke();
  // Pier planks.
  ctx.fillStyle = SHADOW;
  ctx.fillRect(-0.3 + 0.03, 0.66 + 0.04, 0.9, 0.3);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? "#8A6440" : "#9A7248";
    ctx.fillRect(-0.3 + i * 0.075, 0.66, 0.075, 0.3);
  }
  // Ship alongside.
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(1.0 + 0.04, 1.08 + 0.05, 0.36, 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#33404E";
  ctx.beginPath();
  ctx.moveTo(0.62, 0.98);
  ctx.lineTo(1.28, 0.98);
  ctx.quadraticCurveTo(1.48, 1.08, 1.28, 1.2);
  ctx.lineTo(0.62, 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#B7503C";
  ctx.fillRect(0.68, 1.02, 0.5, 0.14);
  flat(p, 0.72, 1.03, 0.12, 0.12, "#E8E2D0", 0.8);
  // Crane: red boom over the water.
  line(p, 0.3, 0.82, 0.76, 1.06, 0.05, "#C9563E");
  ctx.fillStyle = "#3A3A3E";
  ctx.beginPath();
  ctx.arc(0.3, 0.82, 0.07, 0, Math.PI * 2);
  ctx.fill();
  // Containers, warehouse.
  const boxes: Array<[number, number, string]> = [
    [-0.32, 0.0, "#B5533C"],
    [-0.1, 0.0, "#4F86B5"],
    [0.12, 0.0, "#C9A63E"],
    [-0.32, 0.17, "#4F86B5"],
    [-0.1, 0.17, "#B5533C"],
    [0.12, 0.17, "#5C9A6B"],
  ];
  for (const [bx, by, c] of boxes) flat(p, bx, by, 0.2, 0.14, c, 0.7);
  gable(p, 0.55, -0.06, 0.78, 0.42, "#8E8A7C", { height: 1.2 });
}

function drawSilverMine(p: Paint): void {
  drawMine(p, "#7B8088", "#B7BDC6", "#4B4F56");
}

function drawUraniumMine(p: Paint): void {
  drawMine(p, "#5E7A2E", "#9BC24A", "#3B4A2A");
}

const SMELTER_STACKS: ReadonlyArray<readonly [number, number]> = [
  [0.95, 0.12],
  [1.1, 0.24],
];

function drawSmelter(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.54, 1.0, 0.88, "#8F8A7E");
  gable(p, -0.32, 0.4, 0.9, 0.5, "#6F7480", { wall: "#585C66", height: 1.2 });
  // Furnace glow and the pour.
  const fx = 0.42;
  const fy = 0.22;
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 0.45);
  glow.addColorStop(0, "rgba(255, 190, 90, 0.65)");
  glow.addColorStop(1, "rgba(255, 150, 60, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(fx, fy, 0.45, 0, Math.PI * 2);
  ctx.fill();
  tank(p, fx, fy, 0.17, "#74787F", 1.8);
  ctx.fillStyle = "#F2B25A";
  ctx.beginPath();
  ctx.arc(fx - 0.02, fy - 0.02, 0.07, 0, Math.PI * 2);
  ctx.fill();
  // Ore heap in, silver ingots out.
  mound(p, 0.9, 0.72, 0.2, "#7B8088");
  for (const [bx, by] of [
    [0.7, 1.05],
    [0.86, 1.07],
    [1.02, 1.05],
  ] as const)
    flat(p, bx, by, 0.12, 0.07, "#DDE1E6", 0.5);
  for (const [sx, sy] of SMELTER_STACKS) chimneyTop(p, sx, sy, 0.05, 0.28, "#5E5A56");
  spur(p, -0.4, 1.2, 0.6, 1.2);
}

function drawMint(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.55, 0.98, 0.86, "#B9B4A6");
  // Stone hall with a pediment and a row of columns, a gilded dome behind it.
  gable(p, -0.25, 0.42, 0.95, 0.5, "#D9D3C2", { wall: "#BDB6A2", height: 1.3 });
  tank(p, 0.22, 0.26, 0.2, "#C9A64A", 1.8);
  if (p.detail) {
    ctx.fillStyle = "#EFEADB";
    for (let i = 0; i < 6; i++) ctx.fillRect(-0.16 + i * 0.14, 0.88, 0.05, 0.1);
  }
  // Forecourt, railings and a strongroom annex.
  flat(p, 0.85, 0.5, 0.36, 0.3, "#8F8A7E", 0.9);
  ctx.strokeStyle = "#3A3A40";
  ctx.lineWidth = 0.025;
  ctx.strokeRect(-0.3, 1.0, 1.4, 0.2);
  spur(p, 1.0, 1.28, 1.5, 1.28);
}

function drawEnrichmentPlant(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.54, 1.0, 0.88, "#A9ADA6");
  // Two long cascade halls and a row of centrifuge tanks.
  gable(p, -0.3, 0.52, 0.95, 0.3, "#C3C8CC", { wall: "#9DA3A8", height: 1.0 });
  gable(p, -0.3, 0.1, 0.95, 0.3, "#C3C8CC", { wall: "#9DA3A8", height: 1.0 });
  for (let i = 0; i < 5; i++) tank(p, -0.18 + i * 0.2, 0.96, 0.07, "#DDE3E6", 1.6);
  // Control block with a glowing green marker and a ventilation stack.
  gable(p, 0.82, 0.3, 0.4, 0.4, "#7F868C", { height: 1.2 });
  ctx.fillStyle = "#9BE04A";
  ctx.beginPath();
  ctx.arc(1.0, 0.5, 0.04, 0, Math.PI * 2);
  ctx.fill();
  chimneyTop(p, 1.12, 0.12, 0.045, 0.3, "#8E9296");
  spur(p, -0.4, 1.2, 0.5, 1.2);
}

const NUCLEAR_TOWERS: ReadonlyArray<readonly [number, number]> = [
  [0.82, 0.22],
  [1.12, 0.36],
];

function drawNuclearPlant(p: Paint): void {
  const { ctx } = p;
  ground(p, 0.5, 0.55, 1.02, 0.9, "#A9ADA6");
  // Turbine hall, containment dome and two hyperbolic cooling towers.
  gable(p, -0.32, 0.5, 0.95, 0.36, "#B8BDC2", { wall: "#8E949A", height: 1.1 });
  tank(p, 0.14, 0.3, 0.22, "#D4D8DB", 1.5);
  for (const [tx, ty] of NUCLEAR_TOWERS) tank(p, tx, ty, 0.17, "#C8CCCE", 2.6);
  ctx.strokeStyle = "#3A3A40";
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.moveTo(0.5, 0.96);
  ctx.lineTo(1.2, 0.96);
  ctx.stroke();
  // Pylons.
  for (const px of [0.7, 0.95, 1.2]) line(p, px, 0.9, px, 1.1, 0.03, "#4A4E56");
  spur(p, -0.4, 1.22, 0.6, 1.22);
}

const DRAWERS: Record<IndustryType, Draw> = {
  coalMine: drawCoalMine,
  ironMine: drawIronMine,
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
  silverMine: drawSilverMine,
  smelter: drawSmelter,
  mint: drawMint,
  uraniumMine: drawUraniumMine,
  enrichmentPlant: drawEnrichmentPlant,
  nuclearPlant: drawNuclearPlant,
};

/** Draws the industry standing on the tile whose top-left is (px, py), `size` px per tile. The art
 * covers about 2×2 tiles centred on that tile (clipped by whatever canvas the caller draws to). */
export function drawIndustryIcon(
  ctx: CanvasRenderingContext2D,
  type: IndustryType,
  px: number,
  py: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(px + size / 2, py + size / 2);
  ctx.scale(size * ART_SCALE, size * ART_SCALE);
  ctx.translate(-0.5, -0.5);
  DRAWERS[type](makePaint(ctx, size * ART_SCALE));
  ctx.restore();
}

// Chimney tops in tile units (origin = industry tile's top-left), shared by the art and the smoke.
const STEEL_MILL_STACKS: ReadonlyArray<readonly [number, number]> = [
  [0.92, 0.1],
  [1.06, 0.2],
  [0.98, 0.34],
];
const FACTORY_STACKS: ReadonlyArray<readonly [number, number]> = [
  [0.85, 0.14],
  [1.0, 0.12],
];

/** Where each processor's live smoke comes from, in tiles from the industry tile's top-left. */
const SMOKE_SOURCES: Partial<Record<IndustryType, ReadonlyArray<readonly [number, number]>>> = {
  steelMill: STEEL_MILL_STACKS,
  factory: FACTORY_STACKS,
  foodPlant: [[0.5, 0.12]],
  sawmill: [[0.82, 0.14]],
  refinery: [[1.12, 0.14]],
  smelter: SMELTER_STACKS,
  enrichmentPlant: [[1.12, 0.12]],
  nuclearPlant: NUCLEAR_TOWERS,
};

const SCALED_SOURCES = new Map<IndustryType, ReadonlyArray<readonly [number, number]>>();

/** Chimney tops in tiles from the industry tile's top-left, after the art's enlargement. */
export function industrySmokeSources(type: IndustryType): ReadonlyArray<readonly [number, number]> {
  let scaled = SCALED_SOURCES.get(type);
  if (!scaled) {
    scaled = (SMOKE_SOURCES[type] ?? []).map(
      ([x, y]) => [0.5 + (x - 0.5) * ART_SCALE, 0.5 + (y - 0.5) * ART_SCALE] as const,
    );
    SCALED_SOURCES.set(type, scaled);
  }
  return scaled;
}
