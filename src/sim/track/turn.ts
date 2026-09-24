/**
 * Turn rule (SPEC §5.1): a train may pass through a node from edge A to edge B only if the
 * heading change is ≤45°. Sharper geometry (up to and including a full junction/crossing) is
 * still buildable — it just isn't traversable as a through route outside stations.
 */
import { directionIndex, directionSteps } from "./graph";
import type { TrackGraph } from "./graph";

/** True if turning from a heading of `dirIn` (arriving) to `dirOut` (leaving) is ≤45°.
 * Both are DIRS8 indices. */
export function turnAllowed(dirIn: number, dirOut: number): boolean {
  return directionSteps(dirIn, dirOut) <= 1;
}

function tileXY(tile: number, mapWidth: number): [number, number] {
  return [tile % mapWidth, Math.floor(tile / mapWidth)];
}

/** True if a train can pass straight through `node`, arriving from `prevTile` and continuing to
 * `nextTile` (does not check that either edge actually exists in the graph). */
export function canTraverse(
  prevTile: number,
  node: number,
  nextTile: number,
  mapWidth: number,
): boolean {
  const [px, py] = tileXY(prevTile, mapWidth);
  const [nx, ny] = tileXY(node, mapWidth);
  const [qx, qy] = tileXY(nextTile, mapWidth);
  const dirIn = directionIndex(nx - px, ny - py);
  const dirOut = directionIndex(qx - nx, qy - ny);
  return turnAllowed(dirIn, dirOut);
}

/** True if `tile` has two edges meeting at an angle sharper than 45° — the "small red marker"
 * junction case in the build preview (SPEC §5.1/§5.2): buildable, but not through-traversable. */
export function hasSharpJunction(graph: TrackGraph, tile: number): boolean {
  const edges = graph.edgesAt(tile);
  const legs = edges.map((e) => (e.a === tile ? e.direction : (e.direction + 4) % 8));
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      if (directionSteps(legs[i] as number, legs[j] as number) <= 2) return true;
    }
  }
  return false;
}
