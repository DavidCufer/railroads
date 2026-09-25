/**
 * Projection and geometry helpers for `tools/mapgen` (SPEC §4.3 step 2): equirectangular
 * projection with the grid's width/height already chosen (per region, in `regions/<id>.ts`) to
 * match `(east-west)*cos(centerLatitude) / (north-south)` so coastlines aren't stretched.
 */
export interface RegionBounds {
  west: number;
  east: number;
  south: number;
  north: number;
  width: number;
  height: number;
}

export type LonLat = readonly [number, number];
export type TileXY = readonly [number, number];

/** Projects a [lon, lat] point to continuous tile-space [x, y] (not yet rounded to a tile). */
export function project(bounds: RegionBounds, [lon, lat]: LonLat): TileXY {
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * bounds.width;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * bounds.height;
  return [x, y];
}

export function projectPath(bounds: RegionBounds, path: readonly LonLat[]): TileXY[] {
  return path.map((p) => project(bounds, p));
}

/** Standard ray-casting point-in-polygon test, in already-projected tile-space coordinates. */
export function pointInPolygon(x: number, y: number, polygon: readonly TileXY[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i] as TileXY;
    const [xj, yj] = polygon[j] as TileXY;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInAnyPolygon(
  x: number,
  y: number,
  polygons: readonly (readonly TileXY[])[],
): boolean {
  for (const polygon of polygons) {
    if (pointInPolygon(x, y, polygon)) return true;
  }
  return false;
}

/** Squared distance from point (px,py) to the segment (ax,ay)-(bx,by). */
function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/** Minimum distance (tile units) from a point to a polyline. */
export function distanceToPolyline(x: number, y: number, polyline: readonly TileXY[]): number {
  if (polyline.length === 1) {
    const [ax, ay] = polyline[0] as TileXY;
    return Math.hypot(x - ax, y - ay);
  }
  let best = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const [ax, ay] = polyline[i] as TileXY;
    const [bx, by] = polyline[i + 1] as TileXY;
    best = Math.min(best, distToSegmentSq(x, y, ax, ay, bx, by));
  }
  return Math.sqrt(best);
}

/** Walks a polyline (already in tile-space) and returns the ordered, deduplicated sequence of
 * integer tile coordinates it passes through (supercover-ish: steps by whichever axis needs it). */
export function rasterizePolyline(polyline: readonly TileXY[]): TileXY[] {
  const out: TileXY[] = [];
  const pushIfNew = (x: number, y: number): void => {
    const last = out[out.length - 1];
    if (last && last[0] === x && last[1] === y) return;
    out.push([x, y]);
  };
  for (let i = 0; i < polyline.length - 1; i++) {
    const [ax, ay] = polyline[i] as TileXY;
    const [bx, by] = polyline[i + 1] as TileXY;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      pushIfNew(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t));
    }
  }
  return out;
}
