/** Diesel and electric side views (STYLE §9.3). Facing right; x from 0 (rear) to `w` (front);
 * rail top at y = 23; every model has its own body profile. */

import type { LocomotiveDef } from "../../data/trains";
import {
  darken,
  disc,
  drawWheel,
  lighten,
  line,
  rrectPath,
  shadedBox,
  shadedPoly,
  shadedRoundedPoly,
  type Pen,
} from "./draw";
import { powerLivery, type PowerLivery } from "./livery";

export interface PowerLayout {
  w: number;
  /** Truck centres (x) and axles per truck. */
  trucks: number[];
  axles: 2 | 3;
}

const BODY_BOTTOM = 17.6;
const WHEEL_R = 1.7;

export function powerLayout(def: LocomotiveDef): PowerLayout {
  const axles: 2 | 3 = def.weightClass === "heavy" ? 3 : 2;
  const w = WIDTH[def.id] ?? 68;
  const truckSpan = axles === 3 ? 6.2 : 4.4;
  const inset = truckSpan / 2 + 5.2;
  const t = TRUCKS[def.id];
  return { w, trucks: t ? t(w) : [inset + 3, w - inset - 3], axles };
}

const WIDTH: Record<string, number> = {
  "early-electric": 46,
  "streamliner-diesel": 80,
  "e-unit-electric": 84,
  "cab-unit-diesel": 72,
  "road-switcher-diesel": 66,
  "modern-electric": 74,
  "high-horsepower-diesel": 86,
  "heavy-diesel": 92,
  "high-speed-trainset": 78,
  "heavy-freight-electric": 76,
};

const TRUCKS: Record<string, (w: number) => number[]> = {
  "early-electric": (w) => [11, w - 11],
  "streamliner-diesel": (w) => [15, w - 20],
  "e-unit-electric": (w) => [17, w - 17],
  "cab-unit-diesel": (w) => [14, w - 17],
  "road-switcher-diesel": (w) => [15, w - 18],
  "modern-electric": (w) => [16, w - 16],
  "high-horsepower-diesel": (w) => [18, w - 21],
  "heavy-diesel": (w) => [19, w - 22],
  "high-speed-trainset": (w) => [13, w - 15],
  "heavy-freight-electric": (w) => [17, w - 17],
};

// --- shared parts -------------------------------------------------------------------------------

function drawTruck(p: Pen, cx: number, axles: 2 | 3, lv: PowerLivery): void {
  const span = axles === 3 ? 4.2 : 4.6;
  const half = ((axles - 1) * span) / 2;
  const frameHalf = half + 2.9;
  // Side frame with bolster, then wheels on top.
  shadedBox(p, cx - frameHalf, 19.0, frameHalf * 2, 2.5, 0.8, lighten(lv.underframe, 0.06), {
    hi: 0.3,
    lo: 0.2,
  });
  for (let i = 0; i < axles; i++) {
    const x = cx - half + i * span;
    drawWheel(p, x, 23 - WHEEL_R, WHEEL_R, {
      wheel: "#6B727B",
      tyre: "#2A2D31",
      spokes: 0,
      hub: "#B5BAC1",
    });
    disc(p, x, 23 - WHEEL_R, WHEEL_R * 0.62, "#454B53");
    disc(p, x, 23 - WHEEL_R, 0.4, "#C5C9CF");
  }
  shadedBox(p, cx - 1.5, 17.7, 3, 1.5, 0.3, lv.underframe, { hi: 0.2, lo: 0 });
}

function drawFuelTank(p: Pen, x0: number, x1: number, lv: PowerLivery): void {
  shadedBox(p, x0, 18.4, x1 - x0, 2.9, 1.4, darken(lv.underframe, 0.1), { hi: 0.35, lo: 0.3 });
}

/** Diamond (early/mid) or single-arm (modern) pantograph with insulators, base at roof y. */
function drawPantograph(p: Pen, x: number, roofY: number, kind: "diamond" | "arm"): void {
  const { ctx } = p;
  const top = roofY - 3.2;
  shadedBox(p, x - 2.4, roofY - 0.9, 0.9, 0.9, 0.2, "#D8D2C0", { hi: 0, lo: 0 });
  shadedBox(p, x + 1.5, roofY - 0.9, 0.9, 0.9, 0.2, "#D8D2C0", { hi: 0, lo: 0 });
  ctx.lineCap = "round";
  if (kind === "diamond") {
    ctx.strokeStyle = "#20242a";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(x - 2, roofY - 0.9);
    ctx.lineTo(x, top + 1.4);
    ctx.lineTo(x + 2, roofY - 0.9);
    ctx.moveTo(x - 1.2, roofY - 0.9);
    ctx.lineTo(x, top + 1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 2.6, top + 0.9);
    ctx.lineTo(x + 2.6, top + 0.9);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#20242a";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x - 1, roofY - 0.9);
    ctx.lineTo(x + 1.6, top + 1.8);
    ctx.lineTo(x - 0.4, top + 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 1.6, top + 0.9);
    ctx.lineTo(x + 1.2, top + 0.9);
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function glassRect(
  p: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  lv: PowerLivery,
  r = 0.4,
): void {
  const { ctx } = p;
  rrectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = lv.glass;
  ctx.fill();
  ctx.strokeStyle = darken(lv.trim, 0.1);
  ctx.lineWidth = Math.max(p.ow, 0.35);
  ctx.stroke();
  // Glint.
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(x + w * 0.1, y + 0.2, w * 0.35, Math.max(0.2, h * 0.28));
}

function louvres(
  p: Pen,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  n: number,
  color: string,
): void {
  const { ctx } = p;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.28;
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
  }
}

function headlight(p: Pen, x: number, y: number): void {
  disc(p, x, y, 0.95, "#FFF3B8", "#5b5230");
}

function stripe(p: Pen, x0: number, x1: number, y: number, h: number, color: string): void {
  p.ctx.fillStyle = color;
  p.ctx.fillRect(x0, y, x1 - x0, h);
}

function coupler(p: Pen, x: number, dir: 1 | -1, lv: PowerLivery): void {
  shadedBox(p, dir === 1 ? x : x - 1.8, 17.2, 1.8, 1.1, 0.25, darken(lv.underframe, 0.1), {
    hi: 0.3,
    lo: 0,
  });
}

/** Clips subsequent painting to the body outline so decoration never spills. */
function withClip(
  p: Pen,
  pts: ReadonlyArray<[number, number]>,
  r: number | number[],
  fn: () => void,
): void {
  p.ctx.save();
  shadedRoundedPolyPath(p, pts, r);
  p.ctx.clip();
  fn();
  p.ctx.restore();
}
import { roundedPolyPath } from "./draw";
function shadedRoundedPolyPath(
  p: Pen,
  pts: ReadonlyArray<[number, number]>,
  r: number | number[],
): void {
  roundedPolyPath(p.ctx, pts, r);
}

// --- models ---------------------------------------------------------------------------------------

function earlyElectric(p: Pen, lay: PowerLayout, lv: PowerLivery): void {
  const { w } = lay;
  const top = 7.4;
  const body: Array<[number, number]> = [
    [2.6, BODY_BOTTOM],
    [2.6, top + 1.2],
    [4.4, top],
    [w - 4.4, top],
    [w - 2.6, top + 1.2],
    [w - 2.6, BODY_BOTTOM],
  ];
  // Platforms / buffers first.
  shadedBox(p, 0.6, 16.9, w - 1.2, 1.1, 0.3, lv.underframe, { hi: 0.3, lo: 0 });
  for (const t of lay.trucks) drawTruck(p, t, lay.axles, lv);
  coupler(p, 0, -1, lv);
  coupler(p, w, 1, lv);
  shadedRoundedPoly(p, body, 0.8, lv.body, { hi: 0.28, lo: 0.24 });
  withClip(p, body, 0.8, () => {
    // Vertical panel lines and cream lining.
    louvres(
      p,
      7,
      w - 7,
      top + 3.6,
      BODY_BOTTOM - 1.6,
      Math.round((w - 14) / 3.6),
      darken(lv.body, 0.4),
    );
    stripe(p, 2.6, w - 2.6, top + 2.9, 0.4, lv.accent);
    stripe(p, 2.6, w - 2.6, BODY_BOTTOM - 1.4, 0.4, lv.accent);
  });
  // Small end windows, both ends.
  for (const x of [4.2, w - 7.4]) {
    glassRect(p, x, top + 1.5, 3.2, 3.4, lv);
  }
  // Roof: slight step, insulators, diamond pantograph, headlamp.
  shadedBox(p, 8, top - 0.9, w - 16, 1.0, 0.4, lv.roof, { hi: 0.3, lo: 0 });
  drawPantograph(p, w * 0.5, top - 0.9, "diamond");
  headlight(p, w - 3.4, top + 6.8);
  // Bell on the rear roof.
  disc(p, 6, top - 0.7, 0.8, "#C9A23A", "#5b4a17");
}

function bulldogNose(w: number, top: number): Array<[number, number]> {
  return [
    [0.6, BODY_BOTTOM],
    [0.6, top + 2.2],
    [2.6, top],
    [w - 20, top],
    [w - 15, top - 1.1],
    [w - 11, top - 1.1],
    [w - 6, top + 2.6],
    [w - 1.6, top + 8.6],
    [w - 0.6, top + 12.2],
    [w - 0.6, BODY_BOTTOM],
  ];
}

function streamliner(p: Pen, lay: PowerLayout, lv: PowerLivery): void {
  const { w } = lay;
  const top = 3.6;
  const body = bulldogNose(w, top);
  drawFuelTank(p, lay.trucks[0]! + 8, lay.trucks[1]! - 8, lv);
  for (const t of lay.trucks) drawTruck(p, t, lay.axles, lv);
  shadedRoundedPoly(p, body, [1, 1.4, 1.4, 1.6, 1.6, 2.6, 2.2, 1.4, 0.6, 0.6], lv.body, {
    hi: 0.3,
    lo: 0.22,
  });
  withClip(p, body, [1, 1.4, 1.4, 1.6, 1.6, 2.6, 2.2, 1.4, 0.6, 0.6], () => {
    // Cream roof band and lower skirt, brass nose stripe sweeping down the side.
    stripe(p, 0, w, top - 2, 3.9, lv.band);
    stripe(p, 0, w, 15.2, 2.6, darken(lv.body, 0.35));
    stripe(p, 0, w - 8, 12.6, 0.7, lv.accent);
    stripe(p, 0, w - 8, 13.5, 0.3, lv.accent);
    p.ctx.beginPath();
    p.ctx.moveTo(w - 8, 12.6);
    p.ctx.quadraticCurveTo(w - 4, 12.6, w - 1.4, 8.8);
    p.ctx.lineTo(w, 9.8);
    p.ctx.quadraticCurveTo(w - 4, 13.6, w - 8, 13.3);
    p.ctx.closePath();
    p.ctx.fillStyle = lv.accent;
    p.ctx.fill();
    // Porthole windows.
    for (let x = 9; x < w - 22; x += 4.4) disc(p, x, 9.1, 1.05, lv.glass, darken(lv.body, 0.5));
    // Rear louvre panel.
    louvres(p, 3, 7, 8, 14.8, 4, darken(lv.body, 0.5));
  });
  // Raised cab window and windscreen.
  const cabx = w - 19;
  glassRect(p, cabx, top - 0.3, 4.6, 3.2, lv, 0.8);
  shadedPoly(
    p,
    [
      [w - 13.6, top - 0.5],
      [w - 9.8, top - 0.3],
      [w - 5.8, top + 2.9],
      [w - 13.6, top + 2.9],
    ],
    lv.glass,
    { hi: 0, lo: 0 },
  );
  headlight(p, w - 2.3, 12.2);
  disc(p, w - 8.5, 5.0, 0.35, "#333");
  // Rear coupler and nose coupler.
  coupler(p, 0.6, -1, lv);
  coupler(p, w - 0.6, 1, lv);
}

function eUnit(p: Pen, lay: PowerLayout, lv: PowerLivery): void {
  const { w } = lay;
  const top = 3.8;
  const body: Array<[number, number]> = [
    [0.6, BODY_BOTTOM],
    [0.6, top + 9],
    [3.4, top + 1.2],
    [7, top],
    [w - 7, top],
    [w - 3.4, top + 1.2],
    [w - 0.6, top + 9],
    [w - 0.6, BODY_BOTTOM],
  ];
  const rr = [0.8, 1.2, 2.6, 1.4, 1.4, 2.6, 1.2, 0.8];
  drawFuelTank(p, lay.trucks[0]! + 9, lay.trucks[1]! - 9, lv);
  for (const t of lay.trucks) drawTruck(p, t, lay.axles, lv);
  shadedRoundedPoly(p, body, rr, lv.body, { hi: 0.3, lo: 0.2 });
  withClip(p, body, rr, () => {
    stripe(p, 0, w, 9.6, 5.4, lv.band);
    stripe(p, 0, w, 9.0, 0.6, lv.accent);
    stripe(p, 0, w, 15.0, 0.4, lv.accent);
    stripe(p, 0, w, 15.6, 2.2, darken(lv.band, 0.3));
    // Red nose tips at both ends.
    stripe(p, 0, 3.4, top, 14, lv.accent);
    stripe(p, w - 3.4, w, top, 14, lv.accent);
    // Window band + louvres.
    for (let x = 11; x < w - 11; x += 5.2) glassRect(p, x, 5.6, 3.2, 2.4, lv, 0.5);
    louvres(p, 26, 34, 10.4, 14.4, 6, darken(lv.band, 0.55));
    louvres(p, w - 34, w - 26, 10.4, 14.4, 6, darken(lv.band, 0.55));
  });
  // Cab windscreens (both ends).
  shadedPoly(
    p,
    [
      [w - 8.6, top + 0.6],
      [w - 4.2, top + 1.6],
      [w - 2.4, top + 5.4],
      [w - 8.6, top + 5.4],
    ],
    lv.glass,
    { hi: 0, lo: 0 },
  );
  shadedPoly(
    p,
    [
      [8.6, top + 0.6],
      [4.2, top + 1.6],
      [2.4, top + 5.4],
      [8.6, top + 5.4],
    ],
    lv.glass,
    { hi: 0, lo: 0 },
  );
  drawPantograph(p, w * 0.32, top, "diamond");
  drawPantograph(p, w * 0.68, top, "diamond");
  headlight(p, w - 1.9, 11.2);
  headlight(p, 1.9, 11.2);
  coupler(p, 0.6, -1, lv);
  coupler(p, w - 0.6, 1, lv);
}

function cabUnit(p: Pen, lay: PowerLayout, lv: PowerLivery): void {
  const { w } = lay;
  const top = 3.4;
  const body: Array<[number, number]> = [
    [0.6, BODY_BOTTOM],
    [0.6, top + 1],
    [1.6, top],
    [w - 15, top],
    [w - 8.5, top + 0.5],
    [w - 3.2, top + 4.2],
    [w - 0.8, top + 8.4],
    [w - 0.6, BODY_BOTTOM],
  ];
  const rr = [0.8, 0.8, 1, 1, 3.2, 3, 2.2, 0.6];
  drawFuelTank(p, lay.trucks[0]! + 8, lay.trucks[1]! - 8, lv);
  for (const t of lay.trucks) drawTruck(p, t, lay.axles, lv);
  shadedRoundedPoly(p, body, rr, lv.body, { hi: 0.3, lo: 0.22 });
  withClip(p, body, rr, () => {
    stripe(p, 0, w, 9.4, 3.4, lv.band);
    stripe(p, 0, w, 9.0, 0.4, lv.accent);
    stripe(p, 0, w, 12.9, 0.4, lv.accent);
    stripe(p, 0, w, 15.4, 2.4, darken(lv.body, 0.4));
    // Grille bands and roof vents at the rear.
    for (let i = 0; i < 3; i++) stripe(p, 3, 15, 5 + i * 1.6, 0.6, darken(lv.body, 0.5));
    louvres(p, 4, 15, 9.8, 12.4, 8, darken(lv.band, 0.5));
    louvres(p, 20, 28, 9.8, 12.4, 6, darken(lv.band, 0.5));
    for (let x = 19; x < w - 22; x += 5.6) glassRect(p, x, 5.4, 2.6, 2.6, lv, 0.4);
  });
  // Roof fan and cab windshield.
  shadedBox(p, 34, top - 0.9, 8, 1.0, 0.5, lv.roof, { hi: 0.3, lo: 0 });
  shadedPoly(
    p,
    [
      [w - 13.4, top + 1.3],
      [w - 8.8, top + 1.5],
      [w - 4.6, top + 4.2],
      [w - 13.4, top + 4.2],
    ],
    lv.glass,
    { hi: 0, lo: 0 },
  );
  glassRect(p, w - 20, top + 1.3, 4, 3, lv, 0.5);
  headlight(p, w - 2.2, 8.6);
  // Grille slot on the nose.
  louvres(p, w - 5.5, w - 2.2, 11.4, 15.2, 4, darken(lv.body, 0.55));
  coupler(p, 0.6, -1, lv);
  coupler(p, w - 0.6, 1, lv);
}

function handrails(p: Pen, x0: number, x1: number, y: number, h: number, lv: PowerLivery): void {
  const { ctx } = p;
  ctx.strokeStyle = lv.handrail;
  ctx.lineWidth = 0.32;
  ctx.beginPath();
  ctx.moveTo(x0, y - h);
  ctx.lineTo(x1, y - h);
  ctx.stroke();
  for (let x = x0; x <= x1 + 0.01; x += 3.2) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.stroke();
  }
}

function roadSwitcher(p: Pen, lay: PowerLayout, lv: PowerLivery): void {
  const { w } = lay;
  const hoodTop = 8.6;
  const cabTop = 3.4;
  const cabX0 = 14;
  const cabX1 = 27;
  drawFuelTank(p, lay.trucks[0]! + 7, lay.trucks[1]! - 7, lv);
  for (const t of lay.trucks) drawTruck(p, t, lay.axles, lv);
  // Walkway / frame.
  shadedBox(p, 0.6, 16.6, w - 1.2, 1.0, 0.25, lv.underframe, { hi: 0.4, lo: 0 });
  // Hoods.
  shadedBox(p, 2, hoodTop, cabX0 - 2, 16.6 - hoodTop, 0.9, lv.body, { hi: 0.28, lo: 0.24 });
  shadedRoundedPoly(
    p,
    [
      [cabX1 - 0.4, 16.6],
      [cabX1 - 0.4, hoodTop],
      [w - 3.6, hoodTop],
      [w - 1.6, hoodTop + 1.6],
      [w - 1.6, 16.6],
    ],
    [0, 0.6, 1, 0.8, 0.5],
    lv.body,
    { hi: 0.28, lo: 0.24 },
  );
  // Cab.
  shadedRoundedPoly(
    p,
    [
      [cabX0, 16.6],
      [cabX0, cabTop + 1.2],
      [cabX0 + 1.4, cabTop],
      [cabX1, cabTop],
      [cabX1, 16.6],
    ],
    [0, 0.6, 1, 0.6, 0],
    lv.body,
    { hi: 0.25, lo: 0.2 },
  );
  shadedBox(p, cabX0 - 0.8, cabTop - 0.6, cabX1 - cabX0 + 1.6, 1.0, 0.5, lv.roof, {
    hi: 0.3,
    lo: 0,
  });
  glassRect(p, cabX0 + 1.4, cabTop + 2.4, 4.4, 4.4, lv, 0.5);
  glassRect(p, cabX1 - 5.8, cabTop + 2.4, 4.4, 4.4, lv, 0.5);
  // Cream end stripes on the hood fronts (both ends) and a dark grille section.
  stripe(p, w - 6, w - 1.8, hoodTop + 0.3, 16.2 - hoodTop, lv.accent);
  stripe(p, 2.1, 5, hoodTop + 0.3, 16.2 - hoodTop, lv.accent);
  louvres(p, 33, 47, hoodTop + 1.2, 15.6, 9, darken(lv.body, 0.5));
  // Exhaust stack, roof dome and radiator on the long hood.
  shadedBox(p, 30, hoodTop - 1.6, 2.2, 1.7, 0.4, lv.trim, { hi: 0.3, lo: 0 });
  shadedBox(p, 52, hoodTop - 0.9, 10, 1.0, 0.5, lv.roof, { hi: 0.3, lo: 0 });
  shadedBox(p, 5, hoodTop - 0.9, 5, 1.0, 0.4, lv.roof, { hi: 0.3, lo: 0 });
  // Handrails along both hoods (brass).
  handrails(p, 3.6, cabX0 - 1, 16.5, 3.2, lv);
  handrails(p, cabX1 + 1, w - 2.8, 16.5, 3.2, lv);
  headlight(p, w - 2.4, hoodTop + 0.5);
  // Front step / pilot plate.
  shadedBox(p, w - 2.2, 16.6, 1.8, 2.6, 0.3, lv.underframe, { hi: 0.2, lo: 0 });
  coupler(p, 0.6, -1, lv);
  coupler(p, w - 0.6, 1, lv);
}

function fans(p: Pen, xs: number[], y: number, r: number, lv: PowerLivery): void {
  for (const x of xs) {
    shadedBox(p, x - r - 0.5, y - 0.7, r * 2 + 1, 1.0, 0.4, lv.roof, { hi: 0.3, lo: 0 });
    p.ctx.beginPath();
    p.ctx.ellipse(x, y - 0.6, r, 0.55, 0, 0, Math.PI * 2);
    p.ctx.fillStyle = "#15181c";
    p.ctx.fill();
  }
}

function hoodUnit(p: Pen, lay: PowerLayout, lv: PowerLivery, heavy: boolean): void {
  const { w } = lay;
  const hoodTop = heavy ? 6.6 : 8.2;
  const cabTop = heavy ? 2.8 : 3.8;
  const cabX0 = heavy ? w - 30 : 10;
  const cabX1 = heavy ? w - 1.2 : 27;
  drawFuelTank(p, lay.trucks[0]! + 9, lay.trucks[1]! - 9, lv);
  for (const t of lay.trucks) drawTruck(p, t, lay.axles, lv);
  shadedBox(p, 0.6, 16.6, w - 1.2, 1.0, 0.25, lv.underframe, { hi: 0.4, lo: 0 });
  if (heavy) {
    // Long rear hood with a tall radiator section, then a wide-nose safety cab at the front.
    shadedBox(p, 1.6, hoodTop, cabX0 - 1.6, 16.6 - hoodTop, 0.9, lv.body, { hi: 0.28, lo: 0.24 });
    shadedBox(p, 1.6, hoodTop - 2.2, 22, 2.4, 0.7, lv.body, { hi: 0.3, lo: 0.2 });
    louvres(p, 3, 23, hoodTop - 1.8, hoodTop, 12, darken(lv.body, 0.5));
    fans(p, [7, 14, 21], hoodTop - 2.2, 2.4, lv);
    fans(p, [33, 42, 51, 60], hoodTop, 2.7, lv);
    const cab: Array<[number, number]> = [
      [cabX0, 16.6],
      [cabX0, cabTop + 1.2],
      [cabX0 + 1.4, cabTop],
      [w - 8.4, cabTop],
      [w - 1.2, cabTop + 4.6],
      [w - 0.6, 16.6],
    ];
    shadedRoundedPoly(p, cab, [0, 0.8, 1, 1.4, 1.8, 0.6], lv.body, { hi: 0.25, lo: 0.2 });
    // Red angular nose panel, big windscreen, side window.
    withClip(p, cab, [0, 0.8, 1, 1.4, 1.8, 0.6], () => {
      stripe(p, w - 7, w, 0, 17, lv.accent);
      stripe(p, cabX0, w, 13.6, 0.5, lv.band);
    });
    shadedPoly(
      p,
      [
        [w - 16, cabTop + 1.2],
        [w - 9, cabTop + 1.2],
        [w - 3, cabTop + 4.8],
        [w - 3, cabTop + 8],
        [w - 16, cabTop + 8],
      ],
      lv.glass,
      { hi: 0, lo: 0 },
    );
    glassRect(p, cabX0 + 3, cabTop + 2.6, 5, 4.6, lv, 0.5);
    stripe(p, cabX0, w - 7, 9.6, 3.4, darken(lv.body, 0.08));
    louvres(p, cabX0 + 1.4, cabX0 + 9.4, 10, 12.6, 6, darken(lv.body, 0.55));
    handrails(p, 3, cabX0 - 1, 16.5, 3, lv);
    headlight(p, w - 1.8, cabTop + 8);
    coupler(p, 0.6, -1, lv);
    coupler(p, w - 0.6, 1, lv);
    return;
  }
  // High-horsepower: short hood | tall cab | long hood with roof fans and a taller radiator end.
  shadedBox(p, 2, hoodTop, cabX0 - 2, 16.6 - hoodTop, 0.9, lv.body, { hi: 0.28, lo: 0.24 });
  shadedRoundedPoly(
    p,
    [
      [cabX1 - 0.4, 16.6],
      [cabX1 - 0.4, hoodTop],
      [w - 20, hoodTop],
      [w - 19, hoodTop - 2.2],
      [w - 2, hoodTop - 2.2],
      [w - 1.2, hoodTop + 1],
      [w - 1.2, 16.6],
    ],
    [0, 0.6, 0.5, 0.6, 0.8, 0.8, 0.5],
    lv.body,
    { hi: 0.28, lo: 0.24 },
  );
  shadedRoundedPoly(
    p,
    [
      [cabX0, 16.6],
      [cabX0, cabTop + 1.2],
      [cabX0 + 1.4, cabTop],
      [cabX1, cabTop],
      [cabX1, 16.6],
    ],
    [0, 0.6, 1, 0.6, 0],
    lv.body,
    { hi: 0.25, lo: 0.2 },
  );
  shadedBox(p, cabX0 - 0.8, cabTop - 0.6, cabX1 - cabX0 + 1.6, 1.0, 0.5, lv.roof, {
    hi: 0.3,
    lo: 0,
  });
  glassRect(p, cabX0 + 1.4, cabTop + 2.6, 4.2, 4.6, lv, 0.5);
  glassRect(p, cabX1 - 5.6, cabTop + 2.6, 4.2, 4.6, lv, 0.5);
  stripe(p, cabX1 - 0.4, w - 1.2, 11.2, 0.6, lv.accent);
  louvres(p, w - 18, w - 3, hoodTop - 1.6, hoodTop + 4.6, 12, darken(lv.body, 0.5));
  fans(p, [cabX1 + 6, cabX1 + 16, cabX1 + 26], hoodTop, 2.7, lv);
  handrails(p, 3.6, cabX0 - 1, 16.5, 3.2, lv);
  handrails(p, cabX1 + 1, w - 2.8, 16.5, 3.2, lv);
  headlight(p, w - 2.4, hoodTop + 1.6);
  coupler(p, 0.6, -1, lv);
  coupler(p, w - 0.6, 1, lv);
}

function electricCabEnds(w: number, top: number, slope: number): Array<[number, number]> {
  return [
    [0.6, BODY_BOTTOM],
    [0.6, top + 6],
    [slope, top],
    [w - slope, top],
    [w - 0.6, top + 6],
    [w - 0.6, BODY_BOTTOM],
  ];
}

function modernElectric(p: Pen, lay: PowerLayout, lv: PowerLivery, freight: boolean): void {
  const { w } = lay;
  const top = freight ? 3.2 : 3.6;
  const slope = freight ? 5.5 : 7.5;
  const body = electricCabEnds(w, top, slope);
  const rr = [0.8, 1, 1.2, 1.2, 1, 0.8];
  drawFuelTank(p, lay.trucks[0]! + 9, lay.trucks[1]! - 9, lv);
  for (const t of lay.trucks) drawTruck(p, t, lay.axles, lv);
  shadedRoundedPoly(p, body, rr, lv.body, { hi: 0.3, lo: 0.2 });
  withClip(p, body, rr, () => {
    if (freight) {
      stripe(p, 0, w, 5.4, 4.2, lv.band);
      stripe(p, 0, w, 15.0, 2.8, darken(lv.body, 0.3));
      stripe(p, 0, 5.2, top, 14, lv.accent);
      stripe(p, w - 5.2, w, top, 14, lv.accent);
    } else {
      stripe(p, 0, w, 10.2, 4.6, lv.band);
      stripe(p, 0, w, 15.2, 2.6, darken(lv.band, 0.3));
      stripe(p, 0, 3.4, top, 14, lv.accent);
      stripe(p, w - 3.4, w, top, 14, lv.accent);
    }
    // Side louvres between the cabs.
    louvres(
      p,
      slope + 6,
      w / 2 - 3,
      freight ? 10 : 5.4,
      freight ? 15 : 9.6,
      freight ? 10 : 7,
      darken(lv.body, 0.5),
    );
    louvres(
      p,
      w / 2 + 3,
      w - slope - 6,
      freight ? 10 : 5.4,
      freight ? 15 : 9.6,
      freight ? 10 : 7,
      darken(lv.body, 0.5),
    );
    if (!freight) {
      glassRect(p, w / 2 - 1.6, 5.4, 3.2, 2.6, lv, 0.4);
    } else {
      glassRect(p, w / 2 - 1.6, 6.2, 3.2, 2.6, lv, 0.4);
    }
  });
  // Big angular windscreens at both ends and side cab windows.
  const gl = (x0: number, dir: 1 | -1): void => {
    shadedPoly(
      p,
      [
        [x0, top + 0.9],
        [x0 + dir * (slope - 1.4), top + 0.9],
        [x0 + dir * (slope + 1.4), top + 5.4],
        [x0, top + 5.4],
      ],
      lv.glass,
      { hi: 0, lo: 0 },
    );
  };
  gl(w - slope - 4.6 + 4.6, -1);
  gl(slope + 0, 1);
  glassRect(p, slope + 2.6, top + 1.8, 3.6, 3.6, lv, 0.5);
  glassRect(p, w - slope - 6.2, top + 1.8, 3.6, 3.6, lv, 0.5);
  if (freight) {
    drawPantograph(p, w * 0.3, top, "arm");
    drawPantograph(p, w * 0.7, top, "arm");
  } else {
    drawPantograph(p, w * 0.5, top, "arm");
  }
  headlight(p, w - 2.0, 9.6);
  headlight(p, 2.0, 9.6);
  coupler(p, 0.6, -1, lv);
  coupler(p, w - 0.6, 1, lv);
}

function trainset(p: Pen, lay: PowerLayout, lv: PowerLivery): void {
  const { w } = lay;
  const top = 5.4;
  const body: Array<[number, number]> = [
    [0.6, BODY_BOTTOM],
    [0.6, top + 1.2],
    [1.8, top],
    [w - 22, top],
    [w - 8, top + 1.6],
    [w - 1.6, top + 6.8],
    [w - 0.6, top + 9.6],
    [w - 0.6, BODY_BOTTOM],
  ];
  const rr = [0.8, 0.8, 1, 8, 2.4, 1.4, 0.6, 0.6];
  for (const t of lay.trucks) drawTruck(p, t, lay.axles, lv);
  shadedRoundedPoly(p, body, rr, lv.body, { hi: 0.32, lo: 0.2 });
  withClip(p, body, rr, () => {
    // Continuous dark window band, steel blue lower band, skirt over the bogies, red nose tip.
    stripe(p, 0, w, top + 2.0, 2.8, lv.glass);
    for (let x = 6; x < w - 24; x += 6) stripe(p, x, x + 0.4, top + 2.0, 2.8, lv.body);
    stripe(p, 0, w, 12.8, 2.4, lv.band);
    stripe(p, 0, w, 15.4, 2.4, darken(lv.band, 0.35));
    p.ctx.beginPath();
    p.ctx.moveTo(w - 6.6, top + 2.4);
    p.ctx.lineTo(w, top + 8.4);
    p.ctx.lineTo(w, BODY_BOTTOM);
    p.ctx.lineTo(w - 4.2, BODY_BOTTOM);
    p.ctx.quadraticCurveTo(w - 3.2, 12, w - 6.6, top + 2.4);
    p.ctx.fillStyle = lv.accent;
    p.ctx.fill();
  });
  shadedPoly(
    p,
    [
      [w - 20, top + 1.8],
      [w - 9, top + 2.0],
      [w - 3.8, top + 6.2],
      [w - 20, top + 6.2],
    ],
    lv.glass,
    { hi: 0, lo: 0 },
  ); // windscreen
  drawPantograph(p, 24, top, "arm");
  headlight(p, w - 1.5, 13.4);
  coupler(p, 0.6, -1, lv);
  coupler(p, w - 0.6, 1, lv);
}

export function drawPowerLoco(p: Pen, def: LocomotiveDef, lay: PowerLayout): void {
  const lv = powerLivery(def.id);
  switch (def.id) {
    case "early-electric":
      return earlyElectric(p, lay, lv);
    case "streamliner-diesel":
      return streamliner(p, lay, lv);
    case "e-unit-electric":
      return eUnit(p, lay, lv);
    case "cab-unit-diesel":
      return cabUnit(p, lay, lv);
    case "road-switcher-diesel":
      return roadSwitcher(p, lay, lv);
    case "modern-electric":
      return modernElectric(p, lay, lv, false);
    case "high-horsepower-diesel":
      return hoodUnit(p, lay, lv, false);
    case "heavy-diesel":
      return hoodUnit(p, lay, lv, true);
    case "high-speed-trainset":
      return trainset(p, lay, lv);
    case "heavy-freight-electric":
      return modernElectric(p, lay, lv, true);
    default:
      return roadSwitcher(p, lay, lv);
  }
}

void line;
