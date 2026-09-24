/** Small tile/edge geometry helpers shared by routing, movement and rendering. */
import { directionIndex } from "../track/graph";
import type { TrackEdge } from "../track/types";

export function tileXY(tile: number, mapWidth: number): [number, number] {
  return [tile % mapWidth, Math.floor(tile / mapWidth)];
}

/** DIRS8 index of `edge`'s direction as traveled starting from `fromTile` (its `a` or `b` end). */
export function edgeDirectionFrom(edge: TrackEdge, fromTile: number): number {
  return edge.a === fromTile ? edge.direction : (edge.direction + 4) % 8;
}

/** DIRS8 index of travel from tile `a` to tile `b` (need not be graph-adjacent — used for a
 * bridge's jump edge too, since both ends still lie along one of the 8 compass directions). */
export function directionBetween(a: number, b: number, mapWidth: number): number {
  const [ax, ay] = tileXY(a, mapWidth);
  const [bx, by] = tileXY(b, mapWidth);
  return directionIndex(Math.sign(bx - ax), Math.sign(by - ay));
}

/** Length of `edge` in tiles: 1 (or √2 diagonal) per grid step, including any spanned bridge
 * tiles — a bridge is a single straight jump edge, so this is just its total span. */
export function edgeLengthTiles(edge: TrackEdge): number {
  const steps = edge.bridgeSpan.length + 1;
  const diagonal = edge.direction % 2 === 1;
  return steps * (diagonal ? Math.SQRT2 : 1);
}

/** Octile tile-distance between two tiles (admissible heuristic for tile-length-costed search). */
export function octileTileDistance(a: number, b: number, mapWidth: number): number {
  const [ax, ay] = tileXY(a, mapWidth);
  const [bx, by] = tileXY(b, mapWidth);
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  const straight = Math.abs(dx - dy);
  const diag = Math.min(dx, dy);
  return straight + diag * Math.SQRT2;
}
