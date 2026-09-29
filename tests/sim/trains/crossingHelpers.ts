/** Test-side geometry for crossing/junction overlap checks (independent of the sim's own claim code). */
import type { GameState } from "../../../src/sim/state";
import type { Train } from "../../../src/sim/trains/types";
import { CAR_LENGTH_TILES, LOCO_LENGTH_TILES } from "../../../src/data/trains";
import { edgeLengthTiles } from "../../../src/sim/trains/geometry";

/** Radius (tiles) within which a body point counts as being "on" a node. */
export const NODE_RADIUS = 0.3;

function xy(tile: number, w: number): [number, number] {
  return [tile % w, Math.floor(tile / w)];
}

/** Sample points (tile-space centres) along the train body, head first, every 0.05 tile. */
export function bodyPoints(state: GameState, t: Train): Array<[number, number]> {
  const w = state.map.width;
  const length = LOCO_LENGTH_TILES + t.cars.length * CAR_LENGTH_TILES;
  const pts: Array<[number, number]> = [];
  const a = t.route[t.routeIndex];
  if (a === undefined) return pts;
  const b = t.route[t.routeIndex + 1];
  const [ax, ay] = xy(a, w);
  const [bx, by] = b !== undefined ? xy(b, w) : [ax, ay];
  const headX = ax + (bx - ax) * t.edgeProgress;
  const headY = ay + (by - ay) * t.edgeProgress;
  // Walk back from the head along route[routeIndex], route[routeIndex-1], ...
  let px = headX;
  let py = headY;
  let remaining = length;
  pts.push([px + 0.5, py + 0.5]);
  let i = t.routeIndex;
  while (remaining > 0 && i >= 0) {
    const [cx, cy] = xy(t.route[i] as number, w);
    const segLen = Math.hypot(px - cx, py - cy);
    const step = 0.05;
    for (let d = step; d <= segLen + 1e-9 && d <= remaining + 1e-9; d += step) {
      pts.push([px + ((cx - px) / segLen) * d + 0.5, py + ((cy - py) / segLen) * d + 0.5]);
    }
    remaining -= segLen;
    px = cx;
    py = cy;
    i--;
  }
  return pts;
}

export function occupies(state: GameState, t: Train, node: number): boolean {
  const [nx, ny] = xy(node, state.map.width);
  return bodyPoints(state, t).some(
    ([x, y]) => Math.hypot(x - (nx + 0.5), y - (ny + 0.5)) <= NODE_RADIUS,
  );
}

/** Junction/crossing nodes (degree >= 3, not a station) in the current graph. */
export function conflictNodes(state: GameState): number[] {
  const stations = new Set(state.stations.map((s) => s.tile));
  return state.trackGraph
    .allNodes()
    .filter((n) => state.trackGraph.neighborsOf(n).length >= 3 && !stations.has(n));
}

/** Pairs of trains that overlap on a conflict node right now. */
export function overlapsNow(state: GameState): string[] {
  const out: string[] = [];
  for (const node of conflictNodes(state)) {
    const on = state.trains.filter((t) => occupies(state, t, node));
    for (let i = 0; i < on.length; i++)
      for (let j = i + 1; j < on.length; j++)
        if (!laneSeparated(state, node, on[i]!, on[j]!))
          out.push(`trains ${on[i]!.id}&${on[j]!.id} on node ${node}`);
  }
  return out;
}

export { edgeLengthTiles };

/** The (in, out) neighbours of `node` on `t`'s route, taken at the occurrence nearest its head. */
export function movementAt(t: Train, node: number): [number, number] | undefined {
  let best = -1;
  for (let i = 0; i < t.route.length; i++)
    if (
      t.route[i] === node &&
      (best < 0 || Math.abs(i - t.routeIndex) < Math.abs(best - t.routeIndex))
    )
      best = i;
  if (best < 1 || best + 1 >= t.route.length) return undefined;
  return [t.route[best - 1] as number, t.route[best + 1] as number];
}

/** Opposing movements over the same two double-track legs use separate lanes (no conflict). */
export function laneSeparated(state: GameState, node: number, a: Train, b: Train): boolean {
  const ma = movementAt(a, node);
  const mb = movementAt(b, node);
  if (!ma || !mb || ma[0] !== mb[1] || ma[1] !== mb[0]) return false;
  const e1 = state.trackGraph.getEdge(node, ma[0]);
  const e2 = state.trackGraph.getEdge(node, ma[1]);
  return !!e1 && !!e2 && e1.double && e2.double;
}

/** Crossing interlock (PLAN Phase 25A): no two trains overlap on a junction/crossing node, except
 * where a station is involved (stations are passing places) or the node only became a junction
 * while a train was already at it ("grandfathered" until that train leaves). */
export function makeCrossingWatch(): (state: GameState, log: string[]) => void {
  const known = new Set<number>();
  const grandfathered = new Map<number, Set<number>>();
  return (state, log) => {
    const stations = state.stations.map((s) => s.tile);
    const nodes = conflictNodes(state);
    for (const node of nodes) {
      if (!known.has(node)) {
        known.add(node);
        const [nx, ny] = [node % state.map.width, Math.floor(node / state.map.width)];
        const near = new Set<number>();
        for (const t of state.trains) {
          const a = t.route[t.routeIndex];
          if (a === undefined) continue;
          const ax = a % state.map.width;
          const ay = Math.floor(a / state.map.width);
          if (Math.hypot(ax - nx, ay - ny) <= 7) near.add(t.id);
        }
        grandfathered.set(node, near);
      }
      const on = state.trains.filter((t) => occupies(state, t, node));
      const gf = grandfathered.get(node);
      if (gf) for (const id of [...gf]) if (!on.some((t) => t.id === id)) gf.delete(id);
      for (let i = 0; i < on.length; i++)
        for (let j = i + 1; j < on.length; j++) {
          const a = on[i]!;
          const b = on[j]!;
          if (gf?.has(a.id) || gf?.has(b.id)) continue;
          if (laneSeparated(state, node, a, b)) continue;
          if (stations.some((st) => occupies(state, a, st) || occupies(state, b, st))) continue;
          log.push(`tick ${state.ticks}: trains ${a.id}&${b.id} overlap on junction ${node}`);
        }
    }
    for (const node of known) if (!nodes.includes(node)) known.delete(node);
  };
}
