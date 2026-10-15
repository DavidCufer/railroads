/** Company-history charts (Phase 46): small procedural line charts by year, drawn once into a cached bitmap per data set. */
import { h } from "./h";

const BRASS = "#c8a04a";
const BRASS_SOFT = "rgba(200, 160, 74, 0.16)";
const GRID = "rgba(236, 227, 207, 0.1)";
const TEXT = "rgba(236, 227, 207, 0.7)";

export interface ChartSeries {
  key: string;
  title: string;
  /** One value per year, same order. */
  years: number[];
  values: number[];
  format: (n: number) => string;
}

const CHART_W = 300;
const CHART_H = 84;
const cache = new Map<string, HTMLCanvasElement>();

function draw(
  years: readonly number[],
  series: ChartSeries,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(2, 2);
  const padL = 40;
  const padR = 8;
  const padT = 14;
  const padB = 16;
  const values = series.values;
  const lo = Math.min(0, ...values);
  const hi = Math.max(1, ...values);
  const x = (i: number): number =>
    padL + (values.length <= 1 ? 0 : (i / (values.length - 1)) * (width - padL - padR));
  const y = (v: number): number => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);

  ctx.font = "9px sans-serif";
  ctx.fillStyle = TEXT;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (const v of [hi, lo === 0 ? 0 : lo]) {
    ctx.beginPath();
    ctx.moveTo(padL, y(v) + 0.5);
    ctx.lineTo(width - padR, y(v) + 0.5);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(series.format(v), padL - 4, y(v) + 3);
  }
  ctx.textAlign = "left";
  ctx.fillText(String(years[0] ?? ""), padL, height - 4);
  ctx.textAlign = "right";
  ctx.fillText(String(years[years.length - 1] ?? ""), width - padR, height - 4);

  if (values.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(x(0), y(lo));
    values.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(values.length - 1), y(lo));
    ctx.closePath();
    ctx.fillStyle = BRASS_SOFT;
    ctx.fill();
    ctx.beginPath();
    values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  if (values.length >= 1) {
    ctx.beginPath();
    ctx.arc(x(values.length - 1), y(values[values.length - 1] as number), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = BRASS;
    ctx.fill();
  }
  return canvas;
}

/** A chart for `series`; the bitmap is cached under the data, so reopening the screen costs a blit. */
export function historyChart(series: ChartSeries): HTMLElement {
  const years = series.years;
  const key = `${series.key}|${years.join(",")}|${series.values.map((v) => Math.round(v)).join(",")}`;
  let bitmap = cache.get(key);
  if (!bitmap) {
    bitmap = draw(years, series, CHART_W, CHART_H);
    if (cache.size > 24) cache.clear();
    cache.set(key, bitmap);
  }
  const canvas = h("canvas", {
    className: "history-chart",
    width: String(CHART_W * 2),
    height: String(CHART_H * 2),
    role: "img",
    "aria-label": series.title,
  }) as HTMLCanvasElement;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  return h(
    "div",
    { className: "history-chart-card" },
    h("div", { className: "history-chart-title" }, series.title),
    canvas,
  );
}
