/**
 * Floating `+$` labels at stations on delivery (SPEC §8.1), cargo-colored. Purely a rendering
 * concern — src/main.ts drains `GameState.pendingDeliveries` each tick into a short-lived list of
 * these (with a real-time `startMs`) and this module just draws whatever is still active this frame.
 *
 * Phase 24B: labels never overlap. Per station they form a stack anchored just above the station
 * (and its supply bubbles): the newest label sits at the bottom, older ones are pushed up (sliding
 * smoothly) and fade; deliveries arriving in a burst are merged into one "N deliveries" label.
 */
export interface FloatingLabel {
  stationTile: number;
  text: string;
  color: string;
  startMs: number;
  /** Paid revenue and delivery count, so a burst can merge into one label (absent: not mergeable). */
  revenue?: number;
  deliveries?: number;
  /** Renderer-local: current stack offset above the anchor in px (eased toward the slot). */
  offsetPx?: number;
  lastMs?: number;
}

const DURATION_MS = 2400;
const FADE_FROM = 0.6;
const DRIFT_PX = 10;
const LINE_PX = 24;
const MAX_ROWS = 4;
/** Deliveries at one station within this window merge once the stack already has this many rows. */
const MERGE_WINDOW_MS = 1000;
const MERGE_AT_ROWS = 3;
const SLIDE_MS = 110;

export function isLabelExpired(label: FloatingLabel, nowMs: number): boolean {
  return nowMs - label.startMs > DURATION_MS;
}

/** Adds a label; a burst at one station (≥ `MERGE_AT_ROWS` live labels, the newest under
 * `MERGE_WINDOW_MS` old) folds into the newest label as "+$X · N deliveries". */
export function addFloatingLabel(
  labels: FloatingLabel[],
  label: FloatingLabel,
  formatRevenue: (revenue: number) => string,
  deliveriesText: (n: number) => string,
): void {
  if (label.revenue !== undefined) {
    const same = labels.filter((l) => l.stationTile === label.stationTile);
    let newest: FloatingLabel | undefined;
    for (const l of same) if (!newest || l.startMs > newest.startMs) newest = l;
    if (
      newest &&
      newest.revenue !== undefined &&
      same.length >= MERGE_AT_ROWS &&
      label.startMs - newest.startMs < MERGE_WINDOW_MS
    ) {
      newest.revenue += label.revenue;
      newest.deliveries = (newest.deliveries ?? 1) + (label.deliveries ?? 1);
      newest.text = `+${formatRevenue(newest.revenue)} · ${deliveriesText(newest.deliveries)}`;
      newest.startMs = label.startMs;
      return;
    }
  }
  labels.push(label);
}

/** Phase 7.1 review: dark cargo colors (coal `#2A2A2A`, wood, ...) as label fill, over a dark
 * stroke halo, was unreadable against almost any terrain (docs/screenshots/phase-7-delivery-
 * label.png). Cargo colors light enough to read on their own stay cargo-colored (still useful for
 * "what got delivered" at a glance); anything darker falls back to bold white. */
function labelFillColor(cargoColor: string): string {
  const r = parseInt(cargoColor.slice(1, 3), 16);
  const g = parseInt(cargoColor.slice(3, 5), 16);
  const b = parseInt(cargoColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.45 ? "#FFFFFF" : cargoColor;
}

/** Stack rank of each live label at its station: 0 = newest (bottom). */
export function stackRanks(
  labels: readonly FloatingLabel[],
  nowMs: number,
): Map<FloatingLabel, number> {
  const byStation = new Map<number, FloatingLabel[]>();
  for (const l of labels) {
    if (nowMs - l.startMs < 0 || isLabelExpired(l, nowMs)) continue;
    const list = byStation.get(l.stationTile);
    if (list) list.push(l);
    else byStation.set(l.stationTile, [l]);
  }
  const ranks = new Map<FloatingLabel, number>();
  for (const list of byStation.values()) {
    list.sort((a, b) => b.startMs - a.startMs);
    list.forEach((l, i) => ranks.set(l, i));
  }
  return ranks;
}

export function drawDeliveryLabels(
  ctx: CanvasRenderingContext2D,
  viewportW: number,
  viewportH: number,
  labels: readonly FloatingLabel[],
  nowMs: number,
  /** Screen point just above the station (and its bubbles) that its labels stack up from. */
  anchorOf: (stationTile: number) => { x: number; y: number } | undefined,
): void {
  const ranks = stackRanks(labels, nowMs);
  const anchors = new Map<number, { x: number; y: number } | undefined>();
  for (const [label, rank] of ranks) {
    if (rank >= MAX_ROWS) continue;
    let anchor = anchors.get(label.stationTile);
    if (!anchors.has(label.stationTile)) {
      anchor = anchorOf(label.stationTile);
      anchors.set(label.stationTile, anchor);
    }
    if (!anchor) continue;

    const t = (nowMs - label.startMs) / DURATION_MS;
    const target = rank * LINE_PX;
    const dt = label.lastMs === undefined ? SLIDE_MS : Math.min(100, nowMs - label.lastMs);
    label.lastMs = nowMs;
    const cur = label.offsetPx ?? target;
    label.offsetPx = cur + (target - cur) * Math.min(1, dt / SLIDE_MS);

    const x = Math.max(70, Math.min(viewportW - 70, anchor.x));
    const y = anchor.y - label.offsetPx - t * DRIFT_PX;
    if (y < -LINE_PX || y > viewportH + LINE_PX) continue;
    const fade = t < FADE_FROM ? 1 : 1 - (t - FADE_FROM) / (1 - FADE_FROM);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade) * (1 - rank * 0.1);
    ctx.font = "700 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.strokeText(label.text, x, y);
    ctx.fillStyle = labelFillColor(label.color);
    ctx.fillText(label.text, x, y);
    ctx.restore();
  }
}
