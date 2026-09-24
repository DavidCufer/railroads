/**
 * Dev-only FPS counter: tracks a rolling average frame time, plus the actual CPU time spent
 * drawing (as opposed to the full requestAnimationFrame interval, which includes idle vsync
 * wait and is clamped to the display's refresh rate — not a useful signal of render cost).
 */
export class FpsCounter {
  private times: number[] = [];
  private renderTimes: number[] = [];
  private lastTime: number | null = null;

  sample(now: number): void {
    if (this.lastTime !== null) {
      this.times.push(now - this.lastTime);
      if (this.times.length > 60) this.times.shift();
    }
    this.lastTime = now;
  }

  sampleRenderDuration(ms: number): void {
    this.renderTimes.push(ms);
    if (this.renderTimes.length > 60) this.renderTimes.shift();
  }

  get fps(): number {
    if (this.times.length === 0) return 0;
    const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length;
    return avg > 0 ? 1000 / avg : 0;
  }

  get avgFrameMs(): number {
    if (this.times.length === 0) return 0;
    return this.times.reduce((a, b) => a + b, 0) / this.times.length;
  }

  /** Average CPU time spent in the draw call itself, per frame. */
  get avgRenderMs(): number {
    if (this.renderTimes.length === 0) return 0;
    return this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;
  }
}
