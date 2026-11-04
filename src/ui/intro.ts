/**
 * Phase 85/86: the intro overlay (`#intro` in index.html, painted before any JS runs). On first load it plays the 3D
 * arrival clip (`#intro-video`, autoplay in the markup) and cross-fades into the crest at the end of the clip. A tap
 * skips to the crest; a video that errors or hasn't started within `VIDEO_START_MS`, and `prefers-reduced-motion`, show
 * the crest at once. `startIntro` takes it over from `main()` (rotating status line), `finishIntro` fades it out once
 * the title screen is mounted (never before clip + about 1 s of crest), and `withIntro` re-shows the crest (never the
 * clip) around a slow synchronous step. Under `?debug=1` it is removed at once so e2e tests keep their speed.
 */
import { strings } from "./strings";

const FADE_MS = 300;
/** The crest stays at least this long after the clip ends (or from page start when the clip is skipped or absent). */
const CREST_HOLD_MS = 1000;
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

let crestShown = false;
let ready = false;
/** performance.now() before which the intro must stay (crest hold). */
let holdUntil = MIN_HOLD_MS;
let hideTimer: number | undefined;
let hidden = false;

function video(): HTMLVideoElement | null {
  return document.getElementById("intro-video") as HTMLVideoElement | null;
}

/** Cross-fades the clip into the crest. `natural`: the clip played to its end (so the crest holds ~1 s after it). */
function showCrest(natural: boolean): void {
  const root = el();
  if (!root || crestShown) return;
  crestShown = true;
  holdUntil = Math.max(holdUntil, natural ? performance.now() + CREST_HOLD_MS : 0);
  root.classList.add("intro-crest");
  const v = video();
  if (v) window.setTimeout(() => v.pause(), 650);
  tryHide();
}

function tryHide(): void {
  const root = el();
  if (!root || hidden || !ready || !crestShown) return;
  if (hideTimer !== undefined) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => hide(root), Math.max(0, holdUntil - performance.now()));
}

function setUpClip(root: HTMLElement): void {
  const v = video();
  if (!v) {
    showCrest(false);
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    v.remove();
    showCrest(false);
    return;
  }
  v.addEventListener("ended", () => showCrest(true));
  v.addEventListener("error", () => showCrest(false));
  root.addEventListener("pointerdown", () => showCrest(false), { once: true });
  // Markup autoplay normally has started it; ask again in case it was held back, and give up if it never plays.
  void v.play().catch(() => showCrest(false));
  window.setTimeout(() => {
    if (v.currentTime === 0 && !v.classList.contains("intro-playing")) showCrest(false);
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
  // The slow-step overlay is the crest only, never the clip.
  root.classList.remove("intro-out", "intro-gone");
  root.classList.add("intro-late", "intro-crest");
  video()?.pause();
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
