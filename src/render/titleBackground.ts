/**
 * Welcome-screen background (STYLE §4): a random map rendered at a real "detail" zoom (full
 * terrain style — hillshading, trees, rivers — not the pixelated overview look), slowly panning,
 * with a real track loop (built through `src/sim/commands.ts` like any other track, then drawn by
 * the actual `TerrainRenderer`/`TrackRenderer` classes the in-game map uses) and one small
 * procedural steam-loco silhouette running along it so something moves. The loco itself stays a
 * small self-contained drawing (not a full `sim/trains` `Train`) — a decorative background doesn't
 * need block reservations, breakdowns, or orders, just something visibly on the rails — but it
 * follows the exact curved-fillet path geometry `src/render/trackPath.ts` exports, the same shared
 * module the real track/train renderers sample, so the curve it rides matches the rails drawn
 * underneath it exactly.
 */
import { createGameState } from "../sim/state";
import { buildTrack } from "../sim/commands";
import { terrainAt } from "../sim/map/terrain";
import { inBounds, tileIndex } from "../sim/map/grid";
import { directionBetween } from "../sim/trains/geometry";
import type { GameMap } from "../sim/map/types";
import { Camera, TILE_SIZE } from "./camera";
import { TerrainRenderer } from "./terrain";
import { TrackRenderer } from "./track";
import { buildEdgeGeometry, isFilletBend, EdgePath, type PathSample } from "./trackPath";

/** STYLE §4: "a random map rendered at overview zoom" was the old behavior; this session's brief
 * replaces it with a detail-zoom render (~0.75–1×) so the background shows the same textured
 * terrain style the in-game map does. Comfortably above `OVERVIEW_ZOOM_THRESHOLD`. */
const BACKGROUND_ZOOM = 0.85;
const PAN_SPEED_SCREEN_PX_S = 8; // STYLE §4: "slowly panning (≈8 px/s)" — screen-space, not world.
const PAN_AMPLITUDE_WORLD_PX = 70;
const LOCO_BODY_COLOR = "#1c2430";
const LOCO_TRIM_COLOR = "#c9a23a";
const LOOP_TRAIN_SPEED_TILES_S = 1.1;

/** One step per 45° of the compass wheel, in the same rotational order the turn rule allows a
 * train through (0° or 45° only) — walking these 8 directions in order and back to the first
 * traces a closed loop where every corner is exactly a 45° bend, never a sharp one. */
const OCTAGON_STEP_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

interface LoopSite {
  tiles: number[];
  /** Tile-space bounding box, for centering the camera on the loop. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Walks a closed octagonal (rounded-rectangle) loop of unit tile steps from `(startX, startY)` —
 * `topLen`/`sideLen` are the straight-run lengths, `cut` the length of each 45°-corner diagonal.
 * Returns `null` if any step would leave the map. The returned tile list is *not* closed (the
 * last tile isn't a repeat of the first) — callers treat it as cyclic instead. */
function walkOctagon(
  map: GameMap,
  startX: number,
  startY: number,
  topLen: number,
  sideLen: number,
  cut: number,
): number[] | null {
  const segLens = [topLen, cut, sideLen, cut, topLen, cut, sideLen, cut];
  let x = startX;
  let y = startY;
  if (!inBounds(map, x, y)) return null;
  const tiles: number[] = [tileIndex(map, x, y)];
  for (let s = 0; s < OCTAGON_STEP_DIRS.length; s++) {
    const [dx, dy] = OCTAGON_STEP_DIRS[s] as readonly [number, number];
    for (let i = 0; i < (segLens[s] as number); i++) {
      x += dx;
      y += dy;
      if (!inBounds(map, x, y)) return null;
      tiles.push(tileIndex(map, x, y));
    }
  }
  tiles.pop(); // last point coincides with the first (closed loop) — drop the duplicate
  return tiles;
}

/** All tiles on the loop are flat buildable land, clear of any city/industry footprint — kept
 * simple (no bridges, no interruptions) since this is a decorative backdrop, not a real network. */
function isClearLandLoop(map: GameMap, tiles: readonly number[]): boolean {
  for (const t of tiles) {
    const terrain = terrainAt(map, t % map.width, Math.floor(t / map.width));
    if (terrain === "water" || terrain === "river") return false;
    if ((map.cityId[t] as number) >= 0) return false;
    if ((map.industryId[t] as number) >= 0) return false;
  }
  return true;
}

/** Wide-and-low so it reads as background scenery, not a UI element: STYLE calls for the loop to
 * sit off-center (clear of the centered button column), sized modestly enough to fit in a side
 * band at this zoom. */
const LOOP_TOP_LEN = 7;
const LOOP_SIDE_LEN = 2;
const LOOP_CUT = 1;

/** Tries increasingly many random placements of the standard loop shape on `map`, rejecting any
 * that leaves the map or crosses water/city/industry tiles. `rng` is a simple deterministic
 * counter-based picker (no need for the sim's seeded RNG here — this is render-only scenery). */
function findLoopSite(map: GameMap): LoopSite | null {
  const boxW = LOOP_TOP_LEN + 2 * LOOP_CUT;
  const boxH = LOOP_SIDE_LEN + 2 * LOOP_CUT;
  const maxX = map.width - boxW - 2;
  const maxY = map.height - boxH - 2;
  if (maxX < 1 || maxY < 1) return null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const anchorX = 1 + Math.floor(Math.random() * maxX);
    const anchorY = 1 + Math.floor(Math.random() * maxY);
    const tiles = walkOctagon(
      map,
      anchorX + LOOP_CUT,
      anchorY,
      LOOP_TOP_LEN,
      LOOP_SIDE_LEN,
      LOOP_CUT,
    );
    if (!tiles) continue;
    if (!isClearLandLoop(map, tiles)) continue;
    return { tiles, minX: anchorX, minY: anchorY, maxX: anchorX + boxW, maxY: anchorY + boxH };
  }
  return null;
}

/** This loop-edge's fillet partner direction at `node` (the *other* edge's own away-from-node
 * direction), or `null` for a straight through-pair — same rule `src/render/trains.ts`'s
 * `routePartnerDir` applies to a real train's route, just indexed cyclically since our loop has no
 * start/end. */
function loopPartnerDir(
  mapWidth: number,
  node: number,
  nodeAwayDir: number,
  otherNode: number,
): number | null {
  const otherAwayDir = directionBetween(node, otherNode, mapWidth);
  return isFilletBend(nodeAwayDir, otherAwayDir) ? otherAwayDir : null;
}

/** Builds one curved `EdgePath` per edge of the cyclic tile loop, in travel order. */
function buildLoopPath(mapWidth: number, tiles: readonly number[]): EdgePath[] {
  const n = tiles.length;
  const edges: EdgePath[] = [];
  for (let i = 0; i < n; i++) {
    const a = tiles[i] as number;
    const b = tiles[(i + 1) % n] as number;
    const prev = tiles[(i - 1 + n) % n] as number;
    const next = tiles[(i + 2) % n] as number;
    const dirAB = directionBetween(a, b, mapWidth);
    const partnerA = loopPartnerDir(mapWidth, a, dirAB, prev);
    const partnerB = loopPartnerDir(mapWidth, b, (dirAB + 4) % 8, next);
    edges.push(buildEdgeGeometry(mapWidth, a, b, partnerA, partnerB));
  }
  return edges;
}

/** A point + heading (screen convention) at tile-space `distance` around the whole loop,
 * wrapping past its total length. */
function sampleLoop(
  edges: readonly EdgePath[],
  cumLengths: readonly number[],
  distance: number,
): PathSample {
  const total = cumLengths[cumLengths.length - 1] as number;
  const d = ((distance % total) + total) % total;
  for (let i = 0; i < edges.length; i++) {
    const start = i === 0 ? 0 : (cumLengths[i - 1] as number);
    const end = cumLengths[i] as number;
    if (d <= end || i === edges.length - 1) {
      return (edges[i] as EdgePath).pointAt(d - start);
    }
  }
  return (edges[0] as EdgePath).pointAt(0);
}

/** A small top-down steam-loco silhouette (STYLE §7's shapes, at the STYLE-specified ~16×7px
 * size for a zoom-1/32px tile — `scale` is the current camera zoom). */
function drawLoco(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = LOCO_BODY_COLOR;
  ctx.beginPath();
  ctx.roundRect(-9, -3.5, 16, 7, 1.5);
  ctx.fill();
  ctx.fillRect(4, -4, 5, 6); // cab, slightly taller at the rear
  ctx.fillStyle = LOCO_TRIM_COLOR;
  ctx.fillRect(-9, -0.75, 16, 0.75); // trim stripe
  ctx.beginPath();
  ctx.arc(-6, 0, 1.3, 0, Math.PI * 2); // chimney
  ctx.fillStyle = LOCO_BODY_COLOR;
  ctx.fill();
  ctx.restore();
}

export interface TitleBackgroundHandle {
  stop: () => void;
}

/** Renders a freshly generated map's real terrain (via `TerrainRenderer`) and, when a clear site
 * is found, a real track loop (built via `buildTrack`, drawn via `TrackRenderer`) with a
 * decorative loco running around it — panned slowly by a real `Camera`. Falls back to terrain-only
 * (no loop) if no clear site is found after generating a few candidate maps, which is harmless: the
 * panning terrain background alone already satisfies STYLE's "something on screen moves" via the
 * pan itself... though in practice a "small" map almost always has room for a 9×4-tile clearing. */
export function startTitleBackground(canvas: HTMLCanvasElement): TitleBackgroundHandle {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return { stop: () => {} };
  const ctx: CanvasRenderingContext2D = ctx2d;

  const state = createGameState({
    seed: Date.now() >>> 0,
    size: "small",
    waterLevel: "normal",
    roughness: "normal",
  });
  state.cash = 10_000_000; // decorative scenery — never actually blocked on affordability

  let site: LoopSite | null = null;
  for (let mapAttempt = 0; mapAttempt < 3 && !site; mapAttempt++) {
    if (mapAttempt > 0) {
      const fresh = createGameState({
        seed: (Date.now() + mapAttempt * 7919) >>> 0,
        size: "small",
        waterLevel: "normal",
        roughness: "normal",
      });
      state.map = fresh.map;
      state.cities = fresh.cities;
      state.industries = fresh.industries;
    }
    site = findLoopSite(state.map);
  }

  let loopEdges: EdgePath[] = [];
  let loopCumLengths: number[] = [];
  if (site) {
    const closed = [...site.tiles, site.tiles[0] as number];
    const result = buildTrack(state, closed);
    if (result.ok) {
      loopEdges = buildLoopPath(state.map.width, site.tiles);
      let total = 0;
      loopCumLengths = loopEdges.map((e) => (total += e.length));
    } else {
      site = null;
    }
  }

  const camera = new Camera(state.map.width, state.map.height);
  camera.zoom = BACKGROUND_ZOOM;
  const terrainRenderer = new TerrainRenderer(state.map, state.cities, state.industries);
  const trackRenderer = new TrackRenderer(state.map.width, state.map.height, state.trackGraph);

  let basisX = camera.x;
  let basisY = camera.y;
  function layout(): void {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (site) {
      // Off-center (STYLE: shouldn't sit behind the centered button column) — a side band, low
      // in the frame, clamped so it stays reasonable across viewport widths.
      const desiredCenterX = Math.min(Math.max(w * 0.15, 90), 240);
      const desiredCenterY = h * 0.7;
      const loopCenterWorldX = ((site.minX + site.maxX) / 2) * TILE_SIZE;
      const loopCenterWorldY = ((site.minY + site.maxY) / 2) * TILE_SIZE;
      basisX = loopCenterWorldX - (desiredCenterX - w / 2) / camera.zoom;
      basisY = loopCenterWorldY - (desiredCenterY - h / 2) / camera.zoom;
    } else {
      basisX = (state.map.width * TILE_SIZE) / 2;
      basisY = (state.map.height * TILE_SIZE) / 2;
    }
  }

  let panOffset = 0;
  let panDir = 1;
  let running = true;
  let raf = 0;
  let lastT = performance.now();
  let loopDistance = 0;

  function resize(): void {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    layout();
  }
  window.addEventListener("resize", resize);
  resize();

  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;

    const panSpeedWorld = PAN_SPEED_SCREEN_PX_S / camera.zoom;
    panOffset += panDir * panSpeedWorld * dt;
    if (panOffset >= PAN_AMPLITUDE_WORLD_PX) {
      panOffset = PAN_AMPLITUDE_WORLD_PX;
      panDir = -1;
    } else if (panOffset <= -PAN_AMPLITUDE_WORLD_PX) {
      panOffset = -PAN_AMPLITUDE_WORLD_PX;
      panDir = 1;
    }
    camera.x = basisX + panOffset;
    camera.y = basisY;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    terrainRenderer.draw(ctx, camera, w, h, now);
    if (site) {
      trackRenderer.draw(ctx, camera, w, h);

      loopDistance += LOOP_TRAIN_SPEED_TILES_S * dt;
      const sample = sampleLoop(loopEdges, loopCumLengths, loopDistance);
      const screenX = (sample.x * TILE_SIZE - camera.x) * camera.zoom + w / 2;
      const screenY = (sample.y * TILE_SIZE - camera.y) * camera.zoom + h / 2;
      drawLoco(ctx, screenX, screenY, sample.angle, camera.zoom);
    }

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    stop: () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    },
  };
}
