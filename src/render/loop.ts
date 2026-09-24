/**
 * Fixed-timestep sim accumulator driving a requestAnimationFrame render loop (SPEC §3).
 * One sim tick = 1 in-game hour; at 1x speed, 1 in-game day (24 ticks) takes ~1 real second, so
 * the base tick rate is 24 Hz, scaled by the current game speed (0 = paused, 1/2/4/8x). Ticks run
 * independently of frame rate, with a cap per frame — and a lower cap when the previous frame ran
 * long — so the UI stays responsive at high game speeds.
 */

const BASE_TICK_MS = 1000 / 24; // real ms per sim tick (1 in-game hour) at 1x speed
const MAX_TICKS_PER_FRAME = 48;
/** Frame budget (SPEC §3: "drop to fewer if frame time > 12 ms") above which the per-frame tick
 * cap is halved, so a slow frame can't compound into an even slower one. */
const SLOW_FRAME_MS = 12;

export type GameSpeed = 0 | 1 | 2 | 4 | 8;

export interface GameLoopHandlers {
  tick: (dt: number) => void;
  render: (alpha: number) => void;
}

export class GameLoop {
  private accumulator = 0;
  private lastTime: number | null = null;
  private rafId: number | null = null;
  private readonly handlers: GameLoopHandlers;
  /** Wall-clock ms elapsed in the most recent frame (clamped), for animation/input use. */
  lastFrameDeltaMs = 0;
  private speed: GameSpeed = 1;

  constructor(handlers: GameLoopHandlers) {
    this.handlers = handlers;
  }

  getSpeed(): GameSpeed {
    return this.speed;
  }

  /** 0 pauses ticking (and drops any partial accumulator, so unpausing doesn't burst-catch-up). */
  setSpeed(speed: GameSpeed): void {
    this.speed = speed;
    if (speed === 0) this.accumulator = 0;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastTime = null;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private frame = (time: number): void => {
    if (this.lastTime === null) {
      this.lastTime = time;
    }
    const frameDelta = Math.min(time - this.lastTime, 250); // clamp huge gaps (tab backgrounded)
    const wasSlow = this.lastFrameDeltaMs > SLOW_FRAME_MS;
    this.lastTime = time;
    this.lastFrameDeltaMs = frameDelta;

    if (this.speed > 0) {
      this.accumulator += frameDelta;
      const tickMs = BASE_TICK_MS / this.speed;
      const maxTicks = wasSlow
        ? Math.max(1, Math.floor(MAX_TICKS_PER_FRAME / 2))
        : MAX_TICKS_PER_FRAME;
      let ticks = 0;
      while (this.accumulator >= tickMs && ticks < maxTicks) {
        this.handlers.tick(tickMs);
        this.accumulator -= tickMs;
        ticks++;
      }
      this.handlers.render(this.accumulator / tickMs);
    } else {
      this.handlers.render(0);
    }

    this.rafId = requestAnimationFrame(this.frame);
  };
}
