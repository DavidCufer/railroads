/** Car side views for every cargo type × era bucket (STYLE §9.4). Facing right; rail top y = 23;
 * open cars show their load heap scaled by `fill01`, closed cars show nothing on the body. */

import type { CargoType } from "../../data/cargo";
import {
  darken,
  disc,
  drawWheel,
  hash01,
  lighten,
  line,
  rrectPath,
  shadedBox,
  shadedPoly,
  shadedRoundedPoly,
  type Pen,
} from "./draw";
import { carLivery, type CarLivery, type EraBucket } from "./livery";

const DECK_TOP = 17.4;
const BODY_BOTTOM = 18.6;
const WHEEL_R = 1.7;
const IRON = "#2A2D31";

type Kind =
  | "coach"
  | "mail"
  | "hopper"
  | "ore"
  | "logs"
  | "lumber"
  | "stock"
  | "tank"
  | "gondola"
  | "reefer"
  | "box"
  | "covered"
  | "secure";

function kindOf(cargo: CargoType, era: EraBucket): Kind {
  switch (cargo) {
    case "passengers":
      return "coach";
    case "mail":
      return "mail";
    case "coal":
      return "hopper";
    case "ironOre":
    case "silverOre":
    case "uraniumOre":
      return "ore";
    case "silverBars":
    case "enrichedUranium":
      return "secure";
    case "wood":
      return "logs";
    case "lumber":
      return "lumber";
    case "livestock":
      return "stock";
    case "oil":
    case "fuel":
      return "tank";
    case "steel":
      return "gondola";
    case "food":
      return "reefer";
    case "grain":
      return era === "modern" ? "covered" : "box";
    default:
      return "box";
  }
}

const BASE_LEN: Record<EraBucket, number> = { early: 26, mid: 38, modern: 46 };

export function carWidth(cargo: CargoType, era: EraBucket): number {
  const k = kindOf(cargo, era);
  let w = BASE_LEN[era];
  if (k === "coach" || k === "mail") w += era === "early" ? 4 : era === "mid" ? 6 : 6;
  if (k === "ore") w -= era === "early" ? 3 : 7;
  if (k === "tank") w += era === "early" ? 2 : 2;
  if (k === "covered") w -= 4;
  if (k === "hopper") w -= era === "early" ? 0 : 4;
  return w;
}

// --- running gear ---------------------------------------------------------------------------------

function wheelAt(p: Pen, x: number): void {
  drawWheel(p, x, 23 - WHEEL_R, WHEEL_R, {
    wheel: "#6B727B",
    tyre: "#25282C",
    spokes: 0,
    hub: "#B5BAC1",
  });
  disc(p, x, 23 - WHEEL_R, WHEEL_R * 0.62, "#454B53");
  disc(p, x, 23 - WHEEL_R, 0.4, "#C5C9CF");
}

function runningGear(p: Pen, w: number, era: EraBucket): void {
  if (era === "early") {
    // Two axles with axle-box guards and a wooden underframe.
    for (const x of [w * 0.26, w * 0.74]) {
      shadedBox(p, x - 2.2, 19.0, 4.4, 2.6, 0.5, IRON, { hi: 0.25, lo: 0 });
      wheelAt(p, x);
    }
    shadedBox(p, 0.8, BODY_BOTTOM - 0.4, w - 1.6, 1.2, 0.3, "#3A2A20", { hi: 0.25, lo: 0 });
  } else {
    for (const cx of [w * 0.18, w * 0.82]) {
      shadedBox(p, cx - 4.9, 19.4, 9.8, 2.3, 0.8, "#2b2e33", { hi: 0.3, lo: 0.2 });
      wheelAt(p, cx - 2.3);
      wheelAt(p, cx + 2.3);
    }
    shadedBox(p, 0.6, BODY_BOTTOM - 0.4, w - 1.2, 1.2, 0.3, IRON, { hi: 0.25, lo: 0 });
  }
  // Couplers.
  shadedBox(p, -0.8, 18.0, 1.6, 1.0, 0.25, IRON, { hi: 0.3, lo: 0 });
  shadedBox(p, w - 0.8, 18.0, 1.6, 1.0, 0.25, IRON, { hi: 0.3, lo: 0 });
}

// --- bodies -----------------------------------------------------------------------------------------

function ribs(
  p: Pen,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  step: number,
  color: string,
): void {
  p.ctx.strokeStyle = color;
  p.ctx.lineWidth = 0.22;
  for (let x = x0 + step; x < x1 - 0.1; x += step) {
    p.ctx.beginPath();
    p.ctx.moveTo(x, y0);
    p.ctx.lineTo(x, y1);
    p.ctx.stroke();
  }
}

function roofOf(
  p: Pen,
  x0: number,
  x1: number,
  top: number,
  era: EraBucket,
  lv: CarLivery,
  curved: boolean,
): void {
  const { ctx } = p;
  ctx.beginPath();
  if (curved && era !== "early") {
    ctx.moveTo(x0 - 0.3, top + 1.0);
    ctx.quadraticCurveTo((x0 + x1) / 2, top - 1.5, x1 + 0.3, top + 1.0);
  } else {
    ctx.moveTo(x0 - 0.3, top + 1.0);
    ctx.lineTo(x0 + 1.0, top);
    ctx.lineTo(x1 - 1.0, top);
    ctx.lineTo(x1 + 0.3, top + 1.0);
  }
  ctx.lineTo(x1 + 0.3, top + 1.5);
  ctx.lineTo(x0 - 0.3, top + 1.5);
  ctx.closePath();
  ctx.fillStyle = lv.roof;
  ctx.fill();
  ctx.strokeStyle = darken(lv.roof, 0.5);
  ctx.lineWidth = p.ow;
  ctx.stroke();
}

function door(p: Pen, x: number, y: number, w: number, h: number, color: string): void {
  p.ctx.strokeStyle = darken(color, 0.5);
  p.ctx.lineWidth = 0.3;
  p.ctx.strokeRect(x, y, w, h);
  line(p, x, y, x + w, y + h, darken(color, 0.4), 0.22);
  line(p, x + w, y, x, y + h, darken(color, 0.4), 0.22);
  line(p, x - 0.4, y + h * 0.45, x + w + 0.4, y + h * 0.45, darken(color, 0.55), 0.35);
}

function boxcar(
  p: Pen,
  w: number,
  era: EraBucket,
  lv: CarLivery,
  opts: { grain?: boolean } = {},
): void {
  const top = era === "early" ? 7.6 : 6.4;
  shadedBox(p, 0.6, top, w - 1.2, BODY_BOTTOM - top, 0.4, lv.body, { hi: 0.2, lo: 0.2 });
  if (era === "early")
    ribs(p, 0.6, w - 0.6, top + 0.4, BODY_BOTTOM - 0.4, 1.0, darken(lv.body, 0.35));
  else
    ribs(
      p,
      0.6,
      w - 0.6,
      top + 0.8,
      BODY_BOTTOM - 0.6,
      era === "mid" ? 2.3 : 3.8,
      darken(lv.body, 0.3),
    );
  roofOf(p, 0.6, w - 0.6, top - 0.8, era, lv, true);
  const dw = era === "early" ? 6.4 : 8.6;
  door(p, w / 2 - dw / 2, top + 1.8, dw, BODY_BOTTOM - top - 3.6, lv.body);
  if (opts.grain)
    shadedBox(p, 2.0, top + 4.4, 3.2, 2.4, 0.3, darken(lv.body, 0.25), { hi: 0, lo: 0 });
  // Ladder rungs on the end.
  line(p, 1.2, top + 1, 1.2, BODY_BOTTOM - 0.8, darken(lv.body, 0.5), 0.3);
}

/** Phase 40: the armoured bullion van / shielded flask car: a boxcar body with heavy riveted bands, a barred slit and a
 * padlocked door; the flask car carries a hazard-yellow stripe. */
function secureVan(p: Pen, w: number, era: EraBucket, lv: CarLivery, flask: boolean): void {
  boxcar(p, w, era, lv);
  const top = era === "early" ? 7.6 : 6.4;
  for (const x of [w * 0.18, w * 0.82])
    shadedBox(p, x - 0.5, top, 1.0, BODY_BOTTOM - top, 0.2, darken(lv.body, 0.5), {
      hi: 0.1,
      lo: 0,
    });
  p.ctx.fillStyle = "#15171A";
  p.ctx.fillRect(w * 0.26, top + 1.0, 2.6, 0.7); // barred slit
  p.ctx.fillStyle = flask ? "#E8C21E" : "#C9A24A";
  p.ctx.fillRect(0.9, BODY_BOTTOM - 1.9, w - 1.8, 0.6); // stripe
  p.ctx.fillStyle = "#E8D9A0";
  p.ctx.fillRect(w / 2 - 0.4, top + 3.4, 0.8, 0.9); // padlock
}

function reefer(p: Pen, w: number, era: EraBucket, lv: CarLivery): void {
  boxcar(p, w, era, lv);
  // Ice hatches on the roof and a thick insulated door edge.
  const top = era === "early" ? 7.6 : 6.4;
  for (const x of [w * 0.2, w * 0.8])
    shadedBox(p, x - 1.4, top - 1.6, 2.8, 0.9, 0.2, lighten(lv.roof, 0.15), { hi: 0.3, lo: 0 });
  p.ctx.fillStyle = "rgba(90,140,170,0.5)";
  p.ctx.fillRect(w / 2 - 0.4, top + 1.8, 0.8, BODY_BOTTOM - top - 3.6);
}

function stockcar(p: Pen, w: number, era: EraBucket, lv: CarLivery): void {
  const top = era === "early" ? 7.6 : 6.6;
  shadedBox(p, 0.6, top, w - 1.2, BODY_BOTTOM - top, 0.4, lv.body, { hi: 0.2, lo: 0.2 });
  // Horizontal slats with dark gaps.
  p.ctx.fillStyle = "rgba(20,10,5,0.75)";
  for (let y = top + 1.4; y < BODY_BOTTOM - 2.2; y += 1.7) p.ctx.fillRect(1.6, y, w - 3.2, 0.7);
  // Framing posts + centre door.
  ribs(p, 0.6, w - 0.6, top, BODY_BOTTOM, (w - 1.2) / 6, lv.body);
  roofOf(p, 0.6, w - 0.6, top - 0.8, era, lv, true);
}

function coachWindows(
  p: Pen,
  w: number,
  top: number,
  count: number,
  ww: number,
  wh: number,
  glass: string,
  y: number,
): void {
  const span = w - 12;
  const step = span / count;
  for (let i = 0; i < count; i++) {
    const x = 6 + i * step + (step - ww) / 2;
    rrectPath(p.ctx, x, y, ww, wh, 0.4);
    p.ctx.fillStyle = glass;
    p.ctx.fill();
    p.ctx.strokeStyle = "rgba(20,15,10,0.7)";
    p.ctx.lineWidth = 0.3;
    p.ctx.stroke();
    p.ctx.fillStyle = "rgba(255,255,255,0.28)";
    p.ctx.fillRect(x + 0.3, y + 0.2, ww * 0.4, 0.5);
  }
  void top;
}

function coach(p: Pen, w: number, era: EraBucket, lv: CarLivery, mail: boolean): void {
  const top = era === "early" ? 6.8 : 5.4;
  const bodyCol = lv.body;
  // Platform ends.
  shadedBox(p, -0.2, BODY_BOTTOM - 1.0, 3.4, 1.0, 0.2, IRON, { hi: 0.3, lo: 0 });
  shadedBox(p, w - 3.2, BODY_BOTTOM - 1.0, 3.4, 1.0, 0.2, IRON, { hi: 0.3, lo: 0 });
  shadedBox(p, 1.2, top, w - 2.4, BODY_BOTTOM - top, era === "modern" ? 1.6 : 0.5, bodyCol, {
    hi: 0.25,
    lo: 0.2,
  });
  if (era === "modern" && !mail) {
    // Steel blue window band, cream body.
    p.ctx.fillStyle = "#46637F";
    p.ctx.fillRect(1.2, 11.6, w - 2.4, 2.4);
    p.ctx.fillStyle = darken("#46637F", 0.3);
    p.ctx.fillRect(1.2, 14.0, w - 2.4, 0.5);
  } else {
    // Lining stripe below the windows.
    p.ctx.fillStyle = mail ? "#E9D9A6" : "#C9A23A";
    p.ctx.fillRect(1.2, top + 8.2, w - 2.4, 0.4);
  }
  roofOf(p, 1.2, w - 1.2, top - 0.8, era, lv, era !== "early");
  if (era === "mid") {
    // Clerestory: raised centre roof with tiny windows.
    shadedBox(p, 5, top - 2.2, w - 10, 1.7, 0.6, lv.roof, { hi: 0.3, lo: 0.1 });
    for (let x = 7; x < w - 8; x += 2.4) {
      p.ctx.fillStyle = "rgba(240,235,215,0.65)";
      p.ctx.fillRect(x, top - 1.8, 1.0, 0.8);
    }
  } else if (era === "early") {
    shadedBox(p, w / 2 - 3, top - 1.6, 6, 1.2, 0.3, lv.roof, { hi: 0.3, lo: 0 });
  }
  if (mail) {
    // Centre door and two small windows each side, brass lozenge.
    door(p, w / 2 - 4.4, top + 2.6, 8.8, BODY_BOTTOM - top - 4.4, bodyCol);
    for (const x of [w * 0.15, w * 0.25, w * 0.75, w * 0.85]) {
      shadedBox(p, x - 1, top + 3, 2.0, 2.0, 0.3, "#A9BFCB", { hi: 0, lo: 0 });
    }
    p.ctx.beginPath();
    p.ctx.moveTo(w / 2, top + 0.4);
    p.ctx.lineTo(w / 2 + 1.2, top + 1.3);
    p.ctx.lineTo(w / 2, top + 2.2);
    p.ctx.lineTo(w / 2 - 1.2, top + 1.3);
    p.ctx.closePath();
    p.ctx.fillStyle = "#C9A23A";
    p.ctx.fill();
  } else {
    const wy = era === "modern" ? 7.2 : top + 2.8;
    const count = era === "early" ? 4 : era === "mid" ? 7 : 8;
    coachWindows(
      p,
      w,
      top,
      count,
      era === "early" ? 3.2 : 2.9,
      era === "modern" ? 3.6 : 3.2,
      "#A9BFCB",
      wy,
    );
    // End doors.
    for (const x of [2.4, w - 4.6])
      shadedBox(p, x, top + 2.6, 2.2, BODY_BOTTOM - top - 4.2, 0.3, darken(bodyCol, 0.25), {
        hi: 0.1,
        lo: 0,
      });
  }
}

/** Heap polygon above y=`base` between x0..x1 with peak height `h`. */
function heap(
  p: Pen,
  x0: number,
  x1: number,
  base: number,
  h: number,
  color: string,
  speckle: string,
): void {
  if (h <= 0.05) return;
  const { ctx } = p;
  const n = 10;
  ctx.beginPath();
  ctx.moveTo(x0, base + 0.3);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const env = Math.sin(t * Math.PI) ** 0.7;
    ctx.lineTo(
      x0 + t * (x1 - x0),
      base - h * env - hash01(i * 7 + Math.round(h * 5)) * 0.5 * Math.min(1, h / 2),
    );
  }
  ctx.lineTo(x1, base + 0.3);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.5);
  ctx.lineWidth = p.ow;
  ctx.stroke();
  ctx.fillStyle = speckle;
  for (let i = 0; i < 6 + h * 2; i++) {
    const t = 0.1 + 0.8 * hash01(i + 1);
    const env = Math.sin(t * Math.PI) ** 0.7;
    ctx.fillRect(x0 + t * (x1 - x0), base - hash01(i + 40) * h * env * 0.9, 0.5, 0.4);
  }
}

function hopper(
  p: Pen,
  w: number,
  era: EraBucket,
  lv: CarLivery,
  fill: number,
  ore: boolean,
): void {
  const top = ore ? 10.4 : 8.6;
  const body: Array<[number, number]> = [
    [0.8, top],
    [w - 0.8, top],
    [w - 0.8, BODY_BOTTOM - 4.2],
    [w - 5.2, BODY_BOTTOM],
    [5.2, BODY_BOTTOM],
    [0.8, BODY_BOTTOM - 4.2],
  ];
  // Load first (behind the near side wall lip).
  const maxH = ore ? 3.4 : 4.4;
  heap(p, 1.6, w - 1.6, top + 0.2, maxH * fill, lv.load, ore ? "#B9673F" : "#3d4148");
  shadedRoundedPoly(p, body, era === "early" ? 0.4 : 0.6, lv.body, { hi: 0.2, lo: 0.22 });
  // Top rim and ribs.
  p.ctx.fillStyle = darken(lv.body, 0.3);
  p.ctx.fillRect(0.6, top - 0.5, w - 1.2, 0.9);
  ribs(
    p,
    0.8,
    w - 0.8,
    top + 0.9,
    BODY_BOTTOM - 4.4,
    era === "early" ? 1.6 : 3.4,
    darken(lv.body, 0.4),
  );
  // Hopper doors.
  for (const x of [w * 0.3, w * 0.7])
    shadedBox(p, x - 1.6, BODY_BOTTOM - 1.4, 3.2, 1.2, 0.2, darken(lv.body, 0.35), {
      hi: 0,
      lo: 0,
    });
}

function gondola(p: Pen, w: number, era: EraBucket, lv: CarLivery, fill: number): void {
  const top = 10.4;
  // I-beams first (behind the wall).
  const rows = Math.round(fill * 3 + 0.2);
  for (let r = 0; r < rows; r++) {
    const y = top - 0.4 - r * 1.5;
    p.ctx.fillStyle = "#AEB6BF";
    p.ctx.fillRect(1.4, y - 0.9, w - 2.8, 0.4);
    p.ctx.fillRect(1.4, y - 0.2, w - 2.8, 0.4);
    p.ctx.fillStyle = "#6E7781";
    p.ctx.fillRect(1.4, y - 0.5, w - 2.8, 0.3);
  }
  shadedBox(p, 0.8, top, w - 1.6, BODY_BOTTOM - top, 0.3, lv.body, { hi: 0.2, lo: 0.2 });
  ribs(
    p,
    0.8,
    w - 0.8,
    top + 0.6,
    BODY_BOTTOM - 0.5,
    era === "early" ? 1.8 : 3.2,
    darken(lv.body, 0.45),
  );
  p.ctx.fillStyle = darken(lv.body, 0.3);
  p.ctx.fillRect(0.6, top - 0.4, w - 1.2, 0.8);
}

function flat(p: Pen, w: number, era: EraBucket): void {
  shadedBox(
    p,
    0.6,
    DECK_TOP,
    w - 1.2,
    BODY_BOTTOM - DECK_TOP + 0.4,
    0.2,
    era === "early" ? "#6B4B33" : "#4E4F52",
    { hi: 0.3, lo: 0.2 },
  );
}

function stakes(p: Pen, xs: number[], top: number): void {
  for (const x of xs)
    shadedBox(p, x - 0.35, top, 0.7, DECK_TOP - top, 0.15, "#3A2A20", { hi: 0.2, lo: 0 });
}

function logs(p: Pen, w: number, era: EraBucket, lv: CarLivery, fill: number): void {
  flat(p, w, era);
  const rows = fill <= 0 ? 0 : Math.max(1, Math.round(fill * 3));
  const r = 1.05;
  for (let row = 0; row < rows; row++) {
    const n = 3 + (rows - row) * 2 + 3;
    const usable = w - 8;
    const y = DECK_TOP - r - row * r * 1.75;
    for (let i = 0; i < n; i++) {
      void i;
    }
    // Overlapping horizontal logs of staggered length.
    const seg = usable / 2;
    for (let s = 0; s < 2; s++) {
      const x0 = 3.5 + s * seg + (row % 2) * 0.8;
      const col = mixTone(lv.load, hash01(row * 5 + s));
      rrectPath(p.ctx, x0, y - r, seg - 0.4, r * 2, r);
      p.ctx.fillStyle = col;
      p.ctx.fill();
      p.ctx.strokeStyle = darken(col, 0.55);
      p.ctx.lineWidth = p.ow;
      p.ctx.stroke();
      p.ctx.fillStyle = lighten(col, 0.15);
      p.ctx.fillRect(x0 + 0.5, y - r + 0.2, seg - 1.4, 0.4);
    }
    // Log ends at the right edge.
    disc(p, w - 3.7, y, r * 0.95, "#C79A62", "#5a3b1c");
    disc(p, w - 3.7, y, r * 0.4, "#9B6E3E");
  }
  stakes(p, [3, 3.9, w - 3.5, w - 2.6], DECK_TOP - 1.2 - Math.max(rows, 1) * 1.8);
}

function mixTone(hex: string, t: number): string {
  return t > 0.5 ? lighten(hex, (t - 0.5) * 0.3) : darken(hex, (0.5 - t) * 0.3);
}

function lumber(p: Pen, w: number, era: EraBucket, lv: CarLivery, fill: number): void {
  flat(p, w, era);
  const h = 9 * fill;
  if (h > 0.2) {
    const x0 = 3.2;
    const x1 = w - 3.2;
    const y0 = DECK_TOP - h;
    shadedBox(p, x0, y0, x1 - x0, h, 0.2, lv.load, { hi: 0.15, lo: 0.1 });
    p.ctx.strokeStyle = darken(lv.load, 0.35);
    p.ctx.lineWidth = 0.22;
    for (let y = y0 + 1.1; y < DECK_TOP - 0.2; y += 1.1) {
      p.ctx.beginPath();
      p.ctx.moveTo(x0, y);
      p.ctx.lineTo(x1, y);
      p.ctx.stroke();
    }
    // Strapping.
    for (const x of [x0 + 3, (x0 + x1) / 2, x1 - 3]) line(p, x, y0, x, DECK_TOP, "#33302c", 0.35);
  }
  stakes(p, [2.4, w - 2.4], DECK_TOP - Math.max(h, 2) - 0.5);
}

function tank(p: Pen, w: number, era: EraBucket, lv: CarLivery): void {
  const y0 = 6.6;
  const h = BODY_BOTTOM - 1.0 - y0;
  // Saddle / frame.
  shadedBox(p, 0.8, DECK_TOP + 0.3, w - 1.6, 1.0, 0.2, IRON, { hi: 0.2, lo: 0 });
  shadedBox(p, 1.6, y0, w - 3.2, h, h / 2, lv.body, { hi: 0.32, lo: 0.3 });
  // Banding and highlight.
  for (const x of [w * 0.25, w * 0.5, w * 0.75])
    line(p, x, y0 + 0.4, x, y0 + h - 0.4, darken(lv.body, 0.45), 0.3);
  p.ctx.fillStyle = "rgba(255,255,255,0.18)";
  p.ctx.fillRect(w * 0.12, y0 + 1.4, w * 0.76, 0.6);
  // Dome + walkway + ladders.
  shadedBox(p, w / 2 - 2.0, y0 - 1.9, 4.0, 2.2, 0.9, lighten(lv.body, 0.05), { hi: 0.3, lo: 0.2 });
  shadedBox(p, w / 2 - 2.4, y0 - 2.3, 4.8, 0.7, 0.3, darken(lv.body, 0.3), { hi: 0.3, lo: 0 });
  line(p, 3.4, y0 - 0.2, w - 3.4, y0 - 0.2, darken(lv.body, 0.5), 0.35);
  line(p, 3.4, y0 - 0.9, 3.4, y0 + 0.2, darken(lv.body, 0.5), 0.3);
  line(p, w - 3.4, y0 - 0.9, w - 3.4, y0 + 0.2, darken(lv.body, 0.5), 0.3);
  if (era === "early") {
    // Wooden stave hoops.
    for (let x = 3; x < w - 3; x += 2)
      line(p, x, y0 + 0.8, x, y0 + h - 0.8, darken(lv.body, 0.3), 0.18);
  }
  for (const x of [1.6, w - 1.6]) line(p, x, y0 + 1.5, x, DECK_TOP + 0.3, "#8a8d92", 0.3);
}

function covered(p: Pen, w: number, era: EraBucket, lv: CarLivery): void {
  const top = 6.8;
  const body: Array<[number, number]> = [
    [0.8, top + 1.6],
    [2.2, top],
    [w - 2.2, top],
    [w - 0.8, top + 1.6],
    [w - 0.8, BODY_BOTTOM - 4.2],
    [w - 5.4, BODY_BOTTOM],
    [5.4, BODY_BOTTOM],
    [0.8, BODY_BOTTOM - 4.2],
  ];
  shadedRoundedPoly(p, body, 0.7, lv.body, { hi: 0.3, lo: 0.22 });
  for (const x of [w * 0.22, w * 0.5, w * 0.78]) {
    shadedBox(p, x - 1.6, top - 1.2, 3.2, 1.4, 0.4, lv.roof, { hi: 0.3, lo: 0 });
    shadedBox(p, x - 1.7, BODY_BOTTOM - 1.6, 3.4, 1.3, 0.2, darken(lv.body, 0.4), { hi: 0, lo: 0 });
  }
  ribs(p, 0.8, w - 0.8, top + 0.8, BODY_BOTTOM - 4.6, 4.2, darken(lv.body, 0.35));
  void era;
}

export function drawCar(p: Pen, cargo: CargoType, era: EraBucket, fill: number): void {
  const lv = carLivery(cargo, era);
  const w = carWidth(cargo, era);
  runningGear(p, w, era);
  switch (kindOf(cargo, era)) {
    case "coach":
      return coach(p, w, era, lv, false);
    case "mail":
      return coach(p, w, era, lv, true);
    case "hopper":
      return hopper(p, w, era, lv, fill, false);
    case "ore":
      return hopper(p, w, era, lv, fill, true);
    case "logs":
      return logs(p, w, era, lv, fill);
    case "lumber":
      return lumber(p, w, era, lv, fill);
    case "stock":
      return stockcar(p, w, era, lv);
    case "tank":
      return tank(p, w, era, lv);
    case "gondola":
      return gondola(p, w, era, lv, fill);
    case "reefer":
      return reefer(p, w, era, lv);
    case "covered":
      return covered(p, w, era, lv);
    case "secure":
      return secureVan(p, w, era, lv, cargo === "enrichedUranium");
    default:
      return boxcar(p, w, era, lv, { grain: cargo === "grain" });
  }
}

void shadedPoly;
