/**
 * City building rendering (SPEC §10.3): clusters of small roofs, denser and with more/taller
 * "blocks" (drop-shadowed) at higher tiers. Drawn per footprint tile, baked into the terrain
 * chunk cache alongside the other per-tile decorations.
 */
import type { CityTier } from "../data/cities";
import { CITY_ROOF_COLORS, CITY_ROOF_SHADOW, CITY_WALL_COLOR } from "./palette";

/** Roof count per tile and how often one reads as a taller "block", by tier. */
const TIER_DENSITY: Record<CityTier, { roofs: number; tallChance: number }> = {
  village: { roofs: 3, tallChance: 0 },
  town: { roofs: 4, tallChance: 0.05 },
  city: { roofs: 5, tallChance: 0.15 },
  metropolis: { roofs: 6, tallChance: 0.35 },
};

export function drawCityRoofs(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  tier: CityTier,
): void {
  const { roofs, tallChance } = TIER_DENSITY[tier];
  for (let i = 0; i < roofs; i++) {
    const w = size * (0.16 + Math.random() * 0.12);
    const h = size * (0.13 + Math.random() * 0.1);
    const rx = px + Math.random() * (size - w);
    const ry = py + Math.random() * (size - h);
    const tall = tallChance > 0 && Math.random() < tallChance;
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
