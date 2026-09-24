/** Pan/zoom camera over the map (SPEC §4.1, §5.2). World coordinates are pixels at zoom 1. */

export const TILE_SIZE = 32;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
/** Below this zoom, the renderer switches to the simplified "overview" style. */
export const OVERVIEW_ZOOM_THRESHOLD = 0.5;

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
    const before = this.screenToWorld(screenX, screenY, viewportW, viewportH);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.screenToWorld(screenX, screenY, viewportW, viewportH);
    this.x -= after.x - before.x;
    this.y -= after.y - before.y;
    this.clampToMap();
  }

  private clampToMap(): void {
    // Allow a little overscroll so a small map doesn't feel glued to the edges, but keep the
    // camera center within the map's bounding box.
    this.x = clamp(this.x, 0, this.worldWidth);
    this.y = clamp(this.y, 0, this.worldHeight);
  }
}
