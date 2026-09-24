/** Tile-grid index helpers shared by map generation, rendering and later phases. */

export interface TileGrid {
  width: number;
  height: number;
}

export function tileIndex(grid: TileGrid, x: number, y: number): number {
  return y * grid.width + x;
}

export function inBounds(grid: TileGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

/** The 8 grid directions, E first then clockwise. */
export const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
