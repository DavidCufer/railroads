/**
 * Fixed-timestep sim accumulator driving a requestAnimationFrame render loop (SPEC §3).
 * One sim tick = 1 in-game hour; ticks run independently of frame rate, with a cap per
 * frame so the UI stays responsive at high game speeds.
 */

const TICK_MS = 1000 / 20; // fixed sim step, real ms per tick at 1x
const MAX_TICKS_PER_FRAME = 60;

export interface GameLoopHandlers {
  tick: (dt: number) => void;
  render: (alpha: number) => void;
}

export class GameLoop {
  private accumulator = 0;
  private lastTime: number | null = null;
  private rafId: number | null = null;
  private readonly handlers: GameLoopHandlers;

  constructor(handlers: GameLoopHandlers) {
    this.handlers = handlers;
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
    this.lastTime = time;
    this.accumulator += frameDelta;

    let ticks = 0;
    while (this.accumulator >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      this.handlers.tick(TICK_MS);
      this.accumulator -= TICK_MS;
      ticks++;
    }

    const alpha = this.accumulator / TICK_MS;
    this.handlers.render(alpha);

    this.rafId = requestAnimationFrame(this.frame);
  };
}
