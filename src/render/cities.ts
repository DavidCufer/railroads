/**
 * City building rendering (SPEC §10.3): denser toward the footprint's center so a city reads as a
 * town with a core rather than scattered dots. Above a closeness threshold a tile draws as a
 * dense downtown "block" — rows of roofs along street lines, like row houses; below it, a handful
 * of separate small houses with visible gaps (Phase 3/5 reviews: the original single scattered-
 * roofs layout read as sparse dots even at the core). Phase 11 review: even the dense block still
 * read as a flat grid of axis-aligned rectangles — every building now gets a small rotation
 * jitter, an occasional small gap (green tile showing through, sometimes with a tiny tree) instead
 * of every roof touching its neighbor, and a gable ridge line so roofs read as pitched, not flat
 * colored boxes. Drawn per footprint tile, baked into the terrain chunk cache alongside the other
 * per-tile decorations.
 */
import type { CityTier } from "../data/cities";
import { shadeColor } from "./color";
import { rand } from "./rng";
import { CITY_ROOF_COLORS, CITY_ROOF_SHADOW, CITY_WALL_COLOR } from "./palette";

const STREET_COLOR = "rgba(214, 206, 184, 0.55)";
const TREE_COLOR = "#4A7A3E";
const TREE_SHADOW = "#3A6230";
const GABLE_LINE_COLOR = "rgba(0, 0, 0, 0.22)";
/** Max rotation jitter per building, radians (~9°) — enough to read as "not a perfect grid"
 * without buildings visibly overlapping their neighbors. */
const MAX_ROOF_ROTATION = 0.16;

/** Row/building count and tallness at the dense end, by tier — a village never gets the "block"
 * treatment (it has no downtown), the higher tiers do, more so at higher tiers. */
const TIER_DENSITY: Record<
  CityTier,
  { rows: number; buildingsPerRow: number; tallChance: number; blockAt: number }
> = {
  village: { rows: 1, buildingsPerRow: 3, tallChance: 0, blockAt: 1.1 }, // never (>1 unreachable)
  town: { rows: 2, buildingsPerRow: 3, tallChance: 0.08, blockAt: 0.6 },
  city: { rows: 2, buildingsPerRow: 4, tallChance: 0.22, blockAt: 0.5 },
  metropolis: { rows: 3, buildingsPerRow: 4, tallChance: 0.45, blockAt: 0.4 },
};

/** One building, centered at (cx, cy), with a small rotation jitter and a gable ridge line down
 * its long axis so it reads as a small pitched-roof house rather than a flat colored rectangle. */
function drawRoof(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  color: string,
  tall: boolean,
  size: number,
): void {
  const angle = (rand() - 0.5) * 2 * MAX_ROOF_ROTATION;
  const shadowOffset = size * (tall ? 0.05 : 0.025);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.fillStyle = CITY_ROOF_SHADOW;
  ctx.fillRect(-w / 2 + shadowOffset, -h / 2 + shadowOffset, w, h);

  if (tall) {
    const wallH = h * 0.6;
    ctx.fillStyle = CITY_WALL_COLOR;
    ctx.fillRect(-w / 2, -h / 2 - wallH, w, wallH);
  }

  // Top-lit pitched roof: the half facing the light (up/left) is lighter, the other darker, split
  // by the ridge along the long axis; a hairline outline keeps neighbours from merging.
  const alongX = w >= h;
  ctx.fillStyle = shadeColor(color, 1.22);
  if (alongX) ctx.fillRect(-w / 2, -h / 2, w, h / 2);
  else ctx.fillRect(-w / 2, -h / 2, w / 2, h);
  ctx.fillStyle = shadeColor(color, 0.86);
  if (alongX) ctx.fillRect(-w / 2, 0, w, h / 2);
  else ctx.fillRect(0, -h / 2, w / 2, h);

  ctx.strokeStyle = GABLE_LINE_COLOR;
  ctx.lineWidth = Math.max(0.6, size * 0.014);
  ctx.beginPath();
  if (alongX) {
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
  } else {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, h / 2);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
  ctx.strokeRect(-w / 2, -h / 2, w, h);

  ctx.restore();
}

/** A tiny tree (matching the forest decoration's look, scaled down) — used to fill a gap between
 * buildings so a block's gaps read as "green space", not just an accidental hole. */
function drawGapTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const r = size * (0.07 + rand() * 0.04);
  ctx.fillStyle = TREE_SHADOW;
  ctx.beginPath();
  ctx.arc(cx + r * 0.25, cy + r * 0.25, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = TREE_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Dense downtown block: rows of roofs spanning the tile width. Most buildings sit edge to edge
 * (still reads as built-up, not sparse) but a fraction of slots open up into a small gap — the
 * underlying green tile shows through, occasionally with a small tree — so the block isn't one
 * unbroken rectangle grid. */
function drawDenseBlock(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  rows: number,
  buildingsPerRow: number,
  tallChance: number,
): void {
  const rowH = size / rows;

  for (let r = 0; r < rows; r++) {
    const rowY = py + r * rowH;
    const count = buildingsPerRow + (rand() < 0.5 ? 0 : 1);
    const weights = Array.from({ length: count }, () => 0.65 + rand() * 0.7);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let x = px;
    for (let i = 0; i < count; i++) {
      const slotW = ((weights[i] as number) / totalWeight) * size;

      // ~1 in 6 slots opens into a gap instead of a building (Phase 11 review: "green gaps ...
      // instead of rectangle grids"). Never the very first slot of a row, so a row still visibly
      // fronts the street on its left edge.
      if (i > 0 && rand() < 0.16) {
        if (rand() < 0.5) {
          drawGapTree(ctx, x + slotW / 2, rowY + rowH / 2, size);
        }
        x += slotW;
        continue;
      }

      const gap = slotW * 0.06;
      const w = slotW - gap;
      const h = rowH * (0.78 + rand() * 0.18);
      const ry = rowY + (rowH - h);
      const tall = tallChance > 0 && rand() < tallChance;
      const color = CITY_ROOF_COLORS[(i + r + Math.floor(x)) % CITY_ROOF_COLORS.length] as string;

      drawRoof(ctx, x + w / 2, ry + h / 2, w, h, color, tall, size);
      x += slotW;
    }
  }

  // Street lines at each row boundary — the block reads as fronting onto them.
  ctx.strokeStyle = STREET_COLOR;
  ctx.lineWidth = Math.max(1, size * 0.045);
  for (let r = 1; r < rows; r++) {
    const y = py + r * rowH;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + size, y);
    ctx.stroke();
  }
}

/** Sparse edge houses: a few small separate roofs with real gaps between them, plus an
 * occasional street line — the outskirts fading away from the dense core. */
function drawScatteredHouses(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  closeness: number,
  tallChance: number,
): void {
  const roofs = Math.round(2 + closeness * 2);
  const tileTallChance = tallChance * (0.3 + 0.7 * closeness);

  if (rand() < 0.4 - 0.3 * closeness) {
    const horizontal = rand() < 0.5;
    ctx.strokeStyle = STREET_COLOR;
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    if (horizontal) {
      const y = py + size * (0.3 + rand() * 0.4);
      ctx.moveTo(px, y);
      ctx.lineTo(px + size, y);
    } else {
      const x = px + size * (0.3 + rand() * 0.4);
      ctx.moveTo(x, py);
      ctx.lineTo(x, py + size);
    }
    ctx.stroke();
  }

  // A small tree or two in the open ground around the houses — plenty of green space at the
  // sparse edge already, this just makes it read as deliberate yard/greenery, not empty tile.
  if (rand() < 0.5) {
    drawGapTree(ctx, px + rand() * size, py + rand() * size, size);
  }

  for (let i = 0; i < roofs; i++) {
    const w = size * (0.14 + rand() * 0.1);
    const h = size * (0.12 + rand() * 0.08);
    const rx = px + rand() * (size - w);
    const ry = py + rand() * (size - h);
    const tall = tileTallChance > 0 && rand() < tileTallChance;
    const color = CITY_ROOF_COLORS[(i + Math.floor(rx + ry)) % CITY_ROOF_COLORS.length] as string;

    drawRoof(ctx, rx + w / 2, ry + h / 2, w, h, color, tall, size);
  }
}

/**
 * @param closeness 0 (edge of the city's footprint) to 1 (its centroid) — a dense, touching
 * "block" of buildings near the core (village excepted — it has no downtown), fading to a few
 * scattered separate houses near the edge.
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
  const { rows, buildingsPerRow, tallChance, blockAt } = TIER_DENSITY[tier];
  if (closeness >= blockAt) {
    drawDenseBlock(ctx, px, py, size, rows, buildingsPerRow, tallChance);
    // Cross street along the tile's right edge so streets continue between neighbouring blocks.
    ctx.strokeStyle = STREET_COLOR;
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.beginPath();
    ctx.moveTo(px + size, py);
    ctx.lineTo(px + size, py + size);
    ctx.stroke();
  } else {
    drawScatteredHouses(ctx, px, py, size, closeness, tallChance);
  }
  if (landmark && tier !== "village") drawLandmark(ctx, px, py, size, tier === "town");
}

/** One landmark near the centre from Town tier up: a church (cross-shaped slate roof + steeple) in
 * a town, a town hall (big stone block with a clock tower) in a city or metropolis. */
function drawLandmark(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  church: boolean,
): void {
  const cx = px + size / 2;
  const cy = py + size / 2;
  // Open forecourt so it reads against the roofs around it.
  ctx.fillStyle = "rgba(226, 218, 196, 0.85)";
  ctx.fillRect(px + size * 0.12, py + size * 0.12, size * 0.76, size * 0.76);
  const sh = size * 0.04;
  ctx.fillStyle = CITY_ROOF_SHADOW;
  if (church) {
    // Nave (long) + transept (short) as a cross.
    const nl = size * 0.5;
    const nw = size * 0.17;
    ctx.fillRect(cx - nl / 2 + sh, cy - nw / 2 + sh, nl, nw);
    ctx.fillRect(cx - nw / 2 + sh, cy - nl * 0.36 + sh, nw, nl * 0.72);
    const lit = "#8A93A0";
    ctx.fillStyle = shadeColor(lit, 1.1);
    ctx.fillRect(cx - nl / 2, cy - nw / 2, nl, nw / 2);
    ctx.fillRect(cx - nw / 2, cy - nl * 0.36, nw / 2, nl * 0.72);
    ctx.fillStyle = shadeColor(lit, 0.78);
    ctx.fillRect(cx - nl / 2, cy, nl, nw / 2);
    ctx.fillRect(cx, cy - nl * 0.36, nw / 2, nl * 0.72);
    // Steeple at the west end.
    ctx.fillStyle = "#E8E0CC";
    ctx.fillRect(cx - nl / 2 - nw * 0.1, cy - nw * 0.4, nw * 0.8, nw * 0.8);
    ctx.fillStyle = "#B5533C";
    ctx.fillRect(cx - nl / 2 + nw * 0.05, cy - nw * 0.2, nw * 0.4, nw * 0.4);
  } else {
    const w = size * 0.5;
    const h = size * 0.34;
    ctx.fillRect(cx - w / 2 + sh, cy - h / 2 + sh, w, h);
    ctx.fillStyle = "#D8CFB8";
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = "#6F7B8A";
    ctx.fillRect(cx - w * 0.42, cy - h * 0.34, w * 0.84, h * 0.68);
    ctx.fillStyle = "#95A2B2";
    ctx.fillRect(cx - w * 0.42, cy - h * 0.34, w * 0.84, h * 0.34);
    ctx.fillStyle = "#B5533C";
    ctx.fillRect(cx - size * 0.07, cy - size * 0.07, size * 0.14, size * 0.14);
    ctx.fillStyle = "#F4EFE0";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
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
