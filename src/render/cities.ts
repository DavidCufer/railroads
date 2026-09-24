/**
 * City building rendering (SPEC §10.3): clusters of small roofs, denser and with more/taller
 * "blocks" (drop-shadowed) at higher tiers, and denser toward the footprint's center so a city
 * reads as a town with a core rather than scattered dots (Phase 3 review). Drawn per footprint
 * tile, baked into the terrain chunk cache alongside the other per-tile decorations.
 */
import type { CityTier } from "../data/cities";
import { CITY_ROOF_COLORS, CITY_ROOF_SHADOW, CITY_WALL_COLOR } from "./palette";

const STREET_COLOR = "rgba(214, 206, 184, 0.55)";

/** Roof count/tallness at the footprint's edge and at its center, by tier — interpolated by
 * `closeness` (0 at the edge, 1 at the center). */
const TIER_DENSITY: Record<CityTier, { edgeRoofs: number; coreRoofs: number; tallChance: number }> =
  {
    village: { edgeRoofs: 2, coreRoofs: 4, tallChance: 0 },
    town: { edgeRoofs: 2, coreRoofs: 6, tallChance: 0.08 },
    city: { edgeRoofs: 3, coreRoofs: 7, tallChance: 0.22 },
    metropolis: { edgeRoofs: 3, coreRoofs: 8, tallChance: 0.45 },
  };

/**
 * @param closeness 0 (edge of the city's footprint) to 1 (its centroid) — denser, taller roofs
 * and no streets near the center; sparser roofs with the occasional street gap near the edge.
 */
export function drawCityRoofs(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  tier: CityTier,
  closeness = 1,
): void {
  const { edgeRoofs, coreRoofs, tallChance } = TIER_DENSITY[tier];
  const roofs = Math.round(edgeRoofs + (coreRoofs - edgeRoofs) * closeness);
  const tileTallChance = tallChance * (0.3 + 0.7 * closeness);

  // A light street line between blocks — more likely away from the dense core, never right at it.
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
