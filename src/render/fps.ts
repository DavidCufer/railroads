/** Dev-only FPS counter: tracks a rolling average frame time. */
export class FpsCounter {
  private times: number[] = [];
  private lastTime: number | null = null;

  sample(now: number): void {
    if (this.lastTime !== null) {
      this.times.push(now - this.lastTime);
      if (this.times.length > 60) this.times.shift();
    }
    this.lastTime = now;
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
}
