/**
 * Real World tab region cards (SPEC §4.4: "card per region, with a small preview thumbnail
 * rendered from the map data"). Draws one pixel per tile at the region's native grid size (a
 * region is at most 192x144, so this is cheap and only ever runs once per card) using the same
 * flat terrain palette the overview zoom bucket uses, then lets CSS scale it down with
 * `image-rendering: pixelated` for a crisp, retro thumbnail rather than a blurry resize.
 */
import { decodeUint8 } from "../sim/regions/codec";
import { terrainName } from "../sim/map/terrain";
import type { RegionJson } from "../sim/regions/types";
import { TERRAIN_COLORS } from "./palette";
import { hexToRgb } from "./color";

const TERRAIN_RGB: Record<string, [number, number, number]> = Object.fromEntries(
  Object.entries(TERRAIN_COLORS).map(([terrain, hex]) => [terrain, hexToRgb(hex)]),
);

const CITY_DOT_RGB: [number, number, number] = [242, 181, 68];

export function renderRegionThumbnail(region: RegionJson): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = region.width;
  canvas.height = region.height;
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const terrain = decodeUint8(region.terrainB64);
  const image = ctx.createImageData(region.width, region.height);
  for (let i = 0; i < terrain.length; i++) {
    const [r, g, b] = TERRAIN_RGB[terrainName(terrain[i] as number)] ?? [0, 0, 0];
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  // A dot per city already founded at the region's start year, largest tiers first so a big city's
  // dot isn't hidden under a village's — same declutter idea as the in-game overview labels.
  const founded = region.cities
    .filter((c) => c.tiles.length > 0)
    .sort((a, b) => b.population - a.population);
  for (const city of founded) {
    const x = Math.round(city.anchorX);
    const y = Math.round(city.anchorY);
    const idx = (y * region.width + x) * 4;
    if (idx < 0 || idx + 3 >= image.data.length) continue;
    ctx.fillStyle = `rgb(${CITY_DOT_RGB[0]}, ${CITY_DOT_RGB[1]}, ${CITY_DOT_RGB[2]})`;
    ctx.fillRect(x, y, 1, 1);
  }

  return canvas;
}
