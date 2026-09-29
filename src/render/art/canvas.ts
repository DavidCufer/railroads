/** Offscreen-canvas factory for the art module. Replaceable so unit tests (node, no DOM) can run
 * the drawing code against a recording context. */

export type ArtCanvas = HTMLCanvasElement | OffscreenCanvas;

let factory: (w: number, h: number) => ArtCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

export function setArtCanvasFactory(f: (w: number, h: number) => ArtCanvas): void {
  factory = f;
}

export function makeArtCanvas(w: number, h: number): ArtCanvas {
  return factory(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

export function ctx2d(c: ArtCanvas): CanvasRenderingContext2D {
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("2d context unavailable");
  return ctx;
}

export function devicePixelRatioSafe(): number {
  return typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
}
