/**
 * City name labels (SPEC §8.3, §4.1, §10.3): render at all zooms, bigger/bolder for higher tiers,
 * with a dark halo for legibility over any terrain. Drawn dynamically every frame (not baked into
 * the terrain chunk cache) so text stays crisp at the current zoom instead of a cached bitmap's
 * fixed resolution. At overview zoom (< 0.5x, no per-tile detail) cities also get a small dot
 * marker, since the terrain chunk itself is a flat fill with no roof clusters baked in.
 */
import type { CityTier } from "../data/cities";
import type { City } from "../sim/economy/types";
import { Camera, OVERVIEW_ZOOM_THRESHOLD, TILE_SIZE } from "./camera";
import { cityDotColor, cityDotRadius } from "./cities";
import { intersectsReserved, type ReservedScreenRect } from "./reservedRects";

const TIER_FONT_PX: Record<CityTier, number> = {
  village: 11,
  town: 13,
  city: 16,
  metropolis: 19,
};

const TIER_WEIGHT: Record<CityTier, string> = {
  village: "400",
  town: "600",
  city: "700",
  metropolis: "800",
};

const TIER_RANK: Record<CityTier, number> = {
  village: 0,
  town: 1,
  city: 2,
  metropolis: 3,
};

/** World-px centroid of a city's footprint tiles (not just its anchor tile). */
export function cityWorldCenter(city: City, mapWidth: number): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const idx of city.tiles) {
    sx += idx % mapWidth;
    sy += Math.floor(idx / mapWidth);
  }
  const count = city.tiles.length;
  return { x: (sx / count + 0.5) * TILE_SIZE, y: (sy / count + 0.5) * TILE_SIZE };
}

export function drawCityLabels(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  cities: readonly City[],
  mapWidth: number,
  reserved: readonly ReservedScreenRect[] = [],
): void {
  const overview = camera.zoom < OVERVIEW_ZOOM_THRESHOLD;

  // Largest-city-first so a small town near a metropolis loses the overlap, not the other way
  // around (SPEC §4.1 declutter — e.g. Washington/Baltimore at low zoom).
  const drawOrder = [...cities].sort((a, b) => {
    const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
    return tierDiff !== 0 ? tierDiff : b.population - a.population;
  });
  const drawnLabelRects: ReservedScreenRect[] = [];

  for (const city of drawOrder) {
    // Overview declutter: only show town-tier-or-above labels when zoomed far out.
    if (overview && city.tier === "village") continue;

    const { x: worldX, y: worldY } = cityWorldCenter(city, mapWidth);
    const screen = camera.worldToScreen(worldX, worldY, viewportW, viewportH);
    if (
      screen.x < -60 ||
      screen.y < -30 ||
      screen.x > viewportW + 60 ||
      screen.y > viewportH + 30
    ) {
      continue;
    }

    if (overview) {
      ctx.fillStyle = cityDotColor(city.tier);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, cityDotRadius(city.tier), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 20, 24, 0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const fontPx = TIER_FONT_PX[city.tier];
    ctx.font = `${TIER_WEIGHT[city.tier]} ${fontPx}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelY = screen.y + (overview ? cityDotRadius(city.tier) + 3 : fontPx * 0.4);

    const halfWidth = ctx.measureText(city.name).width / 2 + 4;
    const box: ReservedScreenRect = {
      x0: screen.x - halfWidth,
      y0: labelY,
      x1: screen.x + halfWidth,
      y1: labelY + fontPx * 1.2,
    };
    if (
      intersectsReserved(reserved, box.x0, box.y0, box.x1, box.y1) ||
      intersectsReserved(drawnLabelRects, box.x0, box.y0, box.x1, box.y1)
    ) {
      // Skip the label but keep the dot already drawn above, so the city is still marked.
      continue;
    }
    drawnLabelRects.push(box);

    ctx.lineWidth = Math.max(2, fontPx * 0.22);
    ctx.strokeStyle = "rgba(10, 12, 16, 0.75)";
    ctx.lineJoin = "round";
    ctx.strokeText(city.name, screen.x, labelY);

    ctx.fillStyle = "#F4F1E8";
    ctx.fillText(city.name, screen.x, labelY);
  }
}
