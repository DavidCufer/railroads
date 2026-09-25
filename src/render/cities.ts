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
  const angle = (Math.random() - 0.5) * 2 * MAX_ROOF_ROTATION;
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

  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  // Gable ridge line (roof shape, not just a flat box) — along whichever axis is longer, so it
  // reads as a real pitched roofline rather than an arbitrary diagonal.
  ctx.strokeStyle = GABLE_LINE_COLOR;
  ctx.lineWidth = Math.max(0.6, size * 0.014);
  ctx.beginPath();
  if (w >= h) {
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
  } else {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, h / 2);
  }
  ctx.stroke();

  ctx.restore();
}

/** A tiny tree (matching the forest decoration's look, scaled down) — used to fill a gap between
 * buildings so a block's gaps read as "green space", not just an accidental hole. */
function drawGapTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const r = size * (0.07 + Math.random() * 0.04);
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
    const count = buildingsPerRow + (Math.random() < 0.5 ? 0 : 1);
    const weights = Array.from({ length: count }, () => 0.65 + Math.random() * 0.7);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let x = px;
    for (let i = 0; i < count; i++) {
      const slotW = ((weights[i] as number) / totalWeight) * size;

      // ~1 in 6 slots opens into a gap instead of a building (Phase 11 review: "green gaps ...
      // instead of rectangle grids"). Never the very first slot of a row, so a row still visibly
      // fronts the street on its left edge.
      if (i > 0 && Math.random() < 0.16) {
        if (Math.random() < 0.5) {
          drawGapTree(ctx, x + slotW / 2, rowY + rowH / 2, size);
        }
        x += slotW;
        continue;
      }

      const gap = slotW * 0.06;
      const w = slotW - gap;
      const h = rowH * (0.78 + Math.random() * 0.18);
      const ry = rowY + (rowH - h);
      const tall = tallChance > 0 && Math.random() < tallChance;
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

  if (Math.random() < 0.4 - 0.3 * closeness) {
    const horizontal = Math.random() < 0.5;
    ctx.strokeStyle = STREET_COLOR;
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    if (horizontal) {
      const y = py + size * (0.3 + Math.random() * 0.4);
      ctx.moveTo(px, y);
      ctx.lineTo(px + size, y);
    } else {
      const x = px + size * (0.3 + Math.random() * 0.4);
      ctx.moveTo(x, py);
      ctx.lineTo(x, py + size);
    }
    ctx.stroke();
  }

  // A small tree or two in the open ground around the houses — plenty of green space at the
  // sparse edge already, this just makes it read as deliberate yard/greenery, not empty tile.
  if (Math.random() < 0.5) {
    drawGapTree(ctx, px + Math.random() * size, py + Math.random() * size, size);
  }

  for (let i = 0; i < roofs; i++) {
    const w = size * (0.14 + Math.random() * 0.1);
    const h = size * (0.12 + Math.random() * 0.08);
    const rx = px + Math.random() * (size - w);
    const ry = py + Math.random() * (size - h);
    const tall = tileTallChance > 0 && Math.random() < tileTallChance;
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
): void {
  const { rows, buildingsPerRow, tallChance, blockAt } = TIER_DENSITY[tier];
  if (closeness >= blockAt) {
    drawDenseBlock(ctx, px, py, size, rows, buildingsPerRow, tallChance);
  } else {
    drawScatteredHouses(ctx, px, py, size, closeness, tallChance);
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
