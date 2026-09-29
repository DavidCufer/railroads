/**
 * Phase 23A: real-world regions are authored on a 10 km/tile grid (the committed JSON files stay as
 * they are) but the game runs at 5 km/tile, so a region is upsampled `WORLD_SCALE`× at load time.
 * Everything here is pure and deterministic (seeded value noise, no Math.random).
 *
 * Boundaries are *not* 2×2 blocks: water/land is decided from the bilinear-blended coverage of the
 * four surrounding source tiles plus low-frequency noise, which turns a staircase coast into a
 * diagonal, slightly wobbly edge; land classes (plain/forest/hills/…) are a noise-perturbed vote of
 * the same four neighbours; elevation is a land-weighted bilinear blend; rivers are re-traced as a
 * smoothed, meandering polyline through the source tiles' centres.
 */
import { WORLD_SCALE } from "../../data/scale";
import { DIRS8, inBounds } from "../map/grid";
import { buildPermutation, fractalNoise2D, type Permutation } from "../map/noise";
import { terrainId, TERRAIN_TYPES } from "../map/terrain";
import { createRng } from "../rng";

const WATER = terrainId("water");
const RIVER = terrainId("river");
const PLAIN = terrainId("plain");
const LAND_CLASSES = TERRAIN_TYPES.map((_, id) => id).filter((id) => id !== WATER && id !== RIVER);

/** Noise scale (tiles) of the coast / lake wobble and its strength in coverage units. */
const COAST_NOISE_SCALE = 5 * WORLD_SCALE;
const COAST_NOISE_STRENGTH = 0.32;
/** Land-class boundary wobble. */
const CLASS_NOISE_SCALE = 3 * WORLD_SCALE;
const CLASS_NOISE_STRENGTH = 0.3;
/** Water bodies / land specks below this many tiles created purely by the wobble are cleaned up. */
const MIN_SPECK_TILES = 3;
/** Rivers: sample spacing along the smoothed polyline and meander amplitude (tiles). */
const RIVER_SAMPLE_STEP = 0.4;
const RIVER_MEANDER = 0.6;
const RIVER_MEANDER_SCALE = 4 * WORLD_SCALE;
/** How far (tiles) a river mouth may be extended to reach the wobbled coast. */
const RIVER_MOUTH_REACH = 6;

export interface SourceGrid {
  width: number;
  height: number;
  terrain: Uint8Array;
  elevation: Uint8Array;
  elevationRaw: Float32Array;
  /** Rivers as ordered source-tile index lists (source → mouth). */
  rivers: number[][];
}

export interface UpsampledGrid {
  width: number;
  height: number;
  terrain: Uint8Array;
  elevation: Uint8Array;
  elevationRaw: Float32Array;
  /** Re-traced rivers as ordered new-tile index lists (source → mouth), 8-connected. */
  rivers: number[][];
}

interface Corner {
  idx: number;
  w: number;
}

/** Four bilinear neighbours (source tile indices + weights) of the new tile (x, y). */
function corners(src: SourceGrid, x: number, y: number, out: Corner[]): void {
  const u = (x + 0.5) / WORLD_SCALE - 0.5;
  const v = (y + 0.5) / WORLD_SCALE - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const clampX = (n: number): number => Math.min(src.width - 1, Math.max(0, n));
  const clampY = (n: number): number => Math.min(src.height - 1, Math.max(0, n));
  const xa = clampX(x0);
  const xb = clampX(x0 + 1);
  const ya = clampY(y0);
  const yb = clampY(y0 + 1);
  out[0] = { idx: ya * src.width + xa, w: (1 - fx) * (1 - fy) };
  out[1] = { idx: ya * src.width + xb, w: fx * (1 - fy) };
  out[2] = { idx: yb * src.width + xa, w: (1 - fx) * fy };
  out[3] = { idx: yb * src.width + xb, w: fx * fy };
}

function noise(perm: Permutation, x: number, y: number, scale: number): number {
  return fractalNoise2D(perm, x, y, 3, 0.5, 2, scale);
}

/** 8-connected components of tiles for which `pred` holds; calls `visit` with each component. */
function components(
  w: number,
  h: number,
  pred: (idx: number) => boolean,
  visit: (tiles: number[]) => void,
): void {
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !pred(start)) continue;
    const tiles: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      tiles.push(idx);
      const x = idx % w;
      const y = Math.floor(idx / w);
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (seen[n] || !pred(n)) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    visit(tiles);
  }
}

function chaikin(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [points[0] as [number, number]];
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i] as [number, number];
    const [bx, by] = points[i + 1] as [number, number];
    out.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by]);
    out.push([0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
  }
  out.push(points[points.length - 1] as [number, number]);
  return out;
}

/** Tile indices (8-connected, deduplicated) along a meandering, smoothed version of a source river. */
function traceRiver(
  src: SourceGrid,
  river: number[],
  perm: Permutation,
  width: number,
  height: number,
): number[] {
  if (river.length === 0) return [];
  let pts: [number, number][] = river.map((idx) => [
    ((idx % src.width) + 0.5) * WORLD_SCALE - 0.5,
    (Math.floor(idx / src.width) + 0.5) * WORLD_SCALE - 0.5,
  ]);
  if (pts.length > 1) {
    pts = chaikin(chaikin(pts));
  }
  const path: number[] = [];
  const push = (x: number, y: number): void => {
    const tx = Math.min(width - 1, Math.max(0, Math.round(x)));
    const ty = Math.min(height - 1, Math.max(0, Math.round(y)));
    const idx = ty * width + tx;
    if (path[path.length - 1] === idx) return;
    // Fill any gap so the path stays 8-connected.
    const last = path[path.length - 1];
    if (last !== undefined) {
      let cx = last % width;
      let cy = Math.floor(last / width);
      while (Math.max(Math.abs(tx - cx), Math.abs(ty - cy)) > 1) {
        cx += Math.sign(tx - cx);
        cy += Math.sign(ty - cy);
        path.push(cy * width + cx);
      }
      if (path[path.length - 1] === idx) return;
    }
    path.push(idx);
  };
  const total = pts.length;
  for (let i = 0; i < total; i++) {
    const [px, py] = pts[i] as [number, number];
    const next = pts[i + 1];
    const steps = next
      ? Math.max(1, Math.ceil(Math.hypot(next[0] - px, next[1] - py) / RIVER_SAMPLE_STEP))
      : 1;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      let x = next ? px + (next[0] - px) * t : px;
      let y = next ? py + (next[1] - py) * t : py;
      const endpoint = (i === 0 && s === 0) || !next;
      if (!endpoint) {
        x += RIVER_MEANDER * noise(perm, x + 311, y, RIVER_MEANDER_SCALE);
        y += RIVER_MEANDER * noise(perm, x, y + 733, RIVER_MEANDER_SCALE);
      }
      push(x, y);
    }
  }
  return path;
}

export function upsampleGrid(src: SourceGrid, seed: number): UpsampledGrid {
  const width = src.width * WORLD_SCALE;
  const height = src.height * WORLD_SCALE;
  const size = width * height;
  const rng = createRng(seed ^ 0x5eed23);
  const coastPerm = buildPermutation(rng);
  const classPerm = buildPermutation(rng);
  const elevPerm = buildPermutation(rng);
  const riverPerm = buildPermutation(rng);

  const terrain = new Uint8Array(size);
  const elevation = new Uint8Array(size);
  const elevationRaw = new Float32Array(size);
  const cs: Corner[] = [];
  const votes = new Float64Array(TERRAIN_TYPES.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      corners(src, x, y, cs);
      let water = 0;
      let raw = 0;
      for (const c of cs) {
        if ((src.terrain[c.idx] as number) === WATER) water += c.w;
        raw += c.w * (src.elevationRaw[c.idx] as number);
      }
      elevationRaw[idx] = raw + 0.015 * noise(elevPerm, x, y, 3 * WORLD_SCALE);
      const coverage = water + COAST_NOISE_STRENGTH * noise(coastPerm, x, y, COAST_NOISE_SCALE);
      if (coverage > 0.5) {
        terrain[idx] = WATER;
        continue;
      }
      // Land: noise-perturbed vote among the surrounding land classes (rivers count as plain here;
      // they are re-traced below).
      votes.fill(0);
      let landWeight = 0;
      let elev = 0;
      for (const c of cs) {
        const t = src.terrain[c.idx] as number;
        if (t === WATER) continue;
        const cls = t === RIVER ? PLAIN : t;
        votes[cls] = (votes[cls] as number) + c.w;
        landWeight += c.w;
        elev += c.w * (src.elevation[c.idx] as number);
      }
      let best = -1;
      if (landWeight > 0) {
        let bestScore = -Infinity;
        for (const cls of LAND_CLASSES) {
          const score =
            (votes[cls] as number) +
            CLASS_NOISE_STRENGTH *
              noise(classPerm, x + cls * 97.3, y + cls * 57.1, CLASS_NOISE_SCALE);
          if ((votes[cls] as number) > 0 && score > bestScore) {
            bestScore = score;
            best = cls;
          }
        }
      }
      terrain[idx] = best >= 0 ? best : PLAIN;
      const e = landWeight > 0 ? elev / landWeight : 1;
      elevation[idx] = Math.min(
        9,
        Math.max(1, Math.round(e + 0.4 * noise(elevPerm, x + 91, y, 4 * WORLD_SCALE))),
      );
    }
  }

  // Clean up single-tile puddles / specks made by the wobble.
  components(
    width,
    height,
    (i) => terrain[i] === WATER,
    (tiles) => {
      if (tiles.length >= MIN_SPECK_TILES) return;
      for (const i of tiles) {
        terrain[i] = PLAIN;
        elevation[i] = 1;
      }
    },
  );
  components(
    width,
    height,
    (i) => terrain[i] !== WATER,
    (tiles) => {
      if (tiles.length >= MIN_SPECK_TILES) return;
      for (const i of tiles) {
        terrain[i] = WATER;
        elevation[i] = 0;
      }
    },
  );
  // Elevation of tiles whose terrain was switched to land by the cleanup above (fixed at 1); water = 0.
  for (let i = 0; i < size; i++) if (terrain[i] === WATER) elevation[i] = 0;

  const rivers: number[][] = [];
  const owner = new Map<number, number>();
  for (const river of src.rivers) {
    const path = traceRiver(src, river, riverPerm, width, height);
    if (path.length === 0) continue;
    for (const idx of path) if (!owner.has(idx)) owner.set(idx, rivers.length);
    rivers.push(path);
  }
  rivers.forEach((path, i) => extendToWaterOrRiver(path, i, owner, terrain, width, height));
  return { width, height, terrain, elevation, elevationRaw, rivers };
}

/** Extends a river path to the nearest water tile — or a tile of another river it merges into —
 * within reach, when the wobbled coast / re-traced neighbour ended up a couple of tiles away. */
function extendToWaterOrRiver(
  path: number[],
  self: number,
  owner: ReadonlyMap<number, number>,
  terrain: Uint8Array,
  width: number,
  height: number,
): void {
  const last = path[path.length - 1];
  if (last === undefined) return;
  const tile = { width, height };
  const isTarget = (idx: number): boolean => {
    if (terrain[idx] === WATER) return true;
    const o = owner.get(idx);
    return o !== undefined && o !== self;
  };
  const adjacentToTarget = (idx: number): boolean => {
    const x = idx % width;
    const y = Math.floor(idx / width);
    return DIRS8.some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return inBounds(tile, nx, ny) && isTarget(ny * width + nx);
    });
  };
  if (isTarget(last) || adjacentToTarget(last)) return;
  // BFS toward the closest target.
  const prev = new Map<number, number>([[last, -1]]);
  let frontier = [last];
  for (let d = 0; d < RIVER_MOUTH_REACH && frontier.length > 0; d++) {
    const nextFrontier: number[] = [];
    for (const idx of frontier) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(tile, nx, ny)) continue;
        const n = ny * width + nx;
        if (prev.has(n)) continue;
        prev.set(n, idx);
        if (isTarget(n)) {
          const tail: number[] = [];
          for (let p = idx; p !== -1 && p !== last; p = prev.get(p) as number) tail.push(p);
          path.push(...tail.reverse());
          return;
        }
        nextFrontier.push(n);
      }
    }
    frontier = nextFrontier;
  }
}
