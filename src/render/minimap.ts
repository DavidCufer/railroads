/**
 * Mini-map (SPEC §10.1: "whole map, viewport rectangle, tap to jump", bottom-left, toggle). Drawn
 * directly into the main game canvas in screen space (no separate DOM canvas) — the terrain/city/
 * track picture is cached to a small offscreen canvas and only rebuilt when the map's content
 * actually changes (`trackVersion`/`mapContentVersion`), not every frame; only the viewport
 * rectangle and station dots are redrawn per frame, both cheap.
 */
import { safeInsets } from "./safeInsets";
import type { GameMap } from "../sim/map/types";
import type { TrackGraph } from "../sim/track/graph";
import type { Station } from "../sim/stations/types";
import type { City } from "../sim/economy/types";
import { terrainId, type Terrain } from "../sim/map/terrain";
import type { Industry } from "../sim/economy/types";
import { shoreDistanceField } from "./terrain";
import { industryMarkerColor } from "./zoomMarkers";
import { Camera, TILE_SIZE } from "./camera";
import {
  MINIMAP_BG,
  MINIMAP_CITY_COLOR,
  MINIMAP_PEAK_COLOR,
  MINIMAP_TERRAIN_COLORS,
  MINIMAP_WATER_DEEP,
  MINIMAP_WATER_SHALLOW,
  MINIMAP_STATION_COLOR,
  MINIMAP_TRACK_COLOR,
  MINIMAP_VIEWPORT_BORDER,
} from "./palette";

const WATER_ID = terrainId("water");
const MOUNTAIN_ID = terrainId("mountain");
/** Tiles from the shore at which mini-map water reaches its deepest colour. */
const WATER_DEPTH_REACH = 8;
const CITY_SQUARE_PX: Record<City["tier"], number> = {
  village: 2,
  town: 3,
  city: 4,
  metropolis: 5,
};

type Rgb = readonly [number, number, number];
function rgbOf(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const WATER_SHALLOW_RGB = rgbOf(MINIMAP_WATER_SHALLOW);
const WATER_DEEP_RGB = rgbOf(MINIMAP_WATER_DEEP);
const MOUNTAIN_RGB = rgbOf(MINIMAP_TERRAIN_COLORS.mountain);
const PEAK_RGB = rgbOf(MINIMAP_PEAK_COLOR);
const PLAIN_RGB = rgbOf(MINIMAP_TERRAIN_COLORS.plain);
const TERRAIN_RGB: Array<Rgb | undefined> = [];
for (const t of Object.keys(MINIMAP_TERRAIN_COLORS) as Terrain[]) {
  TERRAIN_RGB[terrainId(t)] = rgbOf(MINIMAP_TERRAIN_COLORS[t]);
}

export interface MiniMapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MINIMAP_SIZE_PX = 120;
const MINIMAP_MARGIN_BOTTOM = 8;
/** Clear of the left build toolbar's column (SPEC §10.1 puts both "bottom-left" — the toolbar is a
 * full-height column at `left:8px` that's ~56px wide, so the mini-map starts past it rather than
 * sitting underneath/behind it; matches the debug seed/size controls' own `left:68px` convention
 * for "just clear of the toolbar"). */
const MINIMAP_MARGIN_LEFT = 68;

export class MiniMapRenderer {
  private map: GameMap;
  private cache: HTMLCanvasElement | null = null;
  private cacheKey = "";

  constructor(map: GameMap) {
    this.map = map;
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.cache = null;
    this.cacheKey = "";
  }

  private buildCache(
    trackGraph: TrackGraph,
    cities: readonly City[],
    industries: readonly Industry[],
    sizePx: number,
  ): HTMLCanvasElement {
    const map = this.map;
    const aspect = map.height / map.width;
    const w = sizePx;
    const h = Math.max(1, Math.round(sizePx * aspect));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const cctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    // Ground: every mini-map pixel is the average colour of the tiles under it (a box filter, so
    // forests, hills and coasts stay soft instead of aliasing to one sampled tile).
    const shore = shoreDistanceField(map);
    const tileRgb = new Uint8Array(map.width * map.height * 3);
    for (let idx = 0; idx < map.width * map.height; idx++) {
      const id = map.terrain[idx] as number;
      let rgb: readonly [number, number, number];
      if (id === WATER_ID) {
        rgb = mixRgb(
          WATER_SHALLOW_RGB,
          WATER_DEEP_RGB,
          Math.min(1, Math.max(0, (shore[idx] as number) - 1) / WATER_DEPTH_REACH),
        );
      } else if (id === MOUNTAIN_ID) {
        // Peaks lighter: the higher the mountain tile, the closer to the snow colour.
        const peak = Math.min(1, Math.max(0, ((map.elevation[idx] as number) - 6) / 6));
        rgb = mixRgb(MOUNTAIN_RGB, PEAK_RGB, peak * 0.85);
      } else {
        rgb = TERRAIN_RGB[id] ?? PLAIN_RGB;
      }
      tileRgb[idx * 3] = rgb[0];
      tileRgb[idx * 3 + 1] = rgb[1];
      tileRgb[idx * 3 + 2] = rgb[2];
    }
    const img = cctx.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      const ty0 = Math.min(map.height - 1, Math.floor((py / h) * map.height));
      const ty1 = Math.min(map.height, Math.max(ty0 + 1, Math.ceil(((py + 1) / h) * map.height)));
      for (let px = 0; px < w; px++) {
        const tx0 = Math.min(map.width - 1, Math.floor((px / w) * map.width));
        const tx1 = Math.min(map.width, Math.max(tx0 + 1, Math.ceil(((px + 1) / w) * map.width)));
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let ty = ty0; ty < ty1; ty++) {
          for (let tx = tx0; tx < tx1; tx++) {
            const o = (ty * map.width + tx) * 3;
            r += tileRgb[o] as number;
            g += tileRgb[o + 1] as number;
            b += tileRgb[o + 2] as number;
            n++;
          }
        }
        const o = (py * w + px) * 4;
        img.data[o] = r / n;
        img.data[o + 1] = g / n;
        img.data[o + 2] = b / n;
        img.data[o + 3] = 255;
      }
    }
    cctx.putImageData(img, 0, 0);

    // Track: thin dark lines between edge endpoints.
    cctx.strokeStyle = MINIMAP_TRACK_COLOR;
    cctx.lineWidth = 1;
    cctx.beginPath();
    for (const edge of trackGraph.allEdges()) {
      const ax = ((edge.a % map.width) / map.width) * w;
      const ay = (Math.floor(edge.a / map.width) / map.height) * h;
      const bx = ((edge.b % map.width) / map.width) * w;
      const by = (Math.floor(edge.b / map.width) / map.height) * h;
      cctx.moveTo(ax, ay);
      cctx.lineTo(bx, by);
    }
    cctx.stroke();

    // Industries: tiny dots in the colour of their main product, on a dark pip so they read on any
    // ground.
    industries.forEach((ind, i) => {
      if ((map.industryId[ind.y * map.width + ind.x] as number) !== i) return;
      const x = Math.floor(((ind.x + 0.5) / map.width) * w);
      const y = Math.floor(((ind.y + 0.5) / map.height) * h);
      cctx.fillStyle = "rgba(14, 14, 18, 0.75)";
      cctx.fillRect(x - 1, y - 1, 3, 3);
      cctx.fillStyle = industryMarkerColor(ind.type);
      cctx.fillRect(x, y, 2, 2);
    });

    // Cities: small red squares at the footprint centre, bigger for bigger cities.
    for (const city of cities) {
      if (city.tiles.length === 0) continue;
      let sx = 0;
      let sy = 0;
      for (const idx of city.tiles) {
        sx += idx % map.width;
        sy += Math.floor(idx / map.width);
      }
      const side = CITY_SQUARE_PX[city.tier];
      const x = Math.round(((sx / city.tiles.length + 0.5) / map.width) * w - side / 2);
      const y = Math.round(((sy / city.tiles.length + 0.5) / map.height) * h - side / 2);
      cctx.fillStyle = "rgba(14, 14, 18, 0.7)";
      cctx.fillRect(x - 0.5, y - 0.5, side + 1, side + 1);
      cctx.fillStyle = MINIMAP_CITY_COLOR;
      cctx.fillRect(x, y, side, side);
    }

    return canvas;
  }

  /** The mini-map's fixed screen rect (bottom-left, SPEC §10.1) at the given viewport size. */
  screenRect(viewportH: number, sizePx: number = MINIMAP_SIZE_PX): MiniMapRect {
    const aspect = this.map.height / this.map.width;
    const width = sizePx;
    const height = Math.max(1, Math.round(sizePx * aspect));
    return {
      x: MINIMAP_MARGIN_LEFT + safeInsets().left,
      y: viewportH - MINIMAP_MARGIN_BOTTOM - safeInsets().bottom - height,
      width,
      height,
    };
  }

  /** Converts a tap at screen `(sx, sy)` into world coordinates, or null if outside the mini-map's
   * rect — used for SPEC §10.1's "tap to jump". */
  worldPointAt(
    sx: number,
    sy: number,
    viewportH: number,
    sizePx: number = MINIMAP_SIZE_PX,
  ): { x: number; y: number } | null {
    const rect = this.screenRect(viewportH, sizePx);
    if (sx < rect.x || sx > rect.x + rect.width || sy < rect.y || sy > rect.y + rect.height) {
      return null;
    }
    const fracX = (sx - rect.x) / rect.width;
    const fracY = (sy - rect.y) / rect.height;
    return {
      x: fracX * this.map.width * TILE_SIZE,
      y: fracY * this.map.height * TILE_SIZE,
    };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportW: number,
    viewportH: number,
    trackGraph: TrackGraph,
    stations: readonly Station[],
    cities: readonly City[],
    industries: readonly Industry[],
    trackVersion: number,
    mapContentVersion: number,
    sizePx: number = MINIMAP_SIZE_PX,
  ): void {
    const rect = this.screenRect(viewportH, sizePx);
    const key = `${sizePx}|${trackVersion}|${mapContentVersion}`;
    if (!this.cache || this.cacheKey !== key) {
      this.cache = this.buildCache(trackGraph, cities, industries, sizePx);
      this.cacheKey = key;
    }

    ctx.save();
    ctx.fillStyle = MINIMAP_BG;
    ctx.fillRect(rect.x - 3, rect.y - 3, rect.width + 6, rect.height + 6);
    ctx.drawImage(this.cache, rect.x, rect.y, rect.width, rect.height);

    // Stations as small dots.
    ctx.fillStyle = MINIMAP_STATION_COLOR;
    for (const station of stations) {
      const x = station.tile % this.map.width;
      const y = Math.floor(station.tile / this.map.width);
      const px = rect.x + (x / this.map.width) * rect.width;
      const py = rect.y + (y / this.map.height) * rect.height;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }

    // Viewport rectangle.
    const topLeft = camera.screenToWorld(0, 0, viewportW, viewportH);
    const bottomRight = camera.screenToWorld(viewportW, viewportH, viewportW, viewportH);
    const mapWorldW = this.map.width * TILE_SIZE;
    const mapWorldH = this.map.height * TILE_SIZE;
    const vx0 = rect.x + (Math.max(0, topLeft.x) / mapWorldW) * rect.width;
    const vy0 = rect.y + (Math.max(0, topLeft.y) / mapWorldH) * rect.height;
    const vx1 = rect.x + (Math.min(mapWorldW, bottomRight.x) / mapWorldW) * rect.width;
    const vy1 = rect.y + (Math.min(mapWorldH, bottomRight.y) / mapWorldH) * rect.height;
    ctx.strokeStyle = MINIMAP_VIEWPORT_BORDER;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx0, vy0, Math.max(2, vx1 - vx0), Math.max(2, vy1 - vy0));

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }
}
