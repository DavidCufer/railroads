/** Pan/zoom camera over the map (SPEC §4.1, §5.2). World coordinates are pixels at zoom 1. */

export const TILE_SIZE = 32;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
/** Below this zoom, the renderer switches to the simplified "overview" style. */
export const OVERVIEW_ZOOM_THRESHOLD = 0.5;

/** Fraction of the viewport that may show past the map edge (PLAN Phase 26B: ~1/4 screen). */
export const EDGE_MARGIN_FRACTION = 0.25;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export class Camera {
  /** World-pixel position (zoom-1 scale) currently at the center of the viewport. */
  x: number;
  y: number;
  zoom = 1;
  /** Viewport size in CSS px, set by the renderer each frame; 0 until known. */
  private viewportW = 0;
  private viewportH = 0;

  constructor(
    private mapTilesWidth: number,
    private mapTilesHeight: number,
  ) {
    this.x = (mapTilesWidth * TILE_SIZE) / 2;
    this.y = (mapTilesHeight * TILE_SIZE) / 2;
  }

  get worldWidth(): number {
    return this.mapTilesWidth * TILE_SIZE;
  }

  get worldHeight(): number {
    return this.mapTilesHeight * TILE_SIZE;
  }

  setMapSize(tilesWidth: number, tilesHeight: number): void {
    this.mapTilesWidth = tilesWidth;
    this.mapTilesHeight = tilesHeight;
    this.x = (tilesWidth * TILE_SIZE) / 2;
    this.y = (tilesHeight * TILE_SIZE) / 2;
    this.zoom = 1;
  }

  screenToWorld(sx: number, sy: number, viewportW: number, viewportH: number): WorldPoint {
    return {
      x: this.x + (sx - viewportW / 2) / this.zoom,
      y: this.y + (sy - viewportH / 2) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number, viewportW: number, viewportH: number): ScreenPoint {
    return {
      x: (wx - this.x) * this.zoom + viewportW / 2,
      y: (wy - this.y) * this.zoom + viewportH / 2,
    };
  }

  /** Pans by a screen-space delta (e.g. pointer movement in CSS px). */
  pan(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clampToMap();
  }

  /** Zooms by `factor` (>1 zooms in) keeping the given screen point fixed in world space. */
  zoomAt(
    screenX: number,
    screenY: number,
    factor: number,
    viewportW: number,
    viewportH: number,
  ): void {
    this.viewportW = viewportW;
    this.viewportH = viewportH;
    const before = this.screenToWorld(screenX, screenY, viewportW, viewportH);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.screenToWorld(screenX, screenY, viewportW, viewportH);
    this.x -= after.x - before.x;
    this.y -= after.y - before.y;
    this.clampToMap();
  }

  /** Tells the camera the viewport size (CSS px) and re-clamps — called every frame, so a resize,
   * a rotation or a direct `x`/`y` assignment can't leave the view outside the map. */
  setViewport(width: number, height: number): void {
    this.viewportW = width;
    this.viewportH = height;
    this.clampToMap();
  }

  /** Re-applies the pan limits (call after setting `zoom`, `x` or `y` directly). */
  clampToMap(): void {
    this.x = this.clampAxis(this.x, this.worldWidth, this.viewportW);
    this.y = this.clampAxis(this.y, this.worldHeight, this.viewportH);
  }

  /** At most `EDGE_MARGIN_FRACTION` of the viewport may show beyond the map edge on either side;
   * a map smaller than the view on that axis is centred. */
  private clampAxis(v: number, world: number, viewport: number): number {
    if (viewport <= 0) return clamp(v, 0, world);
    const half = viewport / (2 * this.zoom);
    const margin = (viewport * EDGE_MARGIN_FRACTION) / this.zoom;
    const min = half - margin;
    const max = world - half + margin;
    return min > max ? world / 2 : clamp(v, min, max);
  }
}
