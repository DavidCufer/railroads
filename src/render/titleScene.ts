/**
 * Title-screen scene (STYLE §12–15): an engraved-style dusk landscape — hatched sky, a ringed sun,
 * hill ridges drawn as line art, a telegraph line — with a side-view American 4-4-0 on the rails and
 * a soft smoke trail. Everything is procedural canvas drawing: the static backdrop and the scrolling
 * layers are painted once per resize into offscreen canvases, each frame only blits them, draws the
 * cached locomotive and a handful of smoke puffs. No game state is involved.
 */
import { locomotiveById } from "../data/trains";
import { chimneyTop, drawLocoSide } from "./art";
import { makeArtCanvas, ctx2d, type ArtCanvas } from "./art/canvas";

const LOCO_ID = "american-4-4-0";
/** Fractions of the viewport height. */
const TRACK_Y = 0.8;
const HORIZON_Y = 0.6;
/** Scroll speeds in px/s, far to near (the train runs right, so scenery drifts left). */
const SPEEDS = { far: 4, near: 12, poles: 70, ties: 70 };
const SMOKE_RATE = 16;
const SMOKE_MAX = 60;

const CREAM = "236,227,207";
const BRASS = "200,160,74";

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r0: number;
}

export interface TitleSceneHandle {
  stop: () => void;
}

/** Deterministic noise so the scene looks the same each visit (no Math.random). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Seamless ridge height in [0,1] at x over a repeating span, sum of whole-period sines. */
function ridge(x: number, span: number, phase: number, k: number[]): number {
  let v = 0;
  let norm = 0;
  k.forEach((n, i) => {
    const a = 1 / (i + 1);
    v += a * Math.sin((2 * Math.PI * n * x) / span + phase * (i + 1));
    norm += a;
  });
  return 0.5 + (0.5 * v) / norm;
}

function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const horizon = h * HORIZON_Y;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#08100e");
  sky.addColorStop(0.7, "#14241d");
  sky.addColorStop(1, "#2c3a2a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, "#162a21");
  ground.addColorStop(1, "#0b1411");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Engraved sky: fine horizontal rules, denser and brighter toward the horizon.
  for (let y = 2; y < horizon; y += 3) {
    const t = y / horizon;
    ctx.strokeStyle = `rgba(${CREAM},${(0.015 + 0.1 * t * t).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }

  // Low sun: concentric brass rings and short rays.
  const sx = w * 0.3;
  const sy = horizon - h * 0.04;
  const sr = Math.min(h * 0.16, 56);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.4);
  glow.addColorStop(0, `rgba(${BRASS},0.28)`);
  glow.addColorStop(1, `rgba(${BRASS},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(sx - sr * 2.4, sy - sr * 2.4, sr * 4.8, sr * 4.8);
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(${BRASS},${(0.62 - i * 0.08).toFixed(2)})`;
    ctx.lineWidth = i === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * (1 - i * 0.14), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${BRASS},0.35)`;
  ctx.lineWidth = 1;
  for (let a = 0; a < 36; a++) {
    const ang = (a / 36) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(ang) * sr * 1.12, sy + Math.sin(ang) * sr * 1.12);
    ctx.lineTo(
      sx + Math.cos(ang) * sr * (a % 3 === 0 ? 1.7 : 1.4),
      sy + Math.sin(ang) * sr * (a % 3 === 0 ? 1.7 : 1.4),
    );
    ctx.stroke();
  }
  ctx.restore();

  // Ground hatching toward the foreground.
  const rnd = lcg(7);
  for (let i = 0; i < 90; i++) {
    const y = horizon + 4 + rnd() * (h - horizon - 4);
    const x = rnd() * w;
    const len = 6 + rnd() * 26 * ((y - horizon) / (h - horizon) + 0.3);
    ctx.strokeStyle = `rgba(${CREAM},${(0.03 + rnd() * 0.05).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.5);
    ctx.lineTo(x + len, y + 0.5);
    ctx.stroke();
  }
}

/** A hill ridge layer as a seamless strip `span` wide: filled body + hatch strokes + crest line. */
function paintRidge(
  span: number,
  h: number,
  baseY: number,
  amp: number,
  fill: string,
  crest: string,
  hatchRgb: string,
  phase: number,
  harmonics: number[],
): ArtCanvas {
  const c = makeArtCanvas(span, h);
  const ctx = ctx2d(c);
  const top = (x: number): number => baseY - amp * ridge(x, span, phase, harmonics);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= span; x += 2) ctx.lineTo(x, top(x));
  ctx.lineTo(span, h);
  ctx.closePath();
  ctx.fill();
  // Diagonal hatching clipped to the body, tighter below the crest.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = `rgba(${hatchRgb},0.16)`;
  ctx.lineWidth = 1;
  for (let x = -h; x < span; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x, baseY - amp);
    ctx.lineTo(x + h * 0.5, baseY - amp + h * 0.5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = crest;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = 0; x <= span; x += 2) {
    if (x === 0) ctx.moveTo(x, top(x));
    else ctx.lineTo(x, top(x));
  }
  ctx.stroke();
  return c;
}

/** Telegraph poles + sagging wires, repeating every `span` px (a whole number of poles). */
function paintPoles(span: number, h: number, trackY: number): ArtCanvas {
  const c = makeArtCanvas(span, h);
  const ctx = ctx2d(c);
  const gap = span / 4;
  const poleH = h * 0.26;
  const topY = trackY - poleH - 6;
  ctx.strokeStyle = `rgba(${CREAM},0.5)`;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const x = gap * (i + 0.5);
    ctx.beginPath();
    ctx.moveTo(x, trackY - 4);
    ctx.lineTo(x, topY);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 7, topY + 3);
    ctx.lineTo(x + 7, topY + 3);
    ctx.moveTo(x - 5, topY + 8);
    ctx.lineTo(x + 5, topY + 8);
    ctx.stroke();
    ctx.lineWidth = 1.4;
  }
  ctx.strokeStyle = `rgba(${CREAM},0.28)`;
  ctx.lineWidth = 0.8;
  for (const dy of [3, 8]) {
    for (let i = 0; i < 4; i++) {
      const x0 = gap * (i + 0.5);
      const x1 = x0 + gap;
      ctx.beginPath();
      ctx.moveTo(x0 + (dy === 3 ? 7 : 5), topY + dy);
      ctx.quadraticCurveTo((x0 + x1) / 2, topY + dy + 9, x1 - (dy === 3 ? 7 : 5), topY + dy);
      ctx.stroke();
    }
  }
  return c;
}

/** Sleepers + two rails over a ballast bed, repeating every `period` px (sleeper pitch). */
function paintTrack(period: number, h: number, trackY: number): ArtCanvas {
  const c = makeArtCanvas(period * 8, h);
  const ctx = ctx2d(c);
  const w = period * 8;
  // Ballast bed.
  ctx.fillStyle = "#0e1a15";
  ctx.fillRect(0, trackY + 1, w, 9);
  ctx.strokeStyle = `rgba(${CREAM},0.1)`;
  ctx.lineWidth = 1;
  const rnd = lcg(31);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w;
    const y = trackY + 3 + rnd() * 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3 + rnd() * 5, y);
    ctx.stroke();
  }
  // Sleepers.
  ctx.fillStyle = "#2a2118";
  for (let x = 2; x < w; x += period) ctx.fillRect(x, trackY + 1, 7, 6);
  ctx.fillStyle = `rgba(${BRASS},0.18)`;
  for (let x = 2; x < w; x += period) ctx.fillRect(x, trackY + 1, 7, 1);
  // Rails (head highlight over a dark web).
  ctx.fillStyle = "#3b4440";
  ctx.fillRect(0, trackY, w, 2);
  ctx.fillStyle = `rgba(${CREAM},0.55)`;
  ctx.fillRect(0, trackY, w, 1);
  return c;
}

export function startTitleScene(canvas: HTMLCanvasElement): TitleSceneHandle {
  const ctx2 = canvas.getContext("2d");
  const def = locomotiveById(LOCO_ID);
  if (!ctx2 || !def) return { stop: () => {} };
  const ctx: CanvasRenderingContext2D = ctx2;

  let running = true;
  let raf = 0;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let backdrop: ArtCanvas | null = null;
  let far: ArtCanvas | null = null;
  let near: ArtCanvas | null = null;
  let poles: ArtCanvas | null = null;
  let track: ArtCanvas | null = null;
  let loco: ArtCanvas | null = null;
  let locoX = 0;
  let locoTop = 0;
  let locoH = 0;
  let stack = { x: 0, y: 0 };
  const puffs: Puff[] = [];
  let spawnAcc = 0;
  const rngSmoke = lcg(99);
  const period = 14;

  function resize(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, canvas.clientWidth || canvas.width);
    h = Math.max(1, canvas.clientHeight || canvas.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const trackY = Math.round(h * TRACK_Y);
    const horizon = h * HORIZON_Y;
    const wide = Math.ceil(w * 1.6);
    const farC = paintRidge(
      wide,
      h,
      horizon + 2,
      h * 0.17,
      "#13241c",
      `rgba(${CREAM},0.32)`,
      CREAM,
      0.6,
      [2, 3, 7],
    );
    const nearC = paintRidge(
      wide,
      h,
      horizon + h * 0.1,
      h * 0.12,
      "#0e1b15",
      `rgba(${BRASS},0.45)`,
      BRASS,
      2.1,
      [3, 5, 11],
    );
    far = farC;
    near = nearC;
    backdrop = makeArtCanvas(w, h);
    paintBackdrop(ctx2d(backdrop), w, h);
    poles = paintPoles(Math.ceil((w * 1.2) / 4) * 4, h, trackY);
    track = paintTrack(period, h, trackY);
    // The locomotive is pre-rendered once at the display size; the rails come from the track layer.
    locoH = Math.min(h * 0.4, 150);
    const wUnits = 90; // generous; trimmed by drawing width below
    const lc = makeArtCanvas(wUnits * (locoH / 24) * dpr, locoH * dpr);
    const drawn = drawLocoSide(ctx2d(lc), def as NonNullable<typeof def>, 0, 0, locoH * dpr, {
      ground: false,
    });
    loco = lc;
    const drawnCss = drawn / dpr;
    locoX = Math.max(8, Math.min(w * 0.06, w - drawnCss - 280));
    locoTop = trackY - (locoH * 23) / 24 + 1;
    const anchor = chimneyTop(def as NonNullable<typeof def>);
    stack = { x: locoX + (anchor.x * locoH) / 24, y: locoTop + (anchor.y * locoH) / 24 };
  }
  window.addEventListener("resize", resize);
  resize();

  let last = performance.now();
  let t = 0;
  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (backdrop) ctx.drawImage(backdrop, 0, 0, w, h);
    const trackY = Math.round(h * TRACK_Y);
    const tile = (layer: ArtCanvas | null, speed: number, y = 0): void => {
      if (!layer) return;
      const lw = layer.width;
      const off = -((t * speed) % lw);
      for (let x = off; x < w; x += lw) ctx.drawImage(layer, Math.round(x), y);
    };
    tile(far, SPEEDS.far);
    tile(near, SPEEDS.near);
    tile(poles, SPEEDS.poles);
    tile(track, SPEEDS.ties);

    // Smoke: spawn at the stack, drift back and up, swell and fade.
    spawnAcc += dt * SMOKE_RATE;
    while (spawnAcc >= 1 && puffs.length < SMOKE_MAX) {
      spawnAcc -= 1;
      puffs.push({
        x: stack.x + (rngSmoke() - 0.5) * 2,
        y: stack.y,
        vx: -(26 + rngSmoke() * 26),
        vy: -(14 + rngSmoke() * 14),
        age: 0,
        life: 2.6 + rngSmoke() * 1.4,
        r0: 3 + rngSmoke() * 2,
      });
    }
    spawnAcc = Math.min(spawnAcc, 2);
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i] as Puff;
      p.age += dt;
      if (p.age >= p.life) {
        puffs.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy *= 1 - 0.25 * dt;
    }
    // Draw the old puffs first so the young, dense ones sit on top.
    for (const p of puffs) {
      const k = p.age / p.life;
      const r = p.r0 + k * 20;
      const a = (1 - k) * (k < 0.08 ? k / 0.08 : 1);
      ctx.fillStyle = `rgba(${CREAM},${(a * 0.2).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${CREAM},${(a * 0.22).toFixed(3)})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    if (loco) {
      const bob = Math.sin(t * 9) * 0.35;
      ctx.drawImage(loco, locoX, locoTop + bob, loco.width / dpr, loco.height / dpr);
    }
    // Rail head in front of the wheels so the engine sits on the line, not above it.
    ctx.fillStyle = `rgba(${CREAM},0.55)`;
    ctx.fillRect(0, trackY, w, 1);
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
