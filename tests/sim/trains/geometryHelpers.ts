/** Render-geometry overlap check (PLAN Phase 27 B): the vehicle rectangles the player sees, laid out by
 * the very same lane-path code the renderer uses (`layoutConsist`), must never intersect between trains. */
import {
  layoutConsist,
  VEHICLE_WIDTH_TILES,
  type VehiclePlacement,
} from "../../../src/render/trains";
import type { GeomEnv } from "../../../src/render/laneGeometry";
import type { GameState } from "../../../src/sim/state";

export function geomEnv(state: GameState): GeomEnv {
  return {
    mapWidth: state.map.width,
    graph: state.trackGraph,
    stationTiles: new Set(state.stations.map((s) => s.tile)),
  };
}

type Pt = [number, number];

function corners(v: VehiclePlacement, shrink: number): Pt[] {
  const c = Math.cos(v.angle);
  const s = Math.sin(v.angle);
  const hl = v.length / 2 - shrink;
  const hw = VEHICLE_WIDTH_TILES / 2 - shrink;
  return [
    [v.x + c * hl - s * hw, v.y + s * hl + c * hw],
    [v.x + c * hl + s * hw, v.y + s * hl - c * hw],
    [v.x - c * hl + s * hw, v.y - s * hl - c * hw],
    [v.x - c * hl - s * hw, v.y - s * hl + c * hw],
  ];
}

/** Separating-axis test for two oriented rectangles. */
export function rectsOverlap(a: VehiclePlacement, b: VehiclePlacement, shrink = 0.03): boolean {
  const pa = corners(a, shrink);
  const pb = corners(b, shrink);
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 2; i++) {
      const p = poly[i] as Pt;
      const q = poly[i + 1] as Pt;
      const nx = -(q[1] - p[1]);
      const ny = q[0] - p[0];
      const proj = (pts: Pt[]): [number, number] => {
        const d = pts.map(([x, y]) => x * nx + y * ny);
        return [Math.min(...d), Math.max(...d)];
      };
      const [a0, a1] = proj(pa);
      const [b0, b1] = proj(pb);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}

/** Two trains that are in (any vehicle within `STATION_EXEMPT_RADIUS` tiles of it, i.e. queuing into or leaving) the same station at once are exempt: stations are the passing places (SPEC §7.5) and
 * hold several trains (a reversing consist's tail can poke past a dead-end terminal). */
export const STATION_EXEMPT_RADIUS = 3.5;

/** Pairs of trains (ids) whose vehicle rectangles intersect right now. */
export function vehicleOverlapsNow(state: GameState): string[] {
  const env = geomEnv(state);
  const w = state.map.width;
  const stationXY = state.stations.map((s) => [(s.tile % w) + 0.5, Math.floor(s.tile / w) + 0.5]);
  // Only trains with another within reach (two consist lengths) can overlap: skip laying out the rest.
  const head = (t: (typeof state.trains)[number]): [number, number] => {
    const n = t.route[t.routeIndex] ?? 0;
    return [n % w, Math.floor(n / w)];
  };
  const heads = state.trains.map(head);
  const near = state.trains.filter((_, i) =>
    heads.some((h, j) => j !== i && Math.hypot(h[0] - heads[i]![0], h[1] - heads[i]![1]) < 12),
  );
  const laid = near.map((t) => {
    const v = layoutConsist(env, t, 1);
    const inStations = new Set<number>();
    stationXY.forEach(([x, y], i) => {
      if (v.some((p) => Math.hypot(p.x - x!, p.y - y!) < STATION_EXEMPT_RADIUS)) inStations.add(i);
    });
    // A consist that has just reversed at a terminal has its tail beyond the buffer stop (the renderer has no
    // track to fold it onto): cosmetic, exempt like a station.
    const folded =
      t.route[t.routeIndex - 1] !== undefined &&
      t.route[t.routeIndex - 1] === t.route[t.routeIndex + 1];
    return { id: t.id, v, inStations, folded };
  });
  const out: string[] = [];
  for (let i = 0; i < laid.length; i++)
    for (let j = i + 1; j < laid.length; j++) {
      const A = laid[i]!;
      const B = laid[j]!;
      if (A.folded || B.folded) continue;
      if ([...A.inStations].some((k) => B.inStations.has(k))) continue;
      if (A.v.some((va) => B.v.some((vb) => rectsOverlap(va, vb))))
        out.push(`trains ${A.id}&${B.id}`);
    }
  return out;
}

/** Debug text for the first overlapping pair (positions, statuses). */
export function describeOverlap(state: GameState, pair: string): string {
  const env = geomEnv(state);
  const [ia, ib] = pair.replace("trains ", "").split("&").map(Number);
  for (const a of state.trains.filter((t) => t.id === ia))
    for (const b of state.trains.filter((t) => t.id === ib)) {
      const va = layoutConsist(env, a, 1);
      const vb = layoutConsist(env, b, 1);
      for (const p of va)
        for (const q of vb)
          if (rectsOverlap(p, q))
            return `${a.id}:${a.status} route[${a.route.slice(Math.max(0, a.routeIndex - 1), a.routeIndex + 3)}] ep${a.edgeProgress.toFixed(2)} @(${p.x.toFixed(2)},${p.y.toFixed(2)}) vs ${b.id}:${b.status} route[${b.route.slice(Math.max(0, b.routeIndex - 1), b.routeIndex + 3)}] ep${b.edgeProgress.toFixed(2)} @(${q.x.toFixed(2)},${q.y.toFixed(2)}) st=${state.stations.map((s) => s.tile + ":" + s.id)}`;
    }
  return "";
}
