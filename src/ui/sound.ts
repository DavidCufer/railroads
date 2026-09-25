/**
 * Optional WebAudio sound effects (SPEC §1/§13: "generated with WebAudio (no audio files)", off
 * by default). Three simple procedural synths — a two-tone whistle, a low chug thump, and a bright
 * cash-register ding — good enough to confirm an action happened without needing any asset files.
 */

export type SoundKind = "whistle" | "chug" | "cashDing";

let audioCtx: AudioContext | null = null;
let enabled = false;

function getContext(): AudioContext | null {
  if (!enabled) return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

/** Called once at startup and again whenever the Settings screen's Sound toggle changes. Resumes
 * a suspended context (mobile browsers start audio contexts suspended until a user gesture) rather
 * than creating a new one every time. */
export function initSound(soundEnabled: boolean): void {
  enabled = soundEnabled;
  if (enabled) void getContext()?.resume();
}

function tone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  peakGain: number,
  type: OscillatorType,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

function playWhistle(ctx: AudioContext): void {
  const now = ctx.currentTime;
  tone(ctx, 520, now, 0.5, 0.15, "sine");
  tone(ctx, 660, now + 0.05, 0.55, 0.1, "sine");
}

function playChug(ctx: AudioContext): void {
  const now = ctx.currentTime;
  tone(ctx, 90, now, 0.18, 0.2, "square");
}

function playCashDing(ctx: AudioContext): void {
  const now = ctx.currentTime;
  tone(ctx, 1_400, now, 0.15, 0.12, "sine");
  tone(ctx, 1_800, now + 0.06, 0.2, 0.1, "sine");
}

export function playSound(kind: SoundKind): void {
  const ctx = getContext();
  if (!ctx) return;
  if (kind === "whistle") playWhistle(ctx);
  else if (kind === "chug") playChug(ctx);
  else playCashDing(ctx);
}
