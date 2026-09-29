/**
 * City rendering (SPEC §10.3, PLAN 21.1): each footprint tile is a town block on a street grid —
 * light warm-grey streets along the tile's top and left edges (so they run unbroken between
 * neighbouring tiles), and lots holding pitched-roof houses in a mix of sizes and orientations,
 * taller flat-roofed shops toward the core, gardens with trees, and small parks. Every roof is
 * top-lit (lit upper-left half, shaded lower-right half, ridge line) with a soft shadow. Dense
 * "downtown" tiles fill nearly every lot; the outskirts thin out into scattered houses and gardens.
 * One landmark per city from Town tier up: a church with a spire, or a town hall with a clock tower.
 * Drawn per footprint tile and baked into the terrain chunk cache; the per-tile RNG keeps re-bakes stable.
 */
import type { CityTier } from "../data/cities";
import {
  darken,
  flat,
  gable,
  hip,
  lighten,
  makePaint,
  pyramid,
  tank,
  treeTop,
  type Paint,
} from "./mapShapes";
import { rand } from "./rng";

const ROOFS = ["#B8573F", "#A44A34", "#8E6B5A", "#C08A4A", "#6E7480", "#9A5A48", "#5F7A80"];
const SHOP_ROOFS = ["#9A9484", "#8A8F98", "#A89A84", "#7E8894"];
const STREET = "#D6CDB8";
const STREET_EDGE = "#B6AD97";
const ROAD = 0.09;

/** Density by tier: how close to the core (0..1) a tile turns into a dense block, and how often a
 * building is a tall shop/office — a village never gets a downtown. */
const TIER_DENSITY: Record<CityTier, { tallChance: number; blockAt: number }> = {
  village: { tallChance: 0, blockAt: 1.1 },
  town: { tallChance: 0.08, blockAt: 0.45 },
  city: { tallChance: 0.22, blockAt: 0.3 },
  metropolis: { tallChance: 0.45, blockAt: 0.2 },
};

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)] as T;
}

/** A garden lot: lawn patch, a couple of trees, sometimes a path. */
function garden(p: Paint, x: number, y: number, w: number, h: number): void {
  const { ctx } = p;
  ctx.fillStyle = "rgba(112, 156, 78, 0.55)";
  ctx.beginPath();
  ctx.roundRect(x + 0.02, y + 0.02, w - 0.04, h - 0.04, 0.05);
  ctx.fill();
  const n = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    treeTop(p, x + w * (0.25 + rand() * 0.5), y + h * (0.25 + rand() * 0.5), 0.07 + rand() * 0.05);
  }
}

/** One house in a lot: pitched (gable or hip) roof, ridge along the long side, jittered position. */
function house(p: Paint, x: number, y: number, w: number, h: number, dense: boolean): void {
  const { ctx } = p;
  if (dense && rand() < 0.4) {
    // Two narrower houses side by side (or one behind the other) in the same lot.
    const alongX = rand() < 0.5;
    const half = alongX ? [w / 2, h] : [w, h / 2];
    for (let i = 0; i < 2; i++) {
      house(
        p,
        x + (alongX ? i * half[0]! : 0),
        y + (alongX ? 0 : i * half[1]!),
        half[0]!,
        half[1]!,
        false,
      );
    }
    return;
  }
  const bw = w * (dense ? 0.74 + rand() * 0.2 : 0.6 + rand() * 0.26);
  const bh = h * (dense ? 0.6 + rand() * 0.28 : 0.48 + rand() * 0.3);
  const bx = x + (w - bw) * (0.2 + rand() * 0.6);
  const by = y + (h - bh) * (0.2 + rand() * 0.6);
  const color = pick(ROOFS);
  if (rand() < 0.28) hip(p, bx, by, bw, bh, color, { height: 1 });
  else gable(p, bx, by, bw, bh, color, { ridgeX: bw >= bh, wall: "#D8D0BC", height: 1 });
  if (p.fine && rand() < 0.5) {
    ctx.fillStyle = "#4A3830";
    ctx.fillRect(bx + bw * 0.7, by + bh * 0.2, 0.035, 0.035);
  }
  if (rand() < 0.3) {
    // Garden tree in the leftover corner.
    const tx = bx > x + w * 0.5 ? x + w * 0.16 : x + w * 0.84;
    treeTop(p, tx, y + h * (0.25 + rand() * 0.5), 0.05 + rand() * 0.03);
  }
}

/** A taller flat-roofed shop/office block: paler roof with a parapet and a longer shadow. */
function shop(p: Paint, x: number, y: number, w: number, h: number, big: boolean): void {
  const bw = w * (big ? 0.92 : 0.8);
  const bh = h * (big ? 0.9 : 0.75);
  const bx = x + (w - bw) / 2;
  const by = y + (h - bh) / 2;
  const color = pick(SHOP_ROOFS);
  flat(p, bx, by, bw, bh, color, big ? 2.4 : 1.6);
  if (p.detail) {
    const { ctx } = p;
    ctx.fillStyle = darken(color, 0.8);
    ctx.fillRect(bx + bw * 0.25, by + bh * 0.25, bw * 0.5, bh * 0.5);
    ctx.fillStyle = lighten(color, 0.3);
    ctx.fillRect(bx + bw * 0.25, by + bh * 0.25, bw * 0.5, p.px * 1.4);
  }
}

function terrace(p: Paint, x: number, y: number, w: number, h: number): void {
  const bw = w * 0.92;
  const bh = h * 0.42;
  const bx = x + (w - bw) / 2;
  const by = y + (h - bh) * (0.15 + rand() * 0.7);
  gable(p, bx, by, bw, bh, pick(ROOFS), { ridgeX: true, wall: "#D8D0BC", height: 1 });
  if (p.fine) {
    const { ctx } = p;
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = p.px;
    ctx.beginPath();
    const n = 3 + Math.floor(rand() * 2);
    for (let i = 1; i < n; i++) {
      ctx.moveTo(bx + (bw * i) / n, by);
      ctx.lineTo(bx + (bw * i) / n, by + bh);
    }
    ctx.stroke();
  }
}

function lot(
  p: Paint,
  x: number,
  y: number,
  w: number,
  h: number,
  dense: boolean,
  tallChance: number,
  closeness: number,
): void {
  const roll = rand();
  const gardenChance = dense ? 0.07 : 0.3;
  if (roll < gardenChance) {
    garden(p, x, y, w, h);
    return;
  }
  if (!dense && rand() > 0.5 + closeness * 0.5) return; // empty outskirts lot
  if (tallChance > 0 && rand() < tallChance) {
    shop(p, x, y, w, h, tallChance > 0.3 && rand() < 0.4);
    return;
  }
  if (dense && rand() < 0.22) {
    terrace(p, x, y, w, h);
    return;
  }
  house(p, x, y, w, h, dense);
}

function streets(p: Paint, dense: boolean, closeness: number): void {
  const { ctx } = p;
  const horizontal = dense || rand() < 0.35 + closeness * 0.5;
  const vertical = dense || rand() < 0.35 + closeness * 0.5;
  for (const [on, isH] of [
    [horizontal, true],
    [vertical, false],
  ] as const) {
    if (!on) continue;
    ctx.fillStyle = STREET;
    if (isH) ctx.fillRect(0, 0, 1, ROAD);
    else ctx.fillRect(0, 0, ROAD, 1);
    if (p.detail) {
      ctx.fillStyle = STREET_EDGE;
      if (isH) ctx.fillRect(0, ROAD - p.px, 1, p.px);
      else ctx.fillRect(ROAD - p.px, 0, p.px, 1);
    }
  }
}

/**
 * @param closeness 0 (edge of the city's footprint) to 1 (its centroid): dense blocks near the
 * core, fading to scattered houses and gardens near the edge.
 */
export function drawCityRoofs(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  tier: CityTier,
  closeness = 1,
  landmark = false,
): void {
  const { tallChance, blockAt } = TIER_DENSITY[tier];
  const dense = closeness >= blockAt;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(size, size);
  const p = makePaint(ctx, size);
  // Faint lawn tint so a built-up tile reads apart from open farmland.
  ctx.fillStyle = dense ? "rgba(170, 162, 140, 0.6)" : "rgba(140, 160, 100, 0.22)";
  ctx.fillRect(0, 0, 1, 1);
  streets(p, dense, closeness);
  const x0 = ROAD + 0.03;
  const lotW = (1 - x0 - 0.02) / 2;
  const t = tallChance * (0.3 + 0.7 * closeness);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      lot(p, x0 + c * lotW, x0 + r * lotW, lotW, lotW, dense, t, closeness);
    }
  }
  if (landmark && tier !== "village") drawLandmark(p, tier === "town");
  ctx.restore();
}

/** One landmark near the centre from Town tier up: a church (cross-shaped slate roof, steeple with a
 * spire) in a town, a town hall (stone block with a clock tower and a fountain) in a city. */
function drawLandmark(p: Paint, church: boolean): void {
  const { ctx, px } = p;
  // Paved forecourt so it stands out from the roofs around it.
  ctx.fillStyle = "#DDD5C0";
  ctx.fillRect(0.02, 0.02, 0.96, 0.96);
  ctx.strokeStyle = STREET_EDGE;
  ctx.lineWidth = px;
  ctx.strokeRect(0.02, 0.02, 0.96, 0.96);
  if (church) {
    // Nave + transept forming a cross; slate roof.
    const slate = "#78828F";
    gable(p, 0.24, 0.42, 0.56, 0.18, slate, { ridgeX: true, wall: "#E2DACA", height: 1.4 });
    gable(p, 0.42, 0.24, 0.18, 0.52, slate, { ridgeX: false, wall: "#E2DACA", height: 1.4 });
    // Apse at the east end.
    gable(p, 0.78, 0.44, 0.1, 0.14, slate, { ridgeX: true, wall: "#E2DACA", noShadow: true });
    // West tower + spire.
    ctx.fillStyle = "#E2DACA";
    ctx.fillRect(0.1, 0.4, 0.16, 0.22);
    pyramid(p, 0.18, 0.51, 0.15, "#5B6470", 3.2);
    // Churchyard trees.
    treeTop(p, 0.14, 0.84, 0.07);
    treeTop(p, 0.86, 0.16, 0.07);
    treeTop(p, 0.86, 0.86, 0.06, 1);
    treeTop(p, 0.14, 0.16, 0.06, 1);
  } else {
    // Town hall: main block, wings, central clock tower with copper roof; fountain plaza.
    const stone = "#9A9AA2";
    gable(p, 0.12, 0.3, 0.76, 0.3, stone, { ridgeX: true, wall: "#E4DCC8", height: 1.6 });
    gable(p, 0.1, 0.26, 0.18, 0.38, "#8A5A48", { ridgeX: false, wall: "#E4DCC8", height: 1.7 });
    gable(p, 0.72, 0.26, 0.18, 0.38, "#8A5A48", { ridgeX: false, wall: "#E4DCC8", height: 1.7 });
    pyramid(p, 0.5, 0.45, 0.22, "#4F9A88", 3.2);
    // Clock face on the plaza side.
    ctx.fillStyle = "#F4EFE0";
    ctx.beginPath();
    ctx.arc(0.5, 0.45, 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2A2622";
    ctx.lineWidth = px * 1.2;
    ctx.beginPath();
    ctx.moveTo(0.5, 0.45);
    ctx.lineTo(0.5, 0.42);
    ctx.moveTo(0.5, 0.45);
    ctx.lineTo(0.52, 0.46);
    ctx.stroke();
    // Fountain in the plaza.
    tank(p, 0.5, 0.8, 0.09, "#6FA6C8", 0.4);
    ctx.fillStyle = "#BFE0F0";
    ctx.beginPath();
    ctx.arc(0.5, 0.8, 0.035, 0, Math.PI * 2);
    ctx.fill();
    treeTop(p, 0.12, 0.82, 0.07);
    treeTop(p, 0.88, 0.82, 0.07);
    treeTop(p, 0.12, 0.14, 0.05, 1);
    treeTop(p, 0.88, 0.14, 0.05, 1);
  }
}

/** Small colored dot used at overview zoom, where per-tile detail isn't rendered. */
export function cityDotColor(tier: CityTier): string {
  switch (tier) {
    case "village":
      return "#C9C2B4";
    case "town":
      return "#E0D6B8";
    case "city":
      return "#F2B544";
    case "metropolis":
      return "#F2854C";
  }
}

export function cityDotRadius(tier: CityTier): number {
  switch (tier) {
    case "village":
      return 2.5;
    case "town":
      return 3.5;
    case "city":
      return 5;
    case "metropolis":
      return 7;
  }
}
