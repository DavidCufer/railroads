/**
 * Mini-map (SPEC §10.1: "whole map, viewport rectangle, tap to jump", bottom-left, toggle). Drawn
 * directly into the main game canvas in screen space (no separate DOM canvas) — the terrain/city/
 * track picture is cached to a small offscreen canvas and only rebuilt when the map's content
 * actually changes (`trackVersion`/`mapContentVersion`), not every frame; only the viewport
 * rectangle and station dots are redrawn per frame, both cheap.
 */
import type { GameMap } from "../sim/map/types";
import type { TrackGraph } from "../sim/track/graph";
import type { Station } from "../sim/stations/types";
import type { City } from "../sim/economy/types";
import { terrainId } from "../sim/map/terrain";
import { Camera, TILE_SIZE } from "./camera";
import {
  CITY_ROOF_COLORS,
  MINIMAP_BG,
  MINIMAP_STATION_COLOR,
  MINIMAP_TRACK_COLOR,
  MINIMAP_VIEWPORT_BORDER,
  TERRAIN_COLORS,
  WATER_DEEP_COLOR,
} from "./palette";

const WATER_ID = terrainId("water");

export interface MiniMapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MINIMAP_SIZE_PX = 120;
const MINIMAP_MARGIN = 8;

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

    const img = cctx.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      const ty = Math.min(map.height - 1, Math.floor((py / h) * map.height));
      for (let px = 0; px < w; px++) {
        const tx = Math.min(map.width - 1, Math.floor((px / w) * map.width));
        const idx = ty * map.width + tx;
        const isWater = (map.terrain[idx] as number) === WATER_ID;
        const hex = isWater ? WATER_DEEP_COLOR : TERRAIN_COLORS.plain;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const o = (py * w + px) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    cctx.putImageData(img, 0, 0);

    // Cities: a small tinted patch per footprint tile, cycling the same roof colors used on-map.
    for (const city of cities) {
      cctx.fillStyle = CITY_ROOF_COLORS[city.id % CITY_ROOF_COLORS.length] as string;
      for (const idx of city.tiles) {
        const x = idx % map.width;
        const y = Math.floor(idx / map.width);
        const px = Math.floor((x / map.width) * w);
        const py = Math.floor((y / map.height) * h);
        cctx.fillRect(px, py, 1, 1);
      }
    }

    // Track: thin lines between edge endpoints.
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

    return canvas;
  }

  /** The mini-map's fixed screen rect (bottom-left, SPEC §10.1) at the given viewport size. */
  screenRect(viewportH: number, sizePx: number = MINIMAP_SIZE_PX): MiniMapRect {
    const aspect = this.map.height / this.map.width;
    const width = sizePx;
    const height = Math.max(1, Math.round(sizePx * aspect));
    return {
      x: MINIMAP_MARGIN,
      y: viewportH - MINIMAP_MARGIN - height,
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
    trackVersion: number,
    mapContentVersion: number,
    sizePx: number = MINIMAP_SIZE_PX,
  ): void {
    const rect = this.screenRect(viewportH, sizePx);
    const key = `${sizePx}|${trackVersion}|${mapContentVersion}`;
    if (!this.cache || this.cacheKey !== key) {
      this.cache = this.buildCache(trackGraph, cities, sizePx);
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
