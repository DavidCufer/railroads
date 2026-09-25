/**
 * Dev-only FPS counter: tracks a rolling average frame time, plus the actual CPU time spent
 * drawing (as opposed to the full requestAnimationFrame interval, which includes idle vsync
 * wait and is clamped to the display's refresh rate — not a useful signal of render cost).
 */
export class FpsCounter {
  private times: number[] = [];
  private renderTimes: number[] = [];
  private tickTimes: number[] = [];
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

  /** SPEC §10.4: "simulation tick must stay < 2 ms for 60 trains" — timed the same way as render
   * (CPU time inside the call, not wall-clock frame interval) so the two are directly comparable. */
  sampleTickDuration(ms: number): void {
    this.tickTimes.push(ms);
    if (this.tickTimes.length > 200) this.tickTimes.shift();
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

  /** Average CPU time spent in one sim tick (`advanceOneHour`). */
  get avgTickMs(): number {
    if (this.tickTimes.length === 0) return 0;
    return this.tickTimes.reduce((a, b) => a + b, 0) / this.tickTimes.length;
  }
}
