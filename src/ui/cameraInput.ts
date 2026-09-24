/**
 * Wires pointer/touch/wheel input on the canvas to a render Camera (SPEC §5.2), and detects taps
 * (Info mode, SPEC §10.2) as pointer sequences that never turn into a drag or pinch.
 *
 * In a build mode (SPEC §5.2): a single finger/left-drag draws a build path instead of panning;
 * two fingers pan (and pinch still zooms, in all modes). Desktop: left-drag builds,
 * right/middle-drag pans.
 */
import { Camera } from "../render/camera";

interface ActivePointer {
  x: number;
  y: number;
}

export interface BuildDragHandlers {
  onStart: (canvasX: number, canvasY: number) => void;
  onMove: (canvasX: number, canvasY: number) => void;
  /** `committed` is true on a normal release (show confirm bar / quick build), false if the drag
   * was cancelled (e.g. a second finger touched down). */
  onEnd: (committed: boolean) => void;
}

const WHEEL_ZOOM_SPEED = 0.0015;
const INERTIA_DECAY_PER_SEC = 0.001; // exponential decay factor applied per second
const INERTIA_STOP_SPEED = 4; // px/s below which inertia stops
/** A pointer sequence is a tap, not a drag, if it never moves more than this many CSS px. */
const TAP_MOVE_THRESHOLD = 8;
const TAP_MAX_DURATION_MS = 500;

export class CameraInput {
  private pointers = new Map<number, ActivePointer>();
  private lastPinchDist: number | null = null;
  private lastPanPoint: ActivePointer | null = null;
  private lastPanMidpoint: ActivePointer | null = null;
  private velocity = { x: 0, y: 0 };
  private lastMoveTime = 0;
  private tapStart: { x: number; y: number; time: number } | null = null;
  private tapMoved = false;
  private onTap: ((x: number, y: number) => void) | null = null;

  private buildMode = false;
  private buildHandlers: BuildDragHandlers | null = null;
  private buildDragPointerId: number | null = null;

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

  /** Called with canvas-local (CSS px) coordinates when a pointer taps without dragging/pinching. */
  setOnTap(handler: (x: number, y: number) => void): void {
    this.onTap = handler;
  }

  /** Switches between "pan/zoom with 1 finger" (false, Info mode) and "1 finger/left-drag builds,
   * 2 fingers pan" (true, a build mode). */
  setBuildMode(active: boolean, handlers: BuildDragHandlers | null): void {
    this.buildMode = active;
    this.buildHandlers = handlers;
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

  private isBuildButton(e: PointerEvent): boolean {
    // Touch/pen has no meaningful "button"; on mouse, only the left button builds (SPEC §5.2:
    // "Desktop: left-drag builds, right/middle-drag pans").
    return e.pointerType !== "mouse" || e.button === 0;
  }

  private canvasLocal(e: { clientX: number; clientY: number }): ActivePointer {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.velocity.x = 0;
    this.velocity.y = 0;

    if (this.pointers.size === 1) {
      if (this.buildMode && this.isBuildButton(e) && this.buildHandlers) {
        this.buildDragPointerId = e.pointerId;
        const local = this.canvasLocal(e);
        this.buildHandlers.onStart(local.x, local.y);
        return;
      }
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.tapStart = { x: e.clientX, y: e.clientY, time: performance.now() };
      this.tapMoved = false;
    } else if (this.pointers.size === 2) {
      if (this.buildDragPointerId !== null) {
        this.buildHandlers?.onEnd(false);
        this.buildDragPointerId = null;
      }
      this.lastPinchDist = this.currentPinchDistance();
      this.lastPanMidpoint = this.pinchMidpoint();
      this.lastPanPoint = null;
      this.tapStart = null;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.buildDragPointerId === e.pointerId && this.pointers.size === 1) {
      const local = this.canvasLocal(e);
      this.buildHandlers?.onMove(local.x, local.y);
      return;
    }

    if (this.pointers.size === 1 && this.lastPanPoint) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      if (this.tapStart) {
        const totalDx = e.clientX - this.tapStart.x;
        const totalDy = e.clientY - this.tapStart.y;
        if (Math.hypot(totalDx, totalDy) > TAP_MOVE_THRESHOLD) this.tapMoved = true;
      }
      this.camera.pan(dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - this.lastMoveTime);
      this.velocity.x = (dx / dt) * 1000;
      this.velocity.y = (dy / dt) * 1000;
      this.lastMoveTime = now;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
    } else if (this.pointers.size === 2) {
      const dist = this.currentPinchDistance();
      const mid = this.pinchMidpoint();
      const rect = this.canvas.getBoundingClientRect();
      const viewport = this.getViewport();

      // In a build mode, two fingers pan (translate) in addition to pinch-zooming.
      if (this.buildMode && mid && this.lastPanMidpoint) {
        this.camera.pan(mid.x - this.lastPanMidpoint.x, mid.y - this.lastPanMidpoint.y);
      }

      if (dist !== null && this.lastPinchDist !== null && this.lastPinchDist > 0 && mid) {
        const factor = dist / this.lastPinchDist;
        this.camera.zoomAt(
          mid.x - rect.left,
          mid.y - rect.top,
          factor,
          viewport.width,
          viewport.height,
        );
      }
      this.lastPinchDist = dist;
      this.lastPanMidpoint = mid;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.lastPinchDist = null;
      this.lastPanMidpoint = null;
    }

    if (this.buildDragPointerId === e.pointerId) {
      this.buildDragPointerId = null;
      this.buildHandlers?.onEnd(true);
    }

    if (this.pointers.size === 1) {
      const remaining = this.pointers.values().next().value as ActivePointer | undefined;
      this.lastPanPoint = remaining ? { x: remaining.x, y: remaining.y } : null;
    } else if (this.pointers.size === 0) {
      this.lastPanPoint = null;
    }

    if (
      this.tapStart &&
      !this.tapMoved &&
      this.pointers.size === 0 &&
      performance.now() - this.tapStart.time <= TAP_MAX_DURATION_MS &&
      this.onTap
    ) {
      const rect = this.canvas.getBoundingClientRect();
      this.onTap(e.clientX - rect.left, e.clientY - rect.top);
    }
    if (this.pointers.size === 0) this.tapStart = null;
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
