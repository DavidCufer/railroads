/**
 * Welcome-screen background (STYLE §4): a random map at overview zoom, slowly panning, with one
 * procedural steam train looping on its own small drawn track so something on screen moves. Fully
 * self-contained (own tiny loop-track geometry, own tiny loco silhouette) — deliberately not built
 * on the real track graph or `src/render/trains.ts`'s vehicle renderer, since both are being
 * actively reworked by another session's Phase 13 (curved track/top-down trains) at the same time
 * this was written; this file never touches theirs.
 */
import { generateMap } from "../sim/map/generate";
import { createRng } from "../sim/rng";
import { terrainName } from "../sim/map/terrain";
import { TERRAIN_COLORS } from "./palette";

const PIXELS_PER_TILE = 10;
const PAN_SPEED_PX_S = 8; // STYLE §4: "slowly panning (≈8 px/s)"
const CITY_DOT_COLOR = "#c9a23a";
const TRACK_COLOR = "#9c7c22";
const LOCO_BODY_COLOR = "#1c2430";
const LOCO_TRIM_COLOR = "#c9a23a";

interface LoopRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

interface LoopPoint {
  x: number;
  y: number;
  angle: number;
}

/** A point + heading at fraction `t` (0..1) around a clockwise rounded-rectangle loop. */
function pointOnLoop(rect: LoopRect, t: number): LoopPoint {
  const { x, y, w, h, r } = rect;
  const straightH = w - 2 * r;
  const straightV = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  const total = 2 * straightH + 2 * straightV + 4 * arc;
  let d = ((t % 1) + 1) % 1;
  d *= total;

  if (d < straightH) return { x: x + r + d, y, angle: 0 };
  d -= straightH;
  if (d < arc) {
    const a = d / r;
    return { x: x + w - r + r * Math.sin(a), y: y + r - r * Math.cos(a), angle: a };
  }
  d -= arc;
  if (d < straightV) return { x: x + w, y: y + r + d, angle: Math.PI / 2 };
  d -= straightV;
  if (d < arc) {
    const a = d / r;
    return {
      x: x + w - r + r * Math.cos(a),
      y: y + h - r + r * Math.sin(a),
      angle: Math.PI / 2 + a,
    };
  }
  d -= arc;
  if (d < straightH) return { x: x + w - r - d, y: y + h, angle: Math.PI };
  d -= straightH;
  if (d < arc) {
    const a = d / r;
    return { x: x + r - r * Math.sin(a), y: y + h - r + r * Math.cos(a), angle: Math.PI + a };
  }
  d -= arc;
  if (d < straightV) return { x, y: y + h - r - d, angle: -Math.PI / 2 };
  d -= straightV;
  const a = d / r;
  return { x: x + r - r * Math.cos(a), y: y + r - r * Math.sin(a), angle: -Math.PI / 2 + a };
}

function drawRoundedRectPath(ctx: CanvasRenderingContext2D, rect: LoopRect): void {
  const { x, y, w, h, r } = rect;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A small top-down steam-loco silhouette (STYLE §7's shapes, simplified for background scale). */
function drawLoco(ctx: CanvasRenderingContext2D, at: LoopPoint): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(at.angle);
  ctx.fillStyle = LOCO_BODY_COLOR;
  ctx.beginPath();
  ctx.roundRect(-11, -4, 18, 8, 2);
  ctx.fill();
  ctx.fillRect(5, -5, 6, 7); // cab, slightly taller at the rear
  ctx.fillStyle = LOCO_TRIM_COLOR;
  ctx.fillRect(-11, -1, 18, 1); // trim stripe
  ctx.beginPath();
  ctx.arc(-7, 0, 1.6, 0, Math.PI * 2); // chimney
  ctx.fillStyle = LOCO_BODY_COLOR;
  ctx.fill();
  ctx.restore();
}

export interface TitleBackgroundHandle {
  stop: () => void;
}

/** Renders a freshly generated small map to an offscreen canvas once, then animates the visible
 * `canvas` by panning a slice of it and drawing the looping decorative train over the top. */
export function startTitleBackground(canvas: HTMLCanvasElement): TitleBackgroundHandle {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return { stop: () => {} };
  const ctx: CanvasRenderingContext2D = ctx2d;

  const rng = createRng(Date.now() >>> 0);
  const { map, cities } = generateMap(rng, {
    size: "small",
    waterLevel: "normal",
    roughness: "normal",
  });

  const worldW = map.width * PIXELS_PER_TILE;
  const worldH = map.height * PIXELS_PER_TILE;
  const world = document.createElement("canvas");
  world.width = worldW;
  world.height = worldH;
  const wctx = world.getContext("2d");
  if (wctx) {
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const terrain = terrainName(map.terrain[ty * map.width + tx] as number);
        wctx.fillStyle = TERRAIN_COLORS[terrain] ?? "#3a4a3a";
        wctx.fillRect(tx * PIXELS_PER_TILE, ty * PIXELS_PER_TILE, PIXELS_PER_TILE, PIXELS_PER_TILE);
      }
    }
    wctx.fillStyle = CITY_DOT_COLOR;
    for (const city of cities) {
      if (city.tiles.length === 0) continue;
      const tile = city.tiles[0] as number;
      const cx = (tile % map.width) * PIXELS_PER_TILE + PIXELS_PER_TILE / 2;
      const cy = Math.floor(tile / map.width) * PIXELS_PER_TILE + PIXELS_PER_TILE / 2;
      wctx.beginPath();
      wctx.arc(cx, cy, 3, 0, Math.PI * 2);
      wctx.fill();
    }
  }

  // Loop track sized relative to the canvas, parked in the lower third so it doesn't fight the
  // centered title/button column for attention.
  let loop: LoopRect = { x: 40, y: 0, w: 200, h: 90, r: 28 };
  function layoutLoop(): void {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    // Wide and low so most of the loop peeks out on both sides of the centered button column
    // instead of running directly underneath it.
    loop = { x: w * 0.04, y: h * 0.6, w: w * 0.68, h: h * 0.36, r: Math.min(32, h * 0.14) };
  }

  let panX = 0;
  let panDir = 1;
  let running = true;
  let raf = 0;
  let lastT = performance.now();
  const trainSpeedFractionPerSec = 0.09;
  let trainT = 0;

  function resize(): void {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    layoutLoop();
  }
  window.addEventListener("resize", resize);
  resize();

  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;

    const w = canvas.width;
    const h = canvas.height;
    const maxPan = Math.max(0, worldW - w);
    if (maxPan > 0) {
      panX += panDir * PAN_SPEED_PX_S * dt;
      if (panX >= maxPan) {
        panX = maxPan;
        panDir = -1;
      } else if (panX <= 0) {
        panX = 0;
        panDir = 1;
      }
    }
    const panY = Math.max(0, (worldH - h) / 2);

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(world, panX, panY, w, h, 0, 0, w, h);

    trainT += trainSpeedFractionPerSec * dt;
    ctx.strokeStyle = TRACK_COLOR;
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, loop);
    ctx.stroke();
    drawLoco(ctx, pointOnLoop(loop, trainT));

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
