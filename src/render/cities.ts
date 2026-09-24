/**
 * City building rendering (SPEC §10.3): denser toward the footprint's center so a city reads as a
 * town with a core rather than scattered dots. Above a closeness threshold a tile draws as a
 * dense downtown "block" — rows of roofs butted together along street lines, like row houses;
 * below it, a handful of separate small houses with visible gaps (Phase 3/5 reviews: the original
 * single scattered-roofs layout read as sparse dots even at the core). Drawn per footprint tile,
 * baked into the terrain chunk cache alongside the other per-tile decorations.
 */
import type { CityTier } from "../data/cities";
import { CITY_ROOF_COLORS, CITY_ROOF_SHADOW, CITY_WALL_COLOR } from "./palette";

const STREET_COLOR = "rgba(214, 206, 184, 0.55)";

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

/** Dense downtown block: rows of roofs spanning the full tile width, touching (no gaps) —
 * reads as a solid built-up block rather than individual houses. */
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
      const w = ((weights[i] as number) / totalWeight) * size;
      const h = rowH * (0.8 + Math.random() * 0.18);
      const ry = rowY + (rowH - h);
      const tall = tallChance > 0 && Math.random() < tallChance;
      const shadowOffset = size * (tall ? 0.05 : 0.02);

      ctx.fillStyle = CITY_ROOF_SHADOW;
      ctx.fillRect(x + shadowOffset, ry + shadowOffset, w, h);

      if (tall) {
        const wallH = h * 0.6;
        ctx.fillStyle = CITY_WALL_COLOR;
        ctx.fillRect(x, ry - wallH, w, wallH);
      }

      const color = CITY_ROOF_COLORS[(i + r + Math.floor(x)) % CITY_ROOF_COLORS.length] as string;
      ctx.fillStyle = color;
      ctx.fillRect(x, ry, w, h);
      x += w;
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

  for (let i = 0; i < roofs; i++) {
    const w = size * (0.14 + Math.random() * 0.1);
    const h = size * (0.12 + Math.random() * 0.08);
    const rx = px + Math.random() * (size - w);
    const ry = py + Math.random() * (size - h);
    const tall = tileTallChance > 0 && Math.random() < tileTallChance;
    const shadowOffset = size * (tall ? 0.06 : 0.03);

    ctx.fillStyle = CITY_ROOF_SHADOW;
    ctx.fillRect(rx + shadowOffset, ry + shadowOffset, w, h);

    if (tall) {
      // A taller block reads as a short wall face above its roof line.
      const wallH = h * 0.7;
      ctx.fillStyle = CITY_WALL_COLOR;
      ctx.fillRect(rx, ry - wallH, w, wallH);
    }

    const color = CITY_ROOF_COLORS[(i + Math.floor(rx + ry)) % CITY_ROOF_COLORS.length] as string;
    ctx.fillStyle = color;
    ctx.fillRect(rx, ry, w, h);
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
