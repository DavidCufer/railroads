/** Wires pointer/touch/wheel input on the canvas to a render Camera (SPEC §5.2). */
import { Camera } from "../render/camera";

interface ActivePointer {
  x: number;
  y: number;
}

const WHEEL_ZOOM_SPEED = 0.0015;
const INERTIA_DECAY_PER_SEC = 0.001; // exponential decay factor applied per second
const INERTIA_STOP_SPEED = 4; // px/s below which inertia stops

export class CameraInput {
  private pointers = new Map<number, ActivePointer>();
  private lastPinchDist: number | null = null;
  private lastPanPoint: ActivePointer | null = null;
  private velocity = { x: 0, y: 0 };
  private lastMoveTime = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly getViewport: () => { width: number; height: number },
  ) {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  /** Applies pan inertia; call once per render frame. */
  update(dtMs: number): void {
    if (this.pointers.size > 0) return;
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed < INERTIA_STOP_SPEED) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      return;
    }
    this.camera.pan((this.velocity.x * dtMs) / 1000, (this.velocity.y * dtMs) / 1000);
    const decay = Math.pow(INERTIA_DECAY_PER_SEC, dtMs / 1000);
    this.velocity.x *= decay;
    this.velocity.y *= decay;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.velocity.x = 0;
    this.velocity.y = 0;
    if (this.pointers.size === 1) {
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
    } else if (this.pointers.size === 2) {
      this.lastPinchDist = this.currentPinchDistance();
      this.lastPanPoint = null;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 1 && this.lastPanPoint) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      this.camera.pan(dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - this.lastMoveTime);
      this.velocity.x = (dx / dt) * 1000;
      this.velocity.y = (dy / dt) * 1000;
      this.lastMoveTime = now;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
    } else if (this.pointers.size === 2) {
      const dist = this.currentPinchDistance();
      if (dist !== null && this.lastPinchDist !== null && this.lastPinchDist > 0) {
        const factor = dist / this.lastPinchDist;
        const mid = this.pinchMidpoint();
        const rect = this.canvas.getBoundingClientRect();
        const viewport = this.getViewport();
        if (mid) {
          this.camera.zoomAt(
            mid.x - rect.left,
            mid.y - rect.top,
            factor,
            viewport.width,
            viewport.height,
          );
        }
      }
      this.lastPinchDist = dist;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinchDist = null;
    if (this.pointers.size === 1) {
      const remaining = this.pointers.values().next().value as ActivePointer | undefined;
      this.lastPanPoint = remaining ? { x: remaining.x, y: remaining.y } : null;
    } else if (this.pointers.size === 0) {
      this.lastPanPoint = null;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const viewport = this.getViewport();
    const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED);
    this.camera.zoomAt(
      e.clientX - rect.left,
      e.clientY - rect.top,
      factor,
      viewport.width,
      viewport.height,
    );
  };

  private currentPinchDistance(): number | null {
    if (this.pointers.size < 2) return null;
    const [a, b] = Array.from(this.pointers.values());
    if (!a || !b) return null;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pinchMidpoint(): ActivePointer | null {
    if (this.pointers.size < 2) return null;
    const [a, b] = Array.from(this.pointers.values());
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
