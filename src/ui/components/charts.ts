import { h } from "../h";
import { emptyState } from "./emptyState";
import { sparklinePoints, stackSegments, type StackPart } from "./chartMath";

/** Palette for canvas drawing (canvas can't read CSS variables reliably in tests) — brass accent. */
const BRASS = "#c9a23a";
const BRASS_SOFT = "rgba(201, 162, 58, 0.16)";
const GRID = "rgba(238, 231, 218, 0.08)";

/** STYLE §8.2 sparkline: 1.5px brass line, soft area fill, dot on the last value. Draws at the
 * canvas' own pixel size (set `width`/`height` attributes; use CSS to scale it). */
export function drawSparkline(canvas: HTMLCanvasElement, values: readonly number[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: hgt } = canvas;
  ctx.clearRect(0, 0, w, hgt);
  const pts = sparklinePoints(values, w, hgt, 5);
  if (pts.length < 2) return;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hgt - 0.5);
  ctx.lineTo(w, hgt - 0.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, hgt);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(pts[pts.length - 1]!.x, hgt);
  ctx.closePath();
  ctx.fillStyle = BRASS_SOFT;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  const last = pts[pts.length - 1]!;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = BRASS;
  ctx.fill();
}

export interface StackedBarPart<K extends string = string> extends StackPart<K> {
  color: string;
  label: string;
  /** Pre-formatted value shown in the legend chip. */
  display: string;
  /** What the line is, shown as the chip's tooltip. */
  note?: string;
}

/** Horizontal stacked bar + a legend of chips (colour dot · label · value). Empty → muted note. */
export function stackedBar(parts: readonly StackedBarPart[], emptyText: string): HTMLElement {
  const segments = stackSegments(parts);
  const byKey = new Map(parts.map((p) => [p.key, p]));
  const bar =
    segments.length === 0
      ? emptyState(emptyText, "coin")
      : h(
          "div",
          { className: "stack-bar" },
          ...segments.map((s) =>
            h("span", {
              className: "stack-seg",
              style: {
                width: `${(s.frac * 100).toFixed(2)}%`,
                background: byKey.get(s.key)!.color,
              },
            }),
          ),
        );
  const legend = h(
    "div",
    { className: "stack-legend" },
    ...parts
      .filter((p) => p.value > 0)
      .map((p) =>
        h(
          "span",
          { className: "stack-chip", ...(p.note ? { title: p.note } : {}) },
          h("i", { style: { background: p.color } }),
          h("span", { className: "stack-chip-label" }, p.label),
          h("b", null, p.display),
        ),
      ),
  );
  return h("div", { className: "stack" }, bar, legend);
}
