/**
 * Industry icon rendering (SPEC §8.2, §10.3; STYLE §10): each type is a small top-down yard on its own
 * ground pad, lit from the upper left (lighter upper-left roof halves, shadows to the lower right), and
 * distinct at zoom 1 (32 px): mine headframe + spoil heap, sawmill with log piles, steel mill with a
 * blast furnace and warm glow, nodding-donkey oil wells, farm with silo and barn, factory with a
 * saw-tooth roof. Drawn per tile, baked into the terrain chunk cache — so chimney *smoke* is not baked:
 * `industrySmokeSources` gives the chimney positions the live particle system emits from.
 */
import type { IndustryType } from "../data/industries";
import { hexToRgb, shadeColor } from "./color";
import { INDUSTRY_COLORS } from "./palette";

type Ctx = CanvasRenderingContext2D;

const SHADOW = "rgba(20, 16, 10, 0.3)";

function lighten(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * k)}, ${Math.round(g + (255 - g) * k)}, ${Math.round(b + (255 - b) * k)})`;
}

/** Ground pad the yard stands on: a slightly raised, lighter-edged rounded plate. */
function pad(ctx: Ctx, px: number, py: number, size: number, color: string): void {
  const inset = size * 0.05;
  const w = size - inset * 2;
  ctx.fillStyle = shadeColor(color, 0.82);
  ctx.beginPath();
  ctx.roundRect(px + inset + size * 0.02, py + inset + size * 0.03, w, w, size * 0.1);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(px + inset, py + inset, w, w, size * 0.1);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath();
  ctx.moveTo(px + inset + size * 0.1, py + inset + 0.5);
  ctx.lineTo(px + inset + w - size * 0.1, py + inset + 0.5);
  ctx.stroke();
}

/** Two-tone roof (lit upper half, darker lower), ridge line, shadow to the lower right. */
function roof(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  size: number,
): void {
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + size * 0.035, y + size * 0.045, w, h);
  ctx.fillStyle = lighten(base, 0.2);
  ctx.fillRect(x, y, w, h / 2);
  ctx.fillStyle = shadeColor(base, 0.8);
  ctx.fillRect(x, y + h / 2, w, h / 2);
  ctx.fillStyle = lighten(base, 0.42);
  ctx.fillRect(x, y + h / 2 - 0.5, w, Math.max(1, size * 0.02));
  ctx.strokeStyle = "rgba(20, 14, 8, 0.4)";
  ctx.lineWidth = 0.7;
  ctx.strokeRect(x, y, w, h);
}

/** A round tank/silo seen from above: shadow, body, lit crown. */
function tank(ctx: Ctx, cx: number, cy: number, r: number, base: string): void {
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.45, cy + r * 0.55, r, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(base, 0.78);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lighten(base, 0.18);
  ctx.beginPath();
  ctx.arc(cx - r * 0.15, cy - r * 0.18, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.32, cy - r * 0.35, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
}

/** A tall stack from above: a long shadow to the lower right and a ringed top. */
function stack(ctx: Ctx, cx: number, cy: number, r: number, length: number): void {
  ctx.strokeStyle = SHADOW;
  ctx.lineCap = "round";
  ctx.lineWidth = r * 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + length * 0.75, cy + length * 0.85);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "#3A3A3E";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8A8A90";
  ctx.beginPath();
  ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1C1C20";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/** A heap (spoil, ore, logs): concentric mound, lit upper-left. */
function heap(ctx: Ctx, cx: number, cy: number, r: number, base: string): void {
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.3, cy + r * 0.4, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(base, 0.75);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.12, cy - r * 0.12, r * 0.7, r * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lighten(base, 0.3);
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.28, cy - r * 0.28, r * 0.3, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Two-tone tree canopy with a ground shadow. */
function tree(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.fillStyle = "rgba(20, 40, 20, 0.35)";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.55, cy + r * 0.6, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2F5A3A";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4C7A3E";
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.22, r * 0.66, 0, Math.PI * 2);
  ctx.fill();
}

/** Mine: an A-frame headframe (square footprint with cross braces and a sheave wheel), a shed and a
 * spoil heap in the ore's colour. */
function drawMine(ctx: Ctx, px: number, py: number, size: number, ore: string): void {
  pad(ctx, px, py, size, "#A59D8A");
  heap(ctx, px + size * 0.7, py + size * 0.7, size * 0.19, ore);

  const fx = px + size * 0.3;
  const fy = py + size * 0.3;
  const fw = size * 0.22;
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.moveTo(fx + fw, fy + fw);
  ctx.lineTo(fx + fw + size * 0.2, fy + fw + size * 0.24);
  ctx.lineTo(fx + fw * 0.4, fy + fw);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#3A3A3E";
  ctx.lineWidth = Math.max(1.2, size * 0.055);
  ctx.strokeRect(fx, fy, fw, fw);
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx + fw, fy + fw);
  ctx.moveTo(fx + fw, fy);
  ctx.lineTo(fx, fy + fw);
  ctx.stroke();
  ctx.fillStyle = "#C9B04A";
  ctx.beginPath();
  ctx.arc(fx + fw / 2, fy + fw / 2, size * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3A3A3E";
  ctx.beginPath();
  ctx.arc(fx + fw / 2, fy + fw / 2, size * 0.022, 0, Math.PI * 2);
  ctx.fill();

  roof(ctx, px + size * 0.14, py + size * 0.62, size * 0.3, size * 0.2, "#6A6A70", size);
}

/** Logging camp: a stand of trees, stacked log piles, a cabin and a saw blade. */
function drawLoggingCamp(ctx: Ctx, px: number, py: number, size: number): void {
  pad(ctx, px, py, size, "#A08A64");
  tree(ctx, px + size * 0.24, py + size * 0.26, size * 0.14);
  tree(ctx, px + size * 0.42, py + size * 0.2, size * 0.11);
  tree(ctx, px + size * 0.17, py + size * 0.46, size * 0.1);

  // Log pile: parallel logs with pale end-grain dots.
  for (let i = 0; i < 4; i++) {
    const y = py + size * (0.4 + i * 0.075);
    ctx.fillStyle = SHADOW;
    ctx.fillRect(px + size * 0.5 + size * 0.02, y + size * 0.025, size * 0.36, size * 0.07);
    ctx.fillStyle = i % 2 ? "#7A5636" : "#8A6440";
    ctx.beginPath();
    ctx.roundRect(px + size * 0.5, y, size * 0.36, size * 0.07, size * 0.03);
    ctx.fill();
    ctx.fillStyle = "#D8B88A";
    ctx.beginPath();
    ctx.arc(px + size * 0.86, y + size * 0.035, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  roof(ctx, px + size * 0.14, py + size * 0.7, size * 0.26, size * 0.17, "#7A4E32", size);
  ctx.fillStyle = "#B8BCC2";
  ctx.beginPath();
  ctx.arc(px + size * 0.68, py + size * 0.82, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5A5E64";
  ctx.lineWidth = Math.max(1, size * 0.02);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(
      px + size * 0.68 + Math.cos(a) * size * 0.07,
      py + size * 0.82 + Math.sin(a) * size * 0.07,
    );
    ctx.lineTo(
      px + size * 0.68 + Math.cos(a) * size * 0.1,
      py + size * 0.82 + Math.sin(a) * size * 0.1,
    );
    ctx.stroke();
  }
}

/** Farm: red barn with a lit roof, a silo, a small striped plot; the neighbouring plain tiles carry
 * the larger fields (terrain.ts). */
function drawFarm(ctx: Ctx, px: number, py: number, size: number): void {
  ctx.fillStyle = "#B8A25A";
  ctx.fillRect(px + size * 0.06, py + size * 0.06, size * 0.88, size * 0.88);
  // Striped plot along the bottom.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? "#C9AE4E" : "#A98F3C";
    ctx.fillRect(px + size * 0.06, py + size * (0.6 + i * 0.056), size * 0.88, size * 0.056);
  }
  roof(ctx, px + size * 0.14, py + size * 0.16, size * 0.42, size * 0.3, "#B0483A", size);
  ctx.fillStyle = "#EDE3CC";
  ctx.fillRect(px + size * 0.3, py + size * 0.3, size * 0.1, size * 0.03);
  tank(ctx, px + size * 0.76, py + size * 0.3, size * 0.12, "#B9B6AA");
  tank(ctx, px + size * 0.76, py + size * 0.52, size * 0.09, "#B9B6AA");
}

/** Ranch: dirt corral with fence posts, a shed and grazing animals. */
function drawRanch(ctx: Ctx, px: number, py: number, size: number): void {
  pad(ctx, px, py, size, "#B39A66");
  const l = px + size * 0.14;
  const t = py + size * 0.4;
  const w = size * 0.72;
  const h = size * 0.46;
  ctx.fillStyle = "rgba(90, 120, 50, 0.4)";
  ctx.fillRect(l, t, w, h);
  ctx.strokeStyle = SHADOW;
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeRect(l + size * 0.02, t + size * 0.03, w, h);
  ctx.strokeStyle = "#7A5636";
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.strokeRect(l, t, w, h);
  ctx.beginPath();
  ctx.moveTo(l + w / 2, t);
  ctx.lineTo(l + w / 2, t + h);
  ctx.stroke();
  ctx.fillStyle = "#4A3320";
  for (let i = 0; i <= 4; i++) {
    ctx.fillRect(l + (w * i) / 4 - 1, t - 1, 2, 2);
    ctx.fillRect(l + (w * i) / 4 - 1, t + h - 1, 2, 2);
  }
  // Animals: brown and white dots.
  const animals: Array<[number, number, string]> = [
    [0.28, 0.6, "#F2E8D5"],
    [0.4, 0.74, "#7A4E32"],
    [0.62, 0.62, "#F2E8D5"],
    [0.74, 0.76, "#7A4E32"],
    [0.55, 0.78, "#F2E8D5"],
  ];
  for (const [fx, fy, c] of animals) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(px + size * fx, py + size * fy, size * 0.035, size * 0.024, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  roof(ctx, px + size * 0.16, py + size * 0.14, size * 0.28, size * 0.18, "#8B5A3C", size);
  tank(ctx, px + size * 0.72, py + size * 0.24, size * 0.07, "#B9B6AA");
}

/** Oil well: a pumpjack (walking beam, horsehead, counterweight over a base plate) plus a storage
 * tank, on an oil-stained pad. */
function drawOilWell(ctx: Ctx, px: number, py: number, size: number): void {
  pad(ctx, px, py, size, "#A29A84");
  ctx.fillStyle = "rgba(24, 22, 20, 0.5)";
  ctx.beginPath();
  ctx.ellipse(px + size * 0.32, py + size * 0.62, size * 0.2, size * 0.14, 0.2, 0, Math.PI * 2);
  ctx.fill();

  const cx = px + size * 0.42;
  const cy = py + size * 0.4;
  // Base plate and shadowed beam.
  ctx.fillStyle = "#4A4E56";
  ctx.fillRect(cx - size * 0.16, cy + size * 0.04, size * 0.32, size * 0.1);
  ctx.strokeStyle = SHADOW;
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.24 + size * 0.03, cy - size * 0.08 + size * 0.05);
  ctx.lineTo(cx + size * 0.26 + size * 0.03, cy + size * 0.05 + size * 0.05);
  ctx.stroke();
  ctx.strokeStyle = "#2E323A";
  ctx.lineWidth = Math.max(2, size * 0.075);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.24, cy - size * 0.08);
  ctx.lineTo(cx + size * 0.26, cy + size * 0.05);
  ctx.stroke();
  // Pivot post, horsehead and counterweight.
  ctx.fillStyle = "#C9A63E";
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.015, size * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5A5E66";
  ctx.beginPath();
  ctx.arc(cx + size * 0.26, cy + size * 0.05, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2E323A";
  ctx.fillRect(cx - size * 0.29, cy - size * 0.13, size * 0.09, size * 0.1);

  tank(ctx, px + size * 0.72, py + size * 0.7, size * 0.12, "#7C8188");
}

/** Blast-furnace top-down: tall stove + furnace with a warm glow, chimneys, ore heap. */
function drawSteelMill(ctx: Ctx, px: number, py: number, size: number): void {
  pad(ctx, px, py, size, "#9A9584");
  roof(ctx, px + size * 0.12, py + size * 0.5, size * 0.54, size * 0.3, "#5F6874", size);
  heap(ctx, px + size * 0.78, py + size * 0.7, size * 0.14, "#8C4A38");
  // Furnace with glow.
  const fx = px + size * 0.3;
  const fy = py + size * 0.3;
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, size * 0.3);
  glow.addColorStop(0, "rgba(255, 150, 60, 0.75)");
  glow.addColorStop(1, "rgba(255, 120, 40, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(fx, fy, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  tank(ctx, fx, fy, size * 0.13, "#7A7E86");
  ctx.fillStyle = "#F2A04A";
  ctx.beginPath();
  ctx.arc(fx - size * 0.02, fy - size * 0.02, size * 0.045, 0, Math.PI * 2);
  ctx.fill();
  tank(ctx, px + size * 0.54, py + size * 0.3, size * 0.075, "#8A8E96");
  for (const [sx, sy] of STEEL_MILL_STACKS)
    stack(ctx, px + size * sx, py + size * sy, size * 0.035, size * 0.16);
}

/** Sawmill: long timber shed, a log pile to feed it, stacked lumber and a burner stack. */
function drawSawmill(ctx: Ctx, px: number, py: number, size: number): void {
  pad(ctx, px, py, size, "#A48F68");
  roof(ctx, px + size * 0.12, py + size * 0.14, size * 0.56, size * 0.3, "#8A5E3C", size);
  stack(ctx, px + size * 0.62, py + size * 0.2, size * 0.035, size * 0.14);
  // Round log pile.
  for (const [lx, ly] of [
    [0.22, 0.62],
    [0.32, 0.6],
    [0.27, 0.72],
    [0.38, 0.72],
    [0.17, 0.72],
  ] as const) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.arc(
      px + size * lx + size * 0.02,
      py + size * ly + size * 0.025,
      size * 0.055,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.fillStyle = "#6E4A2C";
    ctx.beginPath();
    ctx.arc(px + size * lx, py + size * ly, size * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#D8B88A";
    ctx.beginPath();
    ctx.arc(px + size * lx, py + size * ly, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lumber stacks: pale planks.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = SHADOW;
    ctx.fillRect(
      px + size * 0.58 + size * 0.02,
      py + size * (0.56 + i * 0.1) + size * 0.02,
      size * 0.3,
      size * 0.075,
    );
    ctx.fillStyle = i % 2 ? "#D8BC86" : "#E4CB98";
    ctx.fillRect(px + size * 0.58, py + size * (0.56 + i * 0.1), size * 0.3, size * 0.075);
    ctx.fillStyle = "rgba(90, 60, 30, 0.35)";
    ctx.fillRect(px + size * 0.58, py + size * (0.56 + i * 0.1) + size * 0.035, size * 0.3, 1);
  }
}

/** Food plant: brick hall, two round silos, a small chimney. */
function drawFoodPlant(ctx: Ctx, px: number, py: number, size: number): void {
  pad(ctx, px, py, size, "#B4AE9C");
  roof(ctx, px + size * 0.12, py + size * 0.44, size * 0.5, size * 0.34, "#A65E48", size);
  tank(ctx, px + size * 0.74, py + size * 0.28, size * 0.11, "#D9D5C6");
  tank(ctx, px + size * 0.74, py + size * 0.56, size * 0.11, "#D9D5C6");
  roof(ctx, px + size * 0.16, py + size * 0.14, size * 0.26, size * 0.18, "#7A828C", size);
  stack(ctx, px + size * 0.52, py + size * 0.24, size * 0.03, size * 0.13);
}

/** Factory: saw-tooth roof (alternating lit slopes and glazing) and two stacks. */
function drawFactory(ctx: Ctx, px: number, py: number, size: number): void {
  pad(ctx, px, py, size, "#B0AB9A");
  const x = px + size * 0.12;
  const y = py + size * 0.36;
  const w = size * 0.66;
  const h = size * 0.44;
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + size * 0.035, y + size * 0.045, w, h);
  const teeth = 5;
  for (let i = 0; i < teeth; i++) {
    const tx = x + (w * i) / teeth;
    const tw = w / teeth;
    ctx.fillStyle = "#B26A50"; // lit slope
    ctx.fillRect(tx, y, tw * 0.62, h);
    ctx.fillStyle = "#7A4536"; // shaded slope
    ctx.fillRect(tx + tw * 0.62, y, tw * 0.22, h);
    ctx.fillStyle = "#9EC0CC"; // glazing
    ctx.fillRect(tx + tw * 0.84, y, tw * 0.16, h);
  }
  ctx.strokeStyle = "rgba(20, 14, 8, 0.45)";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x, y, w, h);
  roof(ctx, px + size * 0.62, py + size * 0.12, size * 0.24, size * 0.16, "#6A6E76", size);
  for (const [sx, sy] of FACTORY_STACKS)
    stack(ctx, px + size * sx, py + size * sy, size * 0.035, size * 0.17);
}

/** Refinery: distillation tanks joined by pipes and a flare stack with a glowing flame. */
function drawRefinery(ctx: Ctx, px: number, py: number, size: number): void {
  pad(ctx, px, py, size, "#9C978A");
  ctx.strokeStyle = "#5A5E66";
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath();
  ctx.moveTo(px + size * 0.26, py + size * 0.34);
  ctx.lineTo(px + size * 0.5, py + size * 0.34);
  ctx.lineTo(px + size * 0.5, py + size * 0.7);
  ctx.moveTo(px + size * 0.26, py + size * 0.7);
  ctx.lineTo(px + size * 0.5, py + size * 0.7);
  ctx.stroke();
  tank(ctx, px + size * 0.26, py + size * 0.34, size * 0.13, "#C9C6BC");
  tank(ctx, px + size * 0.26, py + size * 0.7, size * 0.11, "#C9C6BC");
  tank(ctx, px + size * 0.5, py + size * 0.52, size * 0.08, "#8A8E96");
  // Flare stack with flame glow.
  const fx = px + size * 0.8;
  const fy = py + size * 0.3;
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, size * 0.2);
  glow.addColorStop(0, "rgba(255, 170, 70, 0.8)");
  glow.addColorStop(1, "rgba(255, 130, 40, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(fx, fy, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  stack(ctx, fx, fy, size * 0.03, size * 0.2);
  ctx.fillStyle = INDUSTRY_COLORS.flame;
  ctx.beginPath();
  ctx.arc(fx, fy, size * 0.035, 0, Math.PI * 2);
  ctx.fill();
  roof(ctx, px + size * 0.62, py + size * 0.6, size * 0.24, size * 0.2, "#6A6E76", size);
}

/** Port: water basin with a plank pier, a crane, stacked containers. */
function drawPort(ctx: Ctx, px: number, py: number, size: number): void {
  ctx.fillStyle = "#3F7096";
  ctx.fillRect(px + size * 0.06, py + size * 0.5, size * 0.88, size * 0.44);
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  for (const [x, y] of [
    [0.6, 0.62],
    [0.72, 0.8],
    [0.5, 0.86],
  ] as const) {
    ctx.fillRect(px + size * x, py + size * y, size * 0.12, 1);
  }
  ctx.fillStyle = "#B4AE9C";
  ctx.fillRect(px + size * 0.06, py + size * 0.06, size * 0.88, size * 0.46);
  // Pier planks.
  ctx.fillStyle = SHADOW;
  ctx.fillRect(px + size * 0.12 + size * 0.02, py + size * 0.48, size * 0.6, size * 0.16);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#8A6440" : "#9A7248";
    ctx.fillRect(px + size * (0.12 + i * 0.075), py + size * 0.46, size * 0.075, size * 0.16);
  }
  // Crane: base disc, boom over the water.
  const cx = px + size * 0.3;
  const cy = py + size * 0.54;
  ctx.strokeStyle = SHADOW;
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.02, cy + size * 0.03);
  ctx.lineTo(cx + size * 0.32, cy + size * 0.2);
  ctx.stroke();
  ctx.strokeStyle = "#C9563E";
  ctx.lineWidth = Math.max(1.5, size * 0.045);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + size * 0.3, cy + size * 0.17);
  ctx.stroke();
  ctx.fillStyle = "#3A3A3E";
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
  // Containers.
  for (const [x, y, c] of [
    [0.16, 0.16, "#B5533C"],
    [0.36, 0.16, "#4F86B5"],
    [0.16, 0.3, "#C9A63E"],
    [0.36, 0.3, "#B5533C"],
  ] as const) {
    roof(ctx, px + size * x, py + size * y, size * 0.17, size * 0.11, c, size);
  }
}

const ICON_DRAWERS: Record<IndustryType, (ctx: Ctx, px: number, py: number, size: number) => void> =
  {
    coalMine: (ctx, px, py, size) => drawMine(ctx, px, py, size, "#34343A"),
    ironMine: (ctx, px, py, size) => drawMine(ctx, px, py, size, "#A3583E"),
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
  ctx: Ctx,
  type: IndustryType,
  px: number,
  py: number,
  size: number,
): void {
  ICON_DRAWERS[type](ctx, px, py, size);
}

const STEEL_MILL_STACKS: ReadonlyArray<readonly [number, number]> = [
  [0.68, 0.3],
  [0.8, 0.3],
  [0.74, 0.42],
];
const FACTORY_STACKS: ReadonlyArray<readonly [number, number]> = [
  [0.22, 0.26],
  [0.36, 0.26],
];

/** Where each processor's live smoke comes from, as fractions of its tile (chimney tops). Only types
 * with a working chimney appear here; the refinery's flare is a dark plume from its stack. */
const SMOKE_SOURCES: Partial<Record<IndustryType, ReadonlyArray<readonly [number, number]>>> = {
  steelMill: STEEL_MILL_STACKS,
  factory: FACTORY_STACKS,
  foodPlant: [[0.52, 0.24]],
  sawmill: [[0.62, 0.2]],
  refinery: [[0.8, 0.3]],
};

export function industrySmokeSources(type: IndustryType): ReadonlyArray<readonly [number, number]> {
  return SMOKE_SOURCES[type] ?? [];
}
