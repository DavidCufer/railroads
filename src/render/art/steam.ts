/** Parametric steam-locomotive side view (STYLE §9.2). Local x: smokebox front at 0, everything
 * else at negative x; the caller shifts by `-layout.minX`. Units: u = height / 24, rail top y = 23. */

import type { LocomotiveDef } from "../../data/trains";
import {
  darken,
  disc,
  drawWheel,
  hash01,
  lighten,
  line,
  polyPath,
  rrectPath,
  shadedBox,
  shadedPoly,
  type Pen,
} from "./draw";
import { steamLivery, type SteamLivery } from "./livery";
import { parseWhyte, type Whyte } from "./whyte";

const STEEL = "#B9BEC5";
const STEEL_DARK = "#4C5158";
const RAIL_Y = 23;

const FREIGHT = new Set(["2-6-0", "2-8-0", "2-8-2", "4-8-8-4"]);
const EXPRESS = new Set(["4-4-2", "4-6-2", "4-6-4"]);

export interface SteamLayout {
  w: Whyte;
  lv: SteamLivery;
  american: boolean;
  D: number;
  B: number;
  rb: number;
  hubY: number;
  boilerTop: number;
  boilerBottom: number;
  /** Driver centres, front to back, per group. */
  drivers: number[][];
  leadAxles: number[];
  trailAxles: number[];
  cylinders: Array<{ back: number; front: number; crosshead: number; main: number }>;
  cabFront: number;
  cabRear: number;
  tenderKind: "single" | "bogie2" | "bogie3";
  tenderFront: number;
  tenderRear: number;
  minX: number;
  maxX: number;
  pilotLen: number;
}

export function whyteName(def: LocomotiveDef): string {
  return `${def.name} ${def.id}`;
}

export function steamLayout(def: LocomotiveDef): SteamLayout {
  const w = parseWhyte(def.name) ?? { lead: 2, groups: [4], trail: 0 };
  const key = `${w.lead}-${w.groups.join("-")}-${w.trail}`;
  const lv = steamLivery(def);
  const american =
    (["4-4-0", "2-6-0", "4-6-0", "2-8-0"].includes(key) && def.introYear < 1900) || key === "4-2-0";
  const single = w.groups[0] === 2;
  const D = single ? 9 : EXPRESS.has(key) ? 9 : FREIGHT.has(key) ? 7 : 8;
  const B = lv.era === 0 ? 6 : def.introYear <= 1900 ? 7 : 8;
  const rb = RAIL_Y - D - 0.8;
  const hubY = RAIL_Y - D / 2;
  const boilerBottom = rb + 0.6;
  const boilerTop = boilerBottom - B;

  const overhang = american ? 6.4 : 4.4;
  const leadN = w.lead / 2;
  const Tc = -overhang;
  const leadAxles: number[] = [];
  for (let i = 0; i < leadN; i++)
    leadAxles.push(Tc + (leadN === 1 ? 0 : (i === 0 ? 1 : -1) * 2.25));
  const sp = D * 1.3;
  // No leading truck (0-4-0): the cylinders sit right behind the smokebox front instead of behind an
  // absent truck, so the engine has no long unsupported nose.
  const cylBack0 = w.lead === 0 ? -5.2 : Tc - 3.6;
  const cylinders: SteamLayout["cylinders"] = [];
  const drivers: number[][] = [];
  // First driver centre of group 0. Small engines (0-4-0, 2-2-0) tuck the front driver under the cylinder
  // block, just behind the crosshead, so the front is carried by wheels rather than overhanging.
  const compact = w.lead <= 2 && w.groups.length === 1 && (w.groups[0] as number) <= 4;
  let cursor = compact ? cylBack0 - 3.3 : cylBack0 - D / 2 - 3.2;
  w.groups.forEach((g, gi) => {
    const n = g / 2;
    const xs: number[] = [];
    if (gi > 0) {
      // Rear group of an articulated engine: its cylinders sit ahead of its first driver.
      const back = (drivers[gi - 1]!.at(-1) as number) - D / 2 - 1.4 - 4.4;
      cylinders.push({ back, front: back + 4.4, crosshead: back - 1.9, main: 0 });
      cursor = back - 1.9 - D / 2 - 0.5 - 1.2;
    } else {
      cylinders.push({ back: cylBack0, front: cylBack0 + 4.4, crosshead: cylBack0 - 1.9, main: 0 });
    }
    for (let i = 0; i < n; i++) xs.push(cursor - i * sp);
    cursor = xs[n - 1] as number;
    drivers.push(xs);
    const cyl = cylinders[gi] as SteamLayout["cylinders"][number];
    cyl.main = n >= 3 && gi === 0 && !FREIGHT.has(key) ? 1 : n >= 3 && gi === 0 ? 1 : 0;
    if (n === 4) cyl.main = 1;
  });
  const lastDriver = cursor;
  const trailN = w.trail / 2;
  const trailAxles: number[] = [];
  for (let i = 0; i < trailN; i++) trailAxles.push(lastDriver - D / 2 - 2.9 - i * 4.4);
  const cabFront = lastDriver + D * 0.3;
  const cabLen = 10.6 + (lv.era === 2 ? 0.6 : 0) + (trailN > 1 ? 3.6 : 0);
  const cabRear = cabFront - cabLen;
  const heavyTender = key === "2-8-2" || key === "4-6-4" || key === "4-8-8-4";
  const tenderKind = lv.era === 0 ? "single" : heavyTender ? "bogie3" : "bogie2";
  const tenderLen =
    tenderKind === "single" ? 14 : tenderKind === "bogie2" ? 21 : key === "4-8-8-4" ? 32 : 28;
  const tenderFront = cabRear - 1.6;
  const tenderRear = tenderFront - tenderLen;
  const pilotLen = american ? 4.6 : 0.8;
  return {
    w,
    lv,
    american,
    D,
    B,
    rb,
    hubY,
    boilerTop,
    boilerBottom,
    drivers,
    leadAxles,
    trailAxles,
    cylinders,
    cabFront,
    cabRear,
    tenderKind,
    tenderFront,
    tenderRear,
    minX: tenderRear - 1.2,
    maxX: pilotLen + 0.4,
    pilotLen,
  };
}

// --- pieces --------------------------------------------------------------------------------------

function smallWheel(p: Pen, lay: SteamLayout, cx: number, r = 2): void {
  drawWheel(p, cx, RAIL_Y - r, r, {
    wheel: lay.lv.era === 0 ? lay.lv.wheel : "#3B4047",
    tyre: lay.lv.era === 0 ? lay.lv.tyre : lay.lv.tyre,
    spokes: 8,
    hub: STEEL,
  });
}

function drawTender(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv, tenderFront: f, tenderRear: r, rb } = lay;
  const len = f - r;
  const top = rb + (lv.era === 2 ? -1.2 : 0.6);
  const bottom = 18.2;
  // Bogies / axles first (behind the body's lower edge).
  const axles: number[] = [];
  if (lay.tenderKind === "single") axles.push(r + len * 0.25, r + len * 0.75);
  else {
    const per = lay.tenderKind === "bogie3" ? 3 : 2;
    const step = 4.2;
    for (const c of [
      r + len * 0.22 + (per === 3 ? 2.4 : 0.6),
      f - len * 0.22 - (per === 3 ? 2.4 : 0.6),
    ]) {
      for (let i = 0; i < per; i++) axles.push(c + (i - (per - 1) / 2) * step);
      shadedBox(
        p,
        c - ((per - 1) * step) / 2 - 2.6,
        18.6,
        (per - 1) * step + 5.2,
        1.6,
        0.5,
        lv.frame,
        { hi: 0.2, lo: 0 },
      );
    }
  }
  if (lay.tenderKind === "single")
    shadedBox(p, r + 1, 18.4, len - 2, 1.4, 0.4, lv.frame, { hi: 0.2, lo: 0 });
  axles.forEach((x) => smallWheel(p, lay, x, 2));
  // Coal heap (behind the front wall so the body overlaps its base).
  const heapTop = top - 2.4;
  ctx.beginPath();
  ctx.moveTo(r + 1.2, top + 0.2);
  const pts = 9;
  for (let i = 0; i <= pts; i++) {
    const t = i / pts;
    const yy = top - 0.4 - Math.sin(t * Math.PI) * 2.0 - hash01(i + 3) * 0.5;
    ctx.lineTo(r + 1.2 + t * (len - 4.6), yy);
  }
  ctx.lineTo(f - 3.4, top + 0.2);
  ctx.closePath();
  ctx.fillStyle = lv.coal;
  ctx.fill();
  for (let i = 0; i < 14; i++) {
    const t = hash01(i * 3.1);
    const xx = r + 2.2 + t * (len - 7);
    const peak = Math.sin(((xx - (r + 1.2)) / (len - 4.6)) * Math.PI) * 1.7;
    ctx.fillStyle = "#4b4f56";
    ctx.fillRect(xx, top - 0.6 - hash01(i + 9) * peak, 0.5, 0.4);
  }
  void heapTop;
  // Body.
  shadedBox(p, r, top, len, bottom - top, 0.7, lv.tender, { hi: 0.22, lo: 0.22 });
  // Livery panel + lining.
  ctx.strokeStyle = lv.tenderLining;
  ctx.lineWidth = 0.32;
  ctx.strokeRect(r + 1.2, top + 1.3, len - 2.4, bottom - top - 2.5);
  // Water hatch and rear buffer beam.
  shadedBox(p, r + 0.8, top - 0.5, 2.6, 0.7, 0.3, darken(lv.tender, 0.3), { hi: 0, lo: 0 });
  shadedBox(p, r - 0.6, bottom - 1.6, 0.9, 1.6, 0.3, lv.frame, { hi: 0, lo: 0 });
  // Drawbar to the cab.
  line(p, f, lay.rb + 2.4, f + 1.7, lay.rb + 2.4, lv.frame, 0.7);
}

function drawCab(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv, cabFront: f, cabRear: r, rb, boilerTop } = lay;
  const roofY = boilerTop - 1.4;
  const floor = rb + 1.6;
  const color = lv.cab;
  shadedBox(p, r + 0.4, roofY, f - r - 0.4, floor - roofY, 0.3, color, { hi: 0.2, lo: 0.18 });
  if (lv.woodCab) {
    ctx.strokeStyle = darken(color, 0.35);
    ctx.lineWidth = 0.18;
    for (let x = r + 1.4; x < f - 0.4; x += 1.1) {
      ctx.beginPath();
      ctx.moveTo(x, roofY + 0.6);
      ctx.lineTo(x, floor - 0.4);
      ctx.stroke();
    }
  }
  // Window(s).
  const wy = roofY + 1.5;
  const wh = 2.9;
  const ww = 2.6;
  const windows = lay.D >= 8 && f - r > 8.6 ? 2 : 1;
  for (let i = 0; i < windows; i++) {
    const wx = r + 1.6 + i * (ww + 1.1);
    shadedBox(p, wx, wy, ww, wh, 0.3, lv.glass, { hi: 0, lo: 0, outline: false });
    ctx.strokeStyle = darken(color, 0.55);
    ctx.lineWidth = 0.4;
    rrectPath(ctx, wx, wy, ww, wh, 0.3);
    ctx.stroke();
  }
  // Overhanging roof, gently curved.
  ctx.beginPath();
  ctx.moveTo(r - 0.9, roofY + 0.5);
  ctx.quadraticCurveTo((r + f) / 2, roofY - 1.5, f + 0.9, roofY + 0.5);
  ctx.lineTo(f + 0.9, roofY + 1.0);
  ctx.lineTo(r - 0.9, roofY + 1.0);
  ctx.closePath();
  ctx.fillStyle = lv.cabRoof;
  ctx.fill();
  ctx.strokeStyle = darken(lv.cabRoof, 0.5);
  ctx.lineWidth = p.ow;
  ctx.stroke();
  // Cab floor skirt.
  shadedBox(p, r + 0.2, floor - 0.2, f - r + 0.2, 1.1, 0.3, lv.frame, { hi: 0, lo: 0 });
}

function drawStack(p: Pen, lay: SteamLayout, x: number): void {
  const { ctx } = p;
  const { lv, boilerTop } = lay;
  const base = boilerTop + 0.5;
  const dark = lv.era === 0 ? "#1B1C1E" : "#141517";
  if (lv.era === 0) {
    // Balloon / diamond stack: flared base, narrow neck, wide funnel top, 6u tall.
    const top = boilerTop - 5.6;
    ctx.beginPath();
    ctx.moveTo(x - 1.5, base);
    ctx.lineTo(x - 0.75, boilerTop - 0.9);
    ctx.lineTo(x - 0.8, boilerTop - 2.2);
    ctx.lineTo(x - 2.5, top);
    ctx.lineTo(x + 2.5, top);
    ctx.lineTo(x + 0.8, boilerTop - 2.2);
    ctx.lineTo(x + 0.75, boilerTop - 0.9);
    ctx.lineTo(x + 1.5, base);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = p.ow;
    ctx.stroke();
    line(p, x - 2.5, top, x + 2.5, top, lv.brass, 0.5);
    line(p, x - 2.0, top + 0.9, x + 2.0, top + 0.9, "#3d3f44", 0.3);
  } else if (lv.era === 1 && lay.w.groups[0]! <= 8) {
    // Tall straight stack with a flared cap, 5u.
    const top = boilerTop - 4.4;
    ctx.beginPath();
    ctx.moveTo(x - 1.6, base);
    ctx.lineTo(x - 0.95, boilerTop - 0.8);
    ctx.lineTo(x - 0.95, top + 0.5);
    ctx.lineTo(x - 1.5, top);
    ctx.lineTo(x + 1.5, top);
    ctx.lineTo(x + 0.95, top + 0.5);
    ctx.lineTo(x + 0.95, boilerTop - 0.8);
    ctx.lineTo(x + 1.6, base);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = p.ow;
    ctx.stroke();
    line(p, x - 1.5, top + 0.15, x + 1.5, top + 0.15, "#3d3f44", 0.35);
  } else {
    // Short stack, 2.5u.
    const top = boilerTop - 2.2;
    ctx.beginPath();
    ctx.moveTo(x - 1.8, base);
    ctx.lineTo(x - 1.2, boilerTop - 0.4);
    ctx.lineTo(x - 1.2, top + 0.5);
    ctx.lineTo(x - 1.7, top);
    ctx.lineTo(x + 1.7, top);
    ctx.lineTo(x + 1.2, top + 0.5);
    ctx.lineTo(x + 1.2, boilerTop - 0.4);
    ctx.lineTo(x + 1.8, base);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = p.ow;
    ctx.stroke();
    line(p, x - 1.7, top + 0.15, x + 1.7, top + 0.15, "#3d3f44", 0.35);
  }
}

function drawDome(p: Pen, lay: SteamLayout, x: number, wdt: number, hgt: number): void {
  const { ctx } = p;
  const { lv, boilerTop } = lay;
  const col = lv.brassDomes ? lv.brass : lv.body;
  const top = boilerTop - hgt;
  ctx.beginPath();
  ctx.moveTo(x - wdt / 2 - 0.4, boilerTop + 0.5);
  ctx.lineTo(x - wdt / 2, boilerTop - 0.4);
  ctx.lineTo(x - wdt / 2, top + wdt * 0.35);
  ctx.quadraticCurveTo(x - wdt / 2, top, x - wdt * 0.15, top);
  ctx.lineTo(x + wdt * 0.15, top);
  ctx.quadraticCurveTo(x + wdt / 2, top, x + wdt / 2, top + wdt * 0.35);
  ctx.lineTo(x + wdt / 2, boilerTop - 0.4);
  ctx.lineTo(x + wdt / 2 + 0.4, boilerTop + 0.5);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = lighten(col, 0.28);
  ctx.fillRect(x - wdt / 2, top, wdt * 0.4, hgt);
  ctx.fillStyle = darken(col, 0.25);
  ctx.fillRect(x + wdt * 0.2, top, wdt * 0.4, hgt);
  ctx.restore();
  ctx.strokeStyle = darken(col, 0.6);
  ctx.lineWidth = p.ow;
  ctx.stroke();
  // Base ring.
  line(
    p,
    x - wdt / 2 - 0.4,
    boilerTop + 0.1,
    x + wdt / 2 + 0.4,
    boilerTop + 0.1,
    darken(col, 0.4),
    0.4,
  );
}

function drawBoiler(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv, boilerTop: bt, boilerBottom: bb, B } = lay;
  const front = 0;
  const rear = lay.cabFront + 0.5;
  const len = front - rear;
  const smokeLen = Math.max(len * 0.18, lay.american ? 7.4 : 5.2);
  const sx = front - smokeLen;
  // Barrel.
  shadedBox(p, rear, bt, sx - rear + 0.6, B, 0.9, lv.body, { hi: 0.3, lo: 0.26 });
  // Boiler bands + lining.
  ctx.lineWidth = 0.32;
  const bands = lv.era === 0 ? lv.brass : darken(lv.body, 0.45);
  const nb = 4;
  for (let i = 1; i <= nb; i++) {
    const x = sx - ((sx - rear) * i) / (nb + 1);
    ctx.strokeStyle = bands;
    ctx.beginPath();
    ctx.moveTo(x, bt + 0.2);
    ctx.lineTo(x, bb - 0.2);
    ctx.stroke();
  }
  ctx.strokeStyle = lv.lining;
  ctx.lineWidth = 0.28;
  ctx.beginPath();
  ctx.moveTo(rear + 0.5, bt + B * 0.66);
  ctx.lineTo(sx, bt + B * 0.66);
  ctx.stroke();
  // Smokebox.
  shadedBox(p, sx, bt + 0.05, smokeLen, B - 0.1, 0.6, lv.smokebox, { hi: 0.3, lo: 0.28 });
  if (lv.smokeboxFront !== lv.smokebox) {
    // Late steam: silver-grey smokebox front.
    rrectPath(ctx, front - 1.6, bt + 0.05, 1.6, B - 0.1, 0.4);
    ctx.fillStyle = lv.smokeboxFront;
    ctx.fill();
    ctx.strokeStyle = darken(lv.smokeboxFront, 0.5);
    ctx.lineWidth = p.ow;
    ctx.stroke();
  }
  // Door ring on the front face.
  shadedBox(p, front - 0.5, bt + 0.9, 0.9, B - 1.8, 0.3, darken(lv.smokebox, 0.25), {
    hi: 0.4,
    lo: 0,
  });
  // Smokebox / boiler joint ring.
  line(p, sx, bt + 0.1, sx, bb - 0.1, lv.era === 0 ? lv.brass : "#555b63", 0.4);
}

function drawAmericanKit(p: Pen, lay: SteamLayout, chimneyX: number): void {
  const { ctx } = p;
  const { lv, boilerTop: bt } = lay;
  // Big box headlamp on the smokebox top, bracket, glass front.
  const lx = -4.4;
  const lw = 3.6;
  const lh = 3.8;
  const ly = bt - lh + 0.2;
  shadedBox(p, lx, bt - 0.4, lw - 0.2, 0.6, 0.2, "#25272b", { hi: 0, lo: 0 });
  polyPath(ctx, [
    [lx - 0.2, ly + 0.8],
    [lx + lw * 0.5, ly - 0.7],
    [lx + lw + 0.2, ly + 0.8],
  ]);
  ctx.fillStyle = "#1c1d20";
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = p.ow;
  ctx.stroke();
  shadedBox(p, lx, ly + 0.8, lw, lh - 1.0, 0.25, lv.era === 0 ? lv.brass : "#30343a", {
    hi: 0.3,
    lo: 0.2,
  });
  ctx.fillStyle = "#F7E7A6";
  ctx.fillRect(lx + lw - 1.2, ly + 1.4, 0.9, lh - 2.2);
  // Bell on a yoke between stack and domes.
  const bx = chimneyX - 5.6;
  line(p, bx - 1.1, bt + 0.2, bx - 1.1, bt - 1.6, "#2b2c30", 0.5);
  line(p, bx + 1.1, bt + 0.2, bx + 1.1, bt - 1.6, "#2b2c30", 0.5);
  line(p, bx - 1.1, bt - 1.5, bx + 1.1, bt - 1.5, "#2b2c30", 0.5);
  ctx.beginPath();
  ctx.moveTo(bx - 1.0, bt - 0.4);
  ctx.quadraticCurveTo(bx - 0.9, bt - 2.6, bx, bt - 2.7);
  ctx.quadraticCurveTo(bx + 0.9, bt - 2.6, bx + 1.0, bt - 0.4);
  ctx.closePath();
  ctx.fillStyle = lv.brass;
  ctx.fill();
  ctx.strokeStyle = darken(lv.brass, 0.5);
  ctx.lineWidth = p.ow;
  ctx.stroke();
}

function drawPilot(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { rb, lv } = lay;
  const beamTop = rb + 2.4;
  if (lay.american) {
    // Cowcatcher: slanted bars from the buffer beam down to just above the rail.
    const front = lay.pilotLen;
    polyPath(ctx, [
      [-0.8, beamTop],
      [front, RAIL_Y - 1.2],
      [front, RAIL_Y - 0.6],
      [-0.8, RAIL_Y - 0.6],
    ]);
    ctx.fillStyle = "#1c1d20";
    ctx.fill();
    ctx.strokeStyle = lighten(lv.frame, 0.5);
    ctx.lineWidth = 0.32;
    const bars = 6;
    for (let i = 0; i <= bars; i++) {
      const t = i / bars;
      const x0 = -0.5 + t * (front + 0.5);
      const yTop = beamTop + (RAIL_Y - 1.2 - beamTop) * t;
      ctx.beginPath();
      ctx.moveTo(x0, yTop + 0.3);
      ctx.lineTo(x0, RAIL_Y - 0.7);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-0.8, beamTop);
    ctx.lineTo(front, RAIL_Y - 1.2);
    ctx.strokeStyle = lighten(lv.frame, 0.55);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    shadedBox(p, -1.4, beamTop - 0.2, 1.6, 1.2, 0.3, lv.frame, { hi: 0.3, lo: 0 });
  } else {
    // Buffer beam, two buffers and a step.
    shadedBox(p, -1.0, beamTop - 0.3, 1.4, 2.2, 0.3, lv.frame, { hi: 0.3, lo: 0.1 });
    disc(p, 0.8, beamTop + 0.5, 0.55, "#c8ccd2", "#333");
    shadedBox(p, -0.9, beamTop + 2.0, 1.2, 0.5, 0.15, lv.frame, { hi: 0, lo: 0 });
  }
}

function drawMotion(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { hubY, D } = lay;
  const r = D * 0.17;
  const theta = Math.PI * 1.12;
  const pinOf = (cx: number): [number, number] => [
    cx + Math.cos(theta) * r,
    hubY + Math.sin(theta) * r,
  ];
  lay.drivers.forEach((xs, gi) => {
    const cyl = lay.cylinders[gi] as SteamLayout["cylinders"][number];
    // Cylinder block, steam chest and brass head.
    shadedBox(p, cyl.back, hubY - 2.0, 4.4, 3.4, 0.7, lay.lv.frame, { hi: 0.35, lo: 0.25 });
    shadedBox(p, cyl.back + 0.6, hubY - 2.7, 3.2, 1.0, 0.4, darken(lay.lv.body, 0.05), {
      hi: 0.3,
      lo: 0.2,
    });
    shadedBox(p, cyl.front - 0.2, hubY - 1.2, 0.9, 2.0, 0.3, lay.lv.brass, { hi: 0.3, lo: 0.2 });
    // Piston rod, guide bars and crosshead.
    line(p, cyl.crosshead, hubY - 0.15, cyl.back, hubY - 0.15, STEEL, 0.5);
    line(p, cyl.crosshead - 0.4, hubY - 1.0, cyl.back + 0.2, hubY - 1.0, STEEL_DARK, 0.35);
    line(p, cyl.crosshead - 0.4, hubY + 0.75, cyl.back + 0.2, hubY + 0.75, STEEL_DARK, 0.35);
    shadedBox(p, cyl.crosshead - 0.5, hubY - 0.95, 1.4, 1.75, 0.2, "#8E949C", { hi: 0.3, lo: 0.2 });
    // Main (connecting) rod: crosshead → crank pin of the main driver.
    const main = xs[Math.min(cyl.main, xs.length - 1)] as number;
    const [px, py] = pinOf(main);
    line(p, cyl.crosshead + 0.2, hubY - 0.1, px, py, STEEL_DARK, 1.15);
    line(p, cyl.crosshead + 0.2, hubY - 0.1, px, py, STEEL, 0.7);
    // Walschaerts-style valve gear: radius rod from the expansion link to the valve stem, and a
    // combination lever dropping to the crosshead.
    const linkX = main + D * 0.22;
    const linkY = hubY - D * 0.34;
    line(p, linkX, linkY, cyl.back + 2.2, hubY - 2.4, STEEL_DARK, 0.45);
    line(p, cyl.crosshead + 0.2, hubY - 0.9, cyl.crosshead + 0.5, hubY - 2.2, STEEL_DARK, 0.4);
    line(p, cyl.crosshead + 0.5, hubY - 2.2, linkX, linkY, STEEL_DARK, 0.3);
    disc(p, linkX, linkY, 0.65, "#8E949C", "#333");
    // Coupling rod across the group.
    const [ax, ay] = pinOf(xs[0] as number);
    const [bx, by] = pinOf(xs[xs.length - 1] as number);
    if (xs.length > 1) {
      line(p, ax, ay, bx, by, STEEL_DARK, 1.15);
      line(p, ax, ay, bx, by, STEEL, 0.7);
    }
    for (const cx of xs) {
      const [qx, qy] = pinOf(cx);
      disc(p, qx, qy, 0.5, "#D5D9DE", "#333");
    }
  });
  void ctx;
}

function drawDrivers(p: Pen, lay: SteamLayout): void {
  const { lv, D, hubY } = lay;
  const theta = Math.PI * 1.12;
  // Splashers (wheel guards) above each driver.
  for (const xs of lay.drivers) {
    for (const cx of xs) {
      p.ctx.beginPath();
      p.ctx.arc(cx, hubY, D / 2 + 0.75, Math.PI * 1.02, Math.PI * 1.98);
      p.ctx.strokeStyle = lv.frame;
      p.ctx.lineWidth = 0.7;
      p.ctx.stroke();
    }
  }
  for (const xs of lay.drivers) {
    for (const cx of xs) {
      drawWheel(p, cx, hubY, D / 2, {
        wheel: lv.wheel,
        tyre: lv.era === 0 ? lv.tyre : lv.tyre,
        spokes: 12,
        hub: "#C5C9CF",
        counterweight: theta,
      });
    }
  }
}

/** Paints a steam engine + tender into `p` (already scaled); returns nothing — see `steamLayout`. */
export function drawSteamLoco(p: Pen, def: LocomotiveDef, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv, rb, hubY } = lay;
  drawTender(p, lay);
  drawCab(p, lay);
  // Frame bar and lead/trail trucks.
  const frameRear =
    (lay.trailAxles.at(-1) ?? (lay.drivers.at(-1)!.at(-1) as number) - lay.D / 2) - 2.4;
  const frameFront = -0.4;
  shadedBox(
    p,
    frameRear,
    rb + 1.5,
    frameFront - frameRear,
    hubY + 1.0 - (rb + 1.5),
    0.3,
    lv.frame,
    { hi: 0.3, lo: 0 },
  );
  for (const x of lay.trailAxles) smallWheel(p, lay, x, 2);
  for (const x of lay.leadAxles) smallWheel(p, lay, x, 2);
  if (lay.leadAxles.length > 1) {
    shadedBox(
      p,
      (lay.leadAxles.at(-1) as number) - 2.4,
      18.4,
      (lay.leadAxles[0] as number) - (lay.leadAxles.at(-1) as number) + 4.8,
      1.2,
      0.4,
      lv.frame,
      { hi: 0.2, lo: 0 },
    );
  }
  // Running board with a lining stripe.
  const rbFront = lay.american ? 1.0 : 0.2;
  shadedBox(p, lay.cabFront - 0.5, rb, rbFront - (lay.cabFront - 0.5), 0.9, 0.2, lv.frame, {
    hi: 0.4,
    lo: 0,
  });
  line(
    p,
    lay.cabFront - 0.4,
    rb + 0.15,
    rbFront - 0.2,
    rb + 0.15,
    lv.era === 0 ? lv.brass : lv.lining,
    0.22,
  );
  drawBoiler(p, lay);
  const smokeLen = Math.max((0 - (lay.cabFront + 0.5)) * 0.18, lay.american ? 7.4 : 5.2);
  const chimneyX = lay.american ? -(smokeLen * 0.72) : -smokeLen * 0.52;
  const domeSteam = lay.cabFront + (lay.w.groups[0]! >= 6 ? 8 : 6.2) + (lay.american ? 1.5 : 0);
  const domeSand = (domeSteam + chimneyX) / 2 + (lay.american ? 0.5 : 0.8);
  if (lv.era === 2) {
    // Late steam: one low merged dome pair under a shroud.
    drawDome(p, lay, domeSand, 3.6, 1.5);
    drawDome(p, lay, domeSteam, 3.6, 1.7);
    // Pipes along the boiler top.
    line(
      p,
      domeSand + 1.7,
      lay.boilerTop - 0.1,
      domeSteam - 1.7,
      lay.boilerTop - 0.1,
      darken(lv.body, 0.4),
      0.4,
    );
  } else {
    drawDome(p, lay, domeSand, lv.era === 0 ? 2.6 : 2.9, lv.era === 0 ? 3.0 : 2.6);
    drawDome(p, lay, domeSteam, lv.era === 0 ? 3.2 : 3.4, lv.era === 0 ? 3.4 : 2.9);
  }
  drawStack(p, lay, chimneyX);
  if (lay.american) drawAmericanKit(p, lay, chimneyX);
  else {
    // Small round headlamp on the smokebox front + a sand-pipe/steps hint.
    disc(p, -0.4, lay.boilerTop + lay.B * 0.5, 1.3, "#F7E7A6", "#222");
    shadedBox(p, -1.0, lay.boilerBottom - 0.2, 1.5, 0.7, 0.2, lv.frame, { hi: 0.3, lo: 0 });
  }
  // Cylinders, motion, drivers, pilot.
  drawDrivers(p, lay);
  drawMotion(p, lay);
  drawPilot(p, lay);
  void ctx;
  void def;
  void shadedPoly;
}
