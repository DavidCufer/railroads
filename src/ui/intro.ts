/**
 * Phase 85: the intro overlay (`#intro` in index.html, painted before any JS runs). `startIntro` takes it over from
 * `main()` (rotating status line), `finishIntro` fades it out once the title screen is mounted (never before a minimum
 * hold, so it can't flash), and `withIntro` re-shows it around a slow synchronous step (map generation, loading a save).
 * Under `?debug=1` it is removed at once so e2e tests keep their speed.
 */
import { strings } from "./strings";

const FADE_MS = 300;
const MIN_HOLD_MS = 1000;
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

/** Called first thing in `main()`. `debug` removes the overlay immediately. */
export function startIntro(debug: boolean): void {
  const root = el();
  if (!root) return;
  if (debug) {
    root.remove();
    return;
  }
  startRotation(strings.intro.boot);
  // Failsafe: if startup throws before `finishIntro`, never leave the overlay over an error dialog.
  window.setTimeout(() => finishIntro(), 15000);
}

/** Fades the first-load intro out when the title screen is ready, no earlier than `MIN_HOLD_MS` after page start.
 * `?introMs=N` overrides the hold (the e2e screenshots need a longer one). */
export function finishIntro(): void {
  const root = el();
  if (!root) return;
  const override = Number(new URLSearchParams(window.location.search).get("introMs"));
  const hold = Number.isFinite(override) && override > 0 ? override : MIN_HOLD_MS;
  const wait = Math.max(0, hold - performance.now());
  window.setTimeout(() => hide(root), wait);
}

function hide(root: HTMLElement): void {
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
  root.classList.remove("intro-out", "intro-gone");
  root.classList.add("intro-late");
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
