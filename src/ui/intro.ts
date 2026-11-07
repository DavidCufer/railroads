/**
 * Phase 85-88: the intro overlay (`#intro` in index.html, painted before any JS runs). On first load it plays the 3D
 * arrival clip (`#intro-video`, autoplay in the markup); when the train has arrived the clip holds its last frame, the
 * crest's green closes in from the screen edges as a shield-shaped window shrinking onto the engine (an SVG path with a
 * shield-shaped hole, while the clip zooms about the engine), then the crest frame settles on the shield. A tap skips
 * to that end state; a video that errors or hasn't started within `VIDEO_START_MS`, and `prefers-reduced-motion`, show
 * the end state at once (the clip's last frame, `arrival-last.jpg`, behind the frame). `startIntro` takes it over from `main()` (rotating status line), `finishIntro` fades it out once
 * the title screen is mounted (never before clip + about 1 s of crest), and `withIntro` re-shows the crest (never the
 * clip) around a slow synchronous step. Under `?debug=1` it is removed at once so e2e tests keep their speed.
 */
import { strings } from "./strings";

const FADE_MS = 300;
/** The crest stays at least this long after the clip ends (or from page start when the clip is skipped or absent). */
const CREST_HOLD_MS = 1000;
/** The green closes in over this long (ease-in-out). */
const CLOSE_MS = 1200;
const MIN_HOLD_MS = 1000;
/** A video that has not started playing by then is given up on. */
const VIDEO_START_MS = 1500;

/** Rotating line cadence. */
const LINE_MS = 1300;

let timer: number | undefined;
let lineIndex = 0;
let lines: readonly string[] = [];

function el(): HTMLElement | null {
  return document.getElementById("intro");
}

function setLine(text: string): void {
  const line = document.getElementById("intro-line");
  if (line) line.textContent = text;
}

function startRotation(next: readonly string[]): void {
  stopRotation();
  lines = next;
  lineIndex = 0;
  setLine(lines[0] ?? "");
  if (lines.length > 1) {
    timer = window.setInterval(() => {
      lineIndex = (lineIndex + 1) % lines.length;
      setLine(lines[lineIndex] ?? "");
    }, LINE_MS);
  }
}

function stopRotation(): void {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
}

/** The crest state has begun (the frame is settling or settled); the overlay may leave after its hold. */
let crestShown = false;
let ready = false;
/** performance.now() before which the intro must stay (crest hold). */
let holdUntil = MIN_HOLD_MS;
let hideTimer: number | undefined;
let hidden = false;
let raf: number | undefined;
/** Progress of the close (0 = clip full screen, 1 = the shield at its final size). */
let progress = 0;

function video(): HTMLVideoElement | null {
  return document.getElementById("intro-video") as HTMLVideoElement | null;
}

// ---- Geometry (Phase 88) -------------------------------------------------------------------------------------------
/** The crest field's outline in the frame's 512 box (art/icon README). */
const FIELD_PATH = "M256 62 L410 112 Q416 292 256 414 Q96 292 102 112z";
/** The anchor inside the field (512 box) where the engine's visual centre sits in the app icon. */
const FIELD_ANCHOR = { x: 254, y: 247 };
/** The same point on the engine in the clip's 1280x720 frame (the engine's visual centre). */
const CLIP_ANCHOR = { x: 631, y: 380 };
/** Screen pixels per clip pixel, per frame pixel (1024 box), so the engine fills the shield as in the icon. */
const ENGINE_PER_FRAME = 1.559;
const CLIP_W = 1280;
const CLIP_H = 720;

let fieldPath: Path2D | undefined;

function inField(u: { x: number; y: number }, ctx: CanvasRenderingContext2D): boolean {
  fieldPath ??= new Path2D(FIELD_PATH);
  return ctx.isPointInPath(fieldPath, u.x, u.y);
}

interface Geo {
  w: number;
  h: number;
  /** Cover scale of the clip (screen px per clip px) and the engine's start position on screen. */
  c: number;
  e0: { x: number; y: number };
  /** Final engine position, final clip scale. */
  t: { x: number; y: number };
  s: number;
  /** Hole scale (screen px per 512-box unit): at the start (the shield just covers the screen) and at the end. */
  h0: number;
  h1: number;
}

function geometry(root: HTMLElement): Geo {
  const w = root.clientWidth;
  const h = root.clientHeight;
  const c = Math.max(w / CLIP_W, h / CLIP_H);
  const e0 = {
    x: w / 2 + (CLIP_ANCHOR.x - CLIP_W / 2) * c,
    y: h / 2 + (CLIP_ANCHOR.y - CLIP_H / 2) * c,
  };
  const frame = document.getElementById("intro-frame");
  const r = frame?.getBoundingClientRect();
  const size = r && r.width > 0 ? r.width : Math.min(h * 0.64, 520);
  const left = r && r.width > 0 ? r.left : (w - size) / 2;
  const top = r && r.width > 0 ? r.top : (h - size) / 2;
  const k = size / 512;
  const t = { x: left + FIELD_ANCHOR.x * k, y: top + FIELD_ANCHOR.y * k };
  const s = ENGINE_PER_FRAME * (size / 1024);
  // Smallest hole scale (about the engine's start position) whose shield contains the whole screen.
  const ctx = document.createElement("canvas").getContext("2d");
  let h0 = k;
  if (ctx) {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 16; i++) {
      const f = i / 16;
      pts.push({ x: f * w, y: 0 }, { x: f * w, y: h }, { x: 0, y: f * h }, { x: w, y: f * h });
    }
    for (let i = 0; i < 120; i++) {
      const hs = h0;
      const ok = pts.every((p) =>
        inField(
          { x: FIELD_ANCHOR.x + (p.x - e0.x) / hs, y: FIELD_ANCHOR.y + (p.y - e0.y) / hs },
          ctx,
        ),
      );
      if (ok) break;
      h0 *= 1.05;
    }
    h0 *= 1.04;
  }
  return { w, h, c, e0, t, s, h0: Math.max(h0, k), h1: k };
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** Draws the close at progress `p`: moves/scales the stage about the engine and cuts the shield-shaped hole. */
function render(p: number): void {
  const root = el();
  const stage = document.getElementById("intro-stage");
  const shade = document.getElementById("intro-shade");
  const grad = document.getElementById("intro-grad");
  if (!root || !stage || !shade || !grad) return;
  progress = p;
  root.dataset.introP = p.toFixed(3);
  const g = geometry(root);
  const q = ease(p);
  const px = g.e0.x + (g.t.x - g.e0.x) * q;
  const py = g.e0.y + (g.t.y - g.e0.y) * q;
  // The clip zooms mostly late, so it still covers the (shrinking) shield; both scale about the engine.
  const k = Math.pow(g.s / g.c, q * q * q);
  stage.style.transformOrigin = `${g.e0.x}px ${g.e0.y}px`;
  stage.style.transform = `translate(${px - g.e0.x}px, ${py - g.e0.y}px) scale(${k})`;
  const hs = g.h0 * Math.pow(g.h1 / g.h0, q);
  const X = (x: number) => (px + (x - FIELD_ANCHOR.x) * hs).toFixed(2);
  const Y = (y: number) => (py + (y - FIELD_ANCHOR.y) * hs).toFixed(2);
  // A huge outer rectangle, so nothing shows at the screen edges; even-odd cuts the shield out of it.
  shade.setAttribute(
    "d",
    `M-20000 -20000H20000V20000H-20000Z M${X(256)} ${Y(62)}L${X(410)} ${Y(112)}Q${X(416)} ${Y(292)} ${X(256)} ${Y(414)}Q${X(96)} ${Y(292)} ${X(102)} ${Y(112)}Z`,
  );
  // The gradient stays put on the screen (centred on the final shield), so it never flickers while closing.
  grad.setAttribute("cx", String(g.t.x));
  grad.setAttribute("cy", String(g.t.y - g.h1 * 30));
  grad.setAttribute("r", String(Math.max(g.w, g.h) * 0.8));
}

function stopClose(): void {
  if (raf !== undefined) cancelAnimationFrame(raf);
  raf = undefined;
}

/** The crest state: frame settles on the shield, progress line and status appear. */
function enterCrest(root: HTMLElement, instant: boolean, natural: boolean): void {
  crestShown = true;
  root.dataset.introPhase = "crest";
  if (instant) root.classList.add("intro-instant");
  root.classList.add("intro-crest");
  holdUntil = Math.max(holdUntil, natural ? performance.now() + CREST_HOLD_MS : 0);
  tryHide();
}

/** Jumps to the end state: the clip's last frame behind the frame, no animation (tap, fallbacks, `withIntro`). */
function showEndState(): void {
  const root = el();
  if (!root) return;
  stopClose();
  const v = video();
  if (v) v.pause();
  root.classList.add("intro-still");
  render(1);
  enterCrest(root, true, false);
}

/** The clip ended: hold its last frame, close the green in, then settle the crest. */
function startClose(): void {
  const root = el();
  if (!root || crestShown || raf !== undefined) return;
  root.classList.add("intro-still"); // the clip's last frame is this picture
  root.dataset.introPhase = "close";
  const freeze = Number(new URLSearchParams(window.location.search).get("introFreeze"));
  const stopAt = Number.isFinite(freeze) && freeze > 0 && freeze < 1 ? freeze : 1;
  const start = performance.now();
  const step = (now: number): void => {
    const p = Math.min(stopAt, (now - start) / CLOSE_MS);
    render(p);
    if (p >= 1) {
      raf = undefined;
      enterCrest(root, false, true);
    } else if (p >= stopAt) {
      raf = undefined; // test hook: hold at this progress
    } else {
      raf = requestAnimationFrame(step);
    }
  };
  raf = requestAnimationFrame(step);
}

function tryHide(): void {
  const root = el();
  if (!root || hidden || !ready || !crestShown) return;
  if (hideTimer !== undefined) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => hide(root), Math.max(0, holdUntil - performance.now()));
}

function setUpClip(root: HTMLElement): void {
  window.addEventListener("resize", () => {
    if (!hidden) render(progress);
  });
  root.dataset.introPhase = "clip";
  render(0);
  const v = video();
  if (!v) {
    showEndState();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    v.remove();
    showEndState();
    return;
  }
  v.addEventListener("ended", startClose);
  v.addEventListener("error", showEndState);
  root.addEventListener(
    "pointerdown",
    () => {
      if (!crestShown) showEndState();
    },
    { once: true },
  );
  // Markup autoplay normally has started it; ask again in case it was held back, and give up if it never plays.
  void v.play().catch(showEndState);
  window.setTimeout(() => {
    if (v.currentTime === 0 && !v.classList.contains("intro-playing")) showEndState();
  }, VIDEO_START_MS);
}

/** Called first thing in `main()`. `debug` removes the overlay immediately. */
export function startIntro(debug: boolean): void {
  const root = el();
  if (!root) return;
  if (debug) {
    root.remove();
    return;
  }
  startRotation(strings.intro.boot);
  setUpClip(root);
  // Failsafe: if startup throws before `finishIntro`, never leave the overlay over an error dialog.
  window.setTimeout(() => {
    ready = true;
    crestShown = true;
    holdUntil = 0;
    tryHide();
  }, 15000);
}

/** Marks the title screen ready; the overlay fades out once the crest has been up for its hold.
 * `?introMs=N` overrides the minimum page-time hold (the e2e screenshots need a longer one). */
export function finishIntro(): void {
  if (!el()) return;
  const override = Number(new URLSearchParams(window.location.search).get("introMs"));
  if (Number.isFinite(override) && override > 0) holdUntil = Math.max(holdUntil, override);
  ready = true;
  tryHide();
}

function hide(root: HTMLElement): void {
  hidden = true;
  stopRotation();
  root.classList.remove("intro-late");
  root.classList.add("intro-out");
  // Kept in the DOM (hidden) so `withIntro` can show it again for a slow step.
  window.setTimeout(() => {
    if (root.classList.contains("intro-out")) root.classList.add("intro-gone");
  }, FADE_MS + 50);
}

/**
 * Runs `work` (synchronous and slow) behind the intro overlay. The overlay is armed first and given two frames to be
 * composited, then fades in after 250 ms via a CSS animation (compositor-driven, so it appears even while `work` blocks
 * the main thread). A step that finishes sooner is never seen. After `work`, the overlay goes away.
 */
export function withIntro(message: string, work: () => void): void {
  const root = el();
  if (!root) {
    // Removed under `?debug=1`: just run.
    work();
    return;
  }
  hidden = false;
  // The slow-step overlay is the end state only (the still behind the frame), never the clip.
  root.classList.remove("intro-out", "intro-gone");
  root.classList.add("intro-late");
  showEndState();
  startRotation([message]);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      try {
        work();
      } finally {
        hide(root);
      }
    }),
  );
}
