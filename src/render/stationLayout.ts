/**
 * Station site layout (PLAN 23B): where the station's platforms, main building and improvements go so
 * that nothing overlaps track (other than the station's own line), other stations or industries.
 *
 * Pure geometry, no canvas. Everything is expressed in the station's *local frame*: origin at the
 * station tile centre, +x along the track, +y across it, 1 unit = 1 tile. The art itself is drawn in an
 * "art frame" where the main building stands on the -y side; when the free space is on the other side
 * the layout says `side = 1` and the art is mirrored (art y = -local y).
 */
import type { StationImprovementType, StationType } from "../data/stations";

export type StationMarkerType = StationImprovementType | "engineShed" | "waterTower";

export type Pt = readonly [number, number];
export type Range = readonly [number, number];

export interface Seg {
  a: Pt;
  b: Pt;
}

/** Things the station art must keep clear of, in the local frame (own track already removed). */
export interface Obstacles {
  segments: readonly Seg[];
  /** Convex polygons (tile squares of industries and other stations). */
  polys: readonly (readonly Pt[])[];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Slot {
  type: StationMarkerType;
  cx: number;
  cy: number;
  /** Base size; drawn at `w * IMPROVEMENT_SCALE * scale`. */
  w: number;
  h: number;
  scale: number;
}

export interface LayoutParams {
  type: StationType;
  /** Track-centre → platform edge distance, in tiles. */
  near: number;
  loop: boolean;
  /** How far the straight track continues from the station tile centre toward -x/+x. */
  reach: readonly [number, number];
  improvements: readonly StationMarkerType[];
}

export interface StationLayout {
  /** Local side the main building stands on: -1 (as drawn) or 1 (art mirrored). */
  side: -1 | 1;
  /** Building shift along the track, in tiles. */
  bx: number;
  /** Platform extents on the building side / far side (null = omitted). For terminals both are the shed. */
  nearRange: Range | null;
  farRange: Range | null;
  slots: Slot[];
  /** Everything drawn, as boxes in the art frame (platforms, building with forecourt, improvements). */
  boxes: Box[];
  /** Whether the main building found a clear spot (false only when the site is completely boxed in). */
  clear: boolean;
  /** Stable text key for sprite caching. */
  key: string;
}

/** Platform length in tiles, centred on the station tile (clipped by the straight track available). */
export const PLATFORM_LENGTH: Record<StationType, number> = { depot: 2, station: 3, terminal: 4 };

/** Improvements are drawn a bit larger than their layout boxes so they read at zoom 1. */
export const IMPROVEMENT_SCALE = 1.3;

export const STATION_BW = 1.7;
export const STATION_BH = 0.46;

const SIZES: Record<StationMarkerType, readonly [number, number]> = {
  warehouse: [1.0, 0.5],
  hotel: [0.5, 0.5],
  postOffice: [0.42, 0.32],
  coldStorage: [0.66, 0.44],
  engineShed: [1.3, 0.5],
  waterTower: [0.36, 0.36],
  freightYard: [1.3, 0.5],
  livestockPens: [0.9, 0.52],
};

/** Clearance kept between drawn art and any track line. */
const TRACK_MARGIN = 0.07;
const MIN_PLATFORM = 0.6;
const SLICE = 0.1;
const SHIFTS = [0, -0.5, 0.5, -1, 1];
const SCALES = [1, 0.8, 0.62];

// --- geometry -------------------------------------------------------------------------------

function segHitsBox(box: Box, s: Seg, m: number): boolean {
  const x0 = box.x0 - m;
  const x1 = box.x1 + m;
  const y0 = box.y0 - m;
  const y1 = box.y1 + m;
  let t0 = 0;
  let t1 = 1;
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, s.a[0] - x0) &&
    clip(dx, x1 - s.a[0]) &&
    clip(-dy, s.a[1] - y0) &&
    clip(dy, y1 - s.a[1])
  );
}

function boxPoly(b: Box): Pt[] {
  return [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x1, b.y1],
    [b.x0, b.y1],
  ];
}

/** Separating-axis test for two convex polygons (touching counts as clear). */
function polysOverlap(p: readonly Pt[], q: readonly Pt[]): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] as Pt;
      const b = poly[(i + 1) % poly.length] as Pt;
      const nx = a[1] - b[1];
      const ny = b[0] - a[0];
      let minP = Infinity;
      let maxP = -Infinity;
      for (const v of p) {
        const d = v[0] * nx + v[1] * ny;
        minP = Math.min(minP, d);
        maxP = Math.max(maxP, d);
      }
      let minQ = Infinity;
      let maxQ = -Infinity;
      for (const v of q) {
        const d = v[0] * nx + v[1] * ny;
        minQ = Math.min(minQ, d);
        maxQ = Math.max(maxQ, d);
      }
      if (maxP <= minQ + 1e-9 || maxQ <= minP + 1e-9) return false;
    }
  }
  return true;
}

function boxesOverlap(a: Box, b: Box, gap: number): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

/** True when `box` (local or art frame, matching `obs`) touches any obstacle. */
export function boxHitsObstacles(box: Box, obs: Obstacles): boolean {
  for (const s of obs.segments) if (segHitsBox(box, s, TRACK_MARGIN)) return true;
  if (obs.polys.length > 0) {
    const bp = boxPoly(box);
    for (const poly of obs.polys) if (polysOverlap(bp, poly)) return true;
  }
  return false;
}

/** The obstacles as seen in the art frame when the building is on `side` (mirrors y for side 1). */
export function toArtFrame(obs: Obstacles, side: -1 | 1): Obstacles {
  if (side === -1) return obs;
  const f = (p: Pt): Pt => [p[0], -p[1]];
  return {
    segments: obs.segments.map((s) => ({ a: f(s.a), b: f(s.b) })),
    polys: obs.polys.map((poly) => poly.map(f)),
  };
}

/** Local-frame obstacles for the station at tile-space centre (cx, cy) with track along `angle`.
 * `tracks` are graph edges as tile-centre coordinates (x0, y0, x1, y1); edges lying on the station's own
 * line are dropped. `squares` are blocked tile squares (tx, ty, inflate) in tile coordinates. */
export function localObstacles(
  cx: number,
  cy: number,
  angle: number,
  tracks: readonly (readonly [number, number, number, number])[],
  squares: readonly (readonly [number, number, number])[],
): Obstacles {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const toLocal = (x: number, y: number): Pt => {
    const dx = x - cx;
    const dy = y - cy;
    return [dx * c + dy * s, -dx * s + dy * c];
  };
  const segments: Seg[] = [];
  for (const [ax, ay, bx, by] of tracks) {
    const a = toLocal(ax, ay);
    const b = toLocal(bx, by);
    if (Math.abs(a[1]) < 0.02 && Math.abs(b[1]) < 0.02) continue; // the station's own line
    segments.push({ a, b });
  }
  const polys: Pt[][] = [];
  for (const [tx, ty, inflate] of squares) {
    polys.push([
      toLocal(tx - inflate, ty - inflate),
      toLocal(tx + 1 + inflate, ty - inflate),
      toLocal(tx + 1 + inflate, ty + 1 + inflate),
      toLocal(tx - inflate, ty + 1 + inflate),
    ]);
  }
  return { segments, polys };
}

// --- site specification ----------------------------------------------------------------------

interface Spec {
  pt: number;
  farPt: number;
  bw: number;
  bh: number;
  /** Gap between the platform edge (or shed) and the building. */
  gap: number;
  padX: number;
  padTop: number;
  /** Half-depth of the terminal shed (0 for the others). */
  half: number;
}

function specOf(p: Pick<LayoutParams, "type" | "near" | "loop">): Spec {
  switch (p.type) {
    case "depot":
      return {
        pt: 0.16,
        farPt: 0.128,
        bw: 0.7,
        bh: 0.36,
        gap: 0.05,
        padX: 0.05,
        padTop: 0.02,
        half: 0,
      };
    case "station":
      return {
        pt: 0.24,
        farPt: 0.24,
        bw: STATION_BW,
        bh: STATION_BH,
        gap: 0.07,
        padX: 0.12,
        padTop: 0.1,
        half: 0,
      };
    case "terminal":
      return {
        pt: 0,
        farPt: 0,
        bw: 2.9,
        bh: 0.5,
        gap: 0.08,
        padX: 0.14,
        padTop: 0.1,
        half: Math.max(p.loop ? p.near + 0.08 : 0.44, 0.44),
      };
  }
}

/** Distance from the track centre to the building's platform-side wall. */
function buildingYIn(p: Pick<LayoutParams, "type" | "near" | "loop">, sp: Spec): number {
  return p.type === "terminal" ? sp.half + sp.gap : p.near + sp.pt + sp.gap;
}

/** Longest platform-sized run of `base` whose slice boxes are clear; null when none is long enough. */
function clipRange(
  base: Range,
  boxAt: (x0: number, x1: number) => Box,
  obs: Obstacles,
): Range | null {
  if (base[1] - base[0] < MIN_PLATFORM) return null;
  const n = Math.ceil((base[1] - base[0]) / SLICE);
  let best: Range | null = null;
  let start = -1;
  const close = (i: number): void => {
    if (start < 0) return;
    const r: Range = [base[0] + start * SLICE, Math.min(base[1], base[0] + i * SLICE)];
    if (r[1] - r[0] >= MIN_PLATFORM && (!best || r[1] - r[0] > best[1] - best[0])) best = r;
    start = -1;
  };
  for (let i = 0; i < n; i++) {
    const x0 = base[0] + i * SLICE;
    const hit = boxHitsObstacles(boxAt(x0, Math.min(base[1], x0 + SLICE)), obs);
    if (hit) close(i);
    else if (start < 0) start = i;
  }
  close(n);
  return best;
}

interface Attempt {
  layout: Omit<StationLayout, "key" | "side">;
}

function tryLayout(p: LayoutParams, obs: Obstacles, bx: number): Attempt {
  const sp = specOf(p);
  const len = PLATFORM_LENGTH[p.type];
  const base: Range = [-Math.min(len / 2, 0.5 + p.reach[0]), Math.min(len / 2, 0.5 + p.reach[1])];
  const boxes: Box[] = [];
  let nearRange: Range | null;
  let farRange: Range | null = null;
  if (p.type === "terminal") {
    const shed = clipRange(base, (x0, x1) => ({ x0, x1, y0: -sp.half, y1: sp.half }), obs) ?? base;
    nearRange = shed;
    farRange = shed;
    boxes.push({ x0: shed[0], x1: shed[1], y0: -sp.half, y1: sp.half });
  } else {
    nearRange = clipRange(base, (x0, x1) => ({ x0, x1, y0: -(p.near + sp.pt), y1: -p.near }), obs);
    if (nearRange)
      boxes.push({ x0: nearRange[0], x1: nearRange[1], y0: -(p.near + sp.pt), y1: -p.near });
    if (!p.loop) {
      const farBase: Range = p.type === "depot" ? [base[0] + 0.3, base[1] - 0.3] : base;
      farRange = clipRange(
        farBase,
        (x0, x1) => ({ x0, x1, y0: p.near, y1: p.near + sp.farPt }),
        obs,
      );
      if (farRange)
        boxes.push({ x0: farRange[0], x1: farRange[1], y0: p.near, y1: p.near + sp.farPt });
    }
  }

  const yIn = buildingYIn(p, sp);
  const bbox: Box = {
    x0: bx - sp.bw / 2 - sp.padX,
    x1: bx + sp.bw / 2 + sp.padX,
    y0: -(yIn + sp.bh + sp.padTop),
    y1: -yIn + 0.02,
  };
  const clear = !boxHitsObstacles(bbox, obs);
  boxes.push(bbox);

  // Improvements: preferred spot first, then a scan over rows and positions on both sides.
  const nearEdge = yIn; // building-side items start level with the building's platform-side wall
  const farEdge = p.type === "depot" ? p.near + 0.2 : p.near + sp.pt + 0.12;
  const edge0 = sp.bw / 2 + 0.24;
  const K = IMPROVEMENT_SCALE;
  const prefs: Record<StationMarkerType, { side: -1 | 1; x: number; edge: number }> = {
    warehouse: { side: -1, x: bx - (edge0 + 0.5 * K), edge: nearEdge },
    hotel: { side: -1, x: bx + edge0 + 0.25 * K, edge: nearEdge },
    postOffice: { side: -1, x: bx + edge0 + 0.5 * K + 0.12 + 0.21 * K, edge: nearEdge },
    coldStorage: { side: -1, x: bx, edge: nearEdge + sp.bh + 0.2 },
    engineShed: { side: 1, x: -1.5, edge: farEdge },
    waterTower: { side: 1, x: 1.7, edge: farEdge },
    freightYard: { side: 1, x: -0.3, edge: farEdge + 0.75 },
    livestockPens: { side: 1, x: 1.4, edge: farEdge + 0.75 },
  };
  const slots: Slot[] = [];
  const fits = (b: Box): boolean => {
    if (boxHitsObstacles(b, obs)) return false;
    for (const o of boxes) if (boxesOverlap(b, o, 0.02)) return false;
    return true;
  };
  for (const type of p.improvements) {
    const [w, h] = SIZES[type];
    const pref = prefs[type];
    const place = (scale: number, side: -1 | 1, x: number, edge: number): Slot | null => {
      const ew = w * K * scale;
      const eh = h * K * scale;
      const cy = side * (edge + eh / 2);
      const b: Box = { x0: x - ew / 2, x1: x + ew / 2, y0: cy - eh / 2, y1: cy + eh / 2 };
      if (!fits(b)) return null;
      boxes.push(b);
      return { type, cx: x, cy, w, h, scale };
    };
    let slot = place(1, pref.side, pref.x, pref.edge);
    for (const scale of SCALES) {
      if (slot) break;
      for (const side of [pref.side, pref.side === -1 ? 1 : -1] as const) {
        const base = side === -1 ? nearEdge : farEdge;
        for (let row = 0; row < 7 && !slot; row++) {
          const edge = base + row * 0.15;
          for (let i = 0; i < 36 && !slot; i++) {
            const dx = Math.ceil(i / 2) * 0.2 * (i % 2 === 0 ? 1 : -1);
            slot = place(scale, side, pref.x + dx, edge);
          }
        }
        if (slot) break;
      }
    }
    if (slot) slots.push(slot);
  }
  return { layout: { bx, nearRange, farRange, slots, boxes, clear } };
}

/** Free room on each side of the track near the station: sample points that touch no obstacle. */
function freeSpace(near: number, obs: Obstacles, side: -1 | 1): number {
  const art = toArtFrame(obs, side);
  let free = 0;
  for (let x = -1.6; x <= 1.61; x += 0.4) {
    for (let y = near + 0.4; y <= near + 1.6; y += 0.4) {
      if (!boxHitsObstacles({ x0: x - 0.15, x1: x + 0.15, y0: -y - 0.15, y1: -y + 0.15 }, art))
        free++;
    }
  }
  return free;
}

/** Lays out the station: chooses the building side (the one with more free room), shifts the building
 * along the track if both sides are blocked at the centre, clips platforms, and places every improvement
 * on free ground (shrinking or dropping ones that cannot fit). */
export function layoutStation(p: LayoutParams, obs: Obstacles): StationLayout {
  const scoreNeg = freeSpace(p.near, obs, -1);
  const scorePos = freeSpace(p.near, obs, 1);
  const sides: (-1 | 1)[] = scorePos > scoreNeg ? [1, -1] : [-1, 1];
  let chosen: { side: -1 | 1; attempt: Attempt } | null = null;
  for (const bx of SHIFTS) {
    for (const side of sides) {
      const attempt = tryLayout(p, toArtFrame(obs, side), bx);
      if (attempt.layout.clear) {
        chosen = { side, attempt };
        break;
      }
    }
    if (chosen) break;
  }
  chosen ??= {
    side: sides[0] as -1 | 1,
    attempt: tryLayout(p, toArtFrame(obs, sides[0] as -1 | 1), 0),
  };
  const l = chosen.attempt.layout;
  const r = (n: number): string => n.toFixed(2);
  const key = [
    chosen.side,
    r(l.bx),
    l.nearRange ? `${r(l.nearRange[0])}:${r(l.nearRange[1])}` : "-",
    l.farRange ? `${r(l.farRange[0])}:${r(l.farRange[1])}` : "-",
    ...l.slots.map((s) => `${s.type}@${r(s.cx)},${r(s.cy)}x${s.scale}`),
  ].join("|");
  return { ...l, side: chosen.side, key };
}

/** Tiles (as `x,y` tile coordinates) whose interior the layout's boxes cover, for carving city houses. */
export function footprintTiles(
  layout: StationLayout,
  angle: number,
  cx: number,
  cy: number,
): Array<[number, number]> {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const f = layout.side === -1 ? 1 : -1;
  const tiles = new Map<number, [number, number]>();
  const SHRINK = 0.2; // ignore boxes that merely graze a tile corner or edge
  for (const b of layout.boxes) {
    const poly = boxPoly(b).map(([x, y]): Pt => {
      const lx = x;
      const ly = y * f;
      return [cx + lx * c - ly * s, cy + lx * s + ly * c];
    });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let ty = Math.floor(minY); ty <= Math.floor(maxY); ty++) {
      for (let tx = Math.floor(minX); tx <= Math.floor(maxX); tx++) {
        const sq: Pt[] = [
          [tx + SHRINK, ty + SHRINK],
          [tx + 1 - SHRINK, ty + SHRINK],
          [tx + 1 - SHRINK, ty + 1 - SHRINK],
          [tx + SHRINK, ty + 1 - SHRINK],
        ];
        if (polysOverlap(poly, sq)) tiles.set(ty * 100000 + tx, [tx, ty]);
      }
    }
  }
  return [...tiles.values()];
}
