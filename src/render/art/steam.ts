/** Parametric steam-locomotive side view (STYLE §9.2). Local x: smokebox front at 0, everything
 * else at negative x; the caller shifts by `-layout.minX`. Units: u = height / 24, rail top y = 23. */

import type { LocomotiveDef } from "../../data/trains";
import { darken, hash01, lighten, type Pen } from "./draw";
import { INK, box, hair, ink, pin, poly, rivets, rod, wheel, engrave } from "./engrave";
import { drawEarlySteam, earlyChimneyTop, isBespoke } from "./steamEarly";
import { steamLivery, type SteamLivery } from "./livery";
import { parseWhyte, type Whyte } from "./whyte";

const STEEL = "#9A9E9F";
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

/** Top of the chimney in art units, relative to the locomotive canvas (for smoke emitters). */
export function chimneyTop(def: LocomotiveDef): { x: number; y: number } {
  const lay = steamLayout(def);
  if (isBespoke(def)) return earlyChimneyTop(def, lay);
  const smokeLen = Math.max((0 - (lay.cabFront + 0.5)) * 0.18, lay.american ? 7.4 : 5.2);
  const chimneyX = lay.american ? -(smokeLen * 0.72) : -smokeLen * 0.52;
  const h = lay.lv.era === 0 ? 6 : lay.lv.era === 1 ? 5 : 2.5;
  return { x: chimneyX - lay.minX, y: lay.boilerTop - h };
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

/** Barrel top is a little higher at the firebox than at the smokebox (a tapered boiler). */
const TAPER = 0.6;

function smokeLength(lay: SteamLayout): number {
  const rear = lay.cabFront + 0.5;
  return Math.max((0 - rear) * 0.18, lay.american ? 7.4 : 5.2);
}

function topAt(lay: SteamLayout, x: number): number {
  const rear = lay.cabFront + 0.5;
  const t = Math.max(0, Math.min(1, (x - rear) / (0 - rear)));
  return lay.boilerTop + TAPER * t;
}

function smallWheel(p: Pen, _lay: SteamLayout, cx: number, r = 2): void {
  wheel(p, cx, RAIL_Y - r, r, { spokes: 8 });
}

function drawTender(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv, tenderFront: f, tenderRear: r, rb } = lay;
  const len = f - r;
  const top = rb + (lv.era === 2 ? -1.2 : 0.6);
  const bottom = 18.2;
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
      box(p, c - ((per - 1) * step) / 2 - 2.6, 18.6, (per - 1) * step + 5.2, 1.4, lv.frame, {
        hatch: 0,
      });
    }
  }
  if (lay.tenderKind === "single") box(p, r + 1, 18.4, len - 2, 1.3, lv.frame, { hatch: 0 });
  axles.forEach((x) => smallWheel(p, lay, x, 2));
  // Coal heap, drawn first so the body overlaps its base.
  ctx.beginPath();
  ctx.moveTo(r + 1.2, top + 0.2);
  const pts = 11;
  for (let i = 0; i <= pts; i++) {
    const t = i / pts;
    ctx.lineTo(
      r + 1.2 + t * (len - 4.6),
      top - 0.3 - Math.sin(t * Math.PI) * 1.9 - hash01(i + 3) * 0.5,
    );
  }
  ctx.lineTo(f - 3.4, top + 0.2);
  ctx.closePath();
  ctx.fillStyle = lv.coal;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = hair(p);
  ctx.stroke();
  ctx.fillStyle = "#5A5D63";
  for (let i = 0; i < 16; i++) {
    const t = hash01(i * 3.1);
    const xx = r + 2.2 + t * (len - 7);
    const peak = Math.sin(((xx - (r + 1.2)) / (len - 4.6)) * Math.PI) * 1.6;
    ctx.fillRect(xx, top - 0.5 - hash01(i + 9) * peak, 0.3, 0.2);
  }
  box(p, r, top, len, bottom - top, lv.tender);
  ctx.strokeStyle = lv.tenderLining;
  ctx.lineWidth = hair(p, 0.8);
  ctx.strokeRect(r + 1.2, top + 1.3, len - 2.4, bottom - top - 2.5);
  rivets(p, r + 0.8, f - 0.6, top + 0.5, lighten(lv.tender, 0.35));
  box(p, r + 0.8, top - 0.5, 2.4, 0.6, darken(lv.tender, 0.25), { hatch: 0 });
  box(p, r - 0.6, bottom - 1.6, 0.9, 1.6, lv.frame, { hatch: 0 });
  ink(p, f, lay.rb + 2.4, f + 1.7, lay.rb + 2.4, 1.6);
}

function drawCab(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv, cabFront: f, cabRear: r, rb, boilerTop } = lay;
  const roofY = boilerTop - 1.4;
  const floor = rb + 1.6;
  box(p, r + 0.4, roofY, f - r - 0.4, floor - roofY, lv.cab, { hatch: lv.woodCab ? 0.45 : 0.55 });
  if (lv.woodCab) {
    ctx.strokeStyle = darken(lv.cab, 0.45);
    ctx.lineWidth = hair(p, 0.5);
    ctx.beginPath();
    for (let x = r + 1.4; x < f - 0.4; x += 1.0) {
      ctx.moveTo(x, roofY + 0.7);
      ctx.lineTo(x, floor - 0.4);
    }
    ctx.stroke();
  }
  const wy = roofY + 1.5;
  const wh = 2.7;
  const ww = 2.4;
  const windows = lay.D >= 8 && f - r > 8.6 ? 2 : 1;
  for (let i = 0; i < windows; i++) {
    const wx = r + 1.6 + i * (ww + 1.1);
    box(p, wx, wy, ww, wh, lv.glass, { hatch: 0, ink: 1.2 });
    ink(p, wx + 0.2, wy + 0.3, wx + ww * 0.55, wy + 0.3, 0.6, "#7B8590");
    ctx.strokeStyle = lighten(lv.cab, 0.18);
    ctx.lineWidth = hair(p, 0.7);
    ctx.strokeRect(wx - 0.25, wy - 0.25, ww + 0.5, wh + 0.5);
  }
  // Overhanging roof, gently curved.
  ctx.beginPath();
  ctx.moveTo(r - 0.9, roofY + 0.5);
  ctx.quadraticCurveTo((r + f) / 2, roofY - 1.4, f + 0.9, roofY + 0.5);
  ctx.lineTo(f + 0.9, roofY + 0.95);
  ctx.lineTo(r - 0.9, roofY + 0.95);
  ctx.closePath();
  ctx.fillStyle = lv.cabRoof;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = hair(p);
  ctx.stroke();
  box(p, r + 0.2, floor - 0.2, f - r + 0.2, 1.1, lv.frame, { hatch: 0 });
}

function drawStack(p: Pen, lay: SteamLayout, x: number): void {
  const { ctx } = p;
  const { lv } = lay;
  const bt = topAt(lay, x);
  const base = bt + 0.6;
  const dark = lv.era === 0 ? "#222123" : "#1A1B1D";
  let pts: Array<[number, number]>;
  let capY: number;
  if (lv.era === 0) {
    // Balloon / diamond stack: flared base, narrow neck, wide funnel top.
    const top = bt - 5.6;
    capY = top;
    pts = [
      [x - 1.5, base],
      [x - 0.8, bt - 0.9],
      [x - 0.8, bt - 2.0],
      [x - 2.4, bt - 3.6],
      [x - 2.5, top],
      [x + 2.5, top],
      [x + 2.4, bt - 3.6],
      [x + 0.8, bt - 2.0],
      [x + 0.8, bt - 0.9],
      [x + 1.5, base],
    ];
  } else if (lv.era === 1 && lay.w.groups[0]! <= 8) {
    const top = bt - 4.4;
    capY = top;
    pts = [
      [x - 1.6, base],
      [x - 0.95, bt - 0.8],
      [x - 0.95, top + 0.5],
      [x - 1.5, top],
      [x + 1.5, top],
      [x + 0.95, top + 0.5],
      [x + 0.95, bt - 0.8],
      [x + 1.6, base],
    ];
  } else {
    const top = bt - 2.2;
    capY = top;
    pts = [
      [x - 1.8, base],
      [x - 1.2, bt - 0.4],
      [x - 1.2, top + 0.5],
      [x - 1.7, top],
      [x + 1.7, top],
      [x + 1.2, top + 0.5],
      [x + 1.2, bt - 0.4],
      [x + 1.8, base],
    ];
  }
  poly(p, pts, dark);
  ink(p, x - 2.2, capY + 0.9, x + 2.2, capY + 0.9, 0.7, "#5B5C60");
  if (lv.era === 0) ink(p, x - 2.5, capY, x + 2.5, capY, 1.4, lv.brass);
  void ctx;
}

function drawDome(p: Pen, lay: SteamLayout, x: number, wdt: number, hgt: number): void {
  const { ctx } = p;
  const { lv } = lay;
  const bt = topAt(lay, x);
  const col = lv.brassDomes ? lv.brass : lv.body;
  const top = bt - hgt;
  const outline = (): void => {
    ctx.beginPath();
    ctx.moveTo(x - wdt / 2 - 0.4, bt + 0.6);
    ctx.lineTo(x - wdt / 2, bt - 0.3);
    ctx.lineTo(x - wdt / 2, top + wdt * 0.35);
    ctx.quadraticCurveTo(x - wdt / 2, top, x - wdt * 0.15, top);
    ctx.lineTo(x + wdt * 0.15, top);
    ctx.quadraticCurveTo(x + wdt / 2, top, x + wdt / 2, top + wdt * 0.35);
    ctx.lineTo(x + wdt / 2, bt - 0.3);
    ctx.lineTo(x + wdt / 2 + 0.4, bt + 0.6);
  };
  engrave(
    p,
    col,
    [x - wdt / 2, top, wdt, hgt + 0.6],
    () => {
      outline();
      ctx.closePath();
    },
    { noInk: true, hatch: 0.4 },
  );
  outline();
  ctx.strokeStyle = INK;
  ctx.lineWidth = hair(p);
  ctx.stroke();
  ink(p, x - wdt / 2 - 0.3, bt - 0.1, x + wdt / 2 + 0.3, bt - 0.1, 0.8, darken(col, 0.45));
}

function drawBoiler(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv, boilerTop: bt, boilerBottom: bb, B } = lay;
  const rear = lay.cabFront + 0.5;
  const sl = smokeLength(lay);
  const sx = -sl;
  // Tapered barrel.
  poly(
    p,
    [
      [rear, bt],
      [sx + 0.2, bt + TAPER],
      [sx + 0.2, bb],
      [rear, bb],
    ],
    lv.body,
  );
  // Bands (brass hairlines on the early engines) and a lining stripe.
  const nb = 4;
  for (let i = 1; i <= nb; i++) {
    const x = sx - ((sx - rear) * i) / (nb + 1);
    const t = topAt(lay, x);
    ink(p, x, t + 0.1, x, bb - 0.1, 0.8, lv.era === 0 ? lv.brass : darken(lv.body, 0.5));
    ink(p, x + 0.35, t + 0.1, x + 0.35, bb - 0.1, 0.45, lighten(lv.body, 0.25));
  }
  ink(p, rear + 0.4, bt + B * 0.68, sx, bt + B * 0.68, 0.8, lv.lining);
  // Handrail on posts.
  const hy = bt + B * 0.3;
  ink(p, rear + 1.5, hy, sx - 0.5, hy, 0.7, lv.era === 0 ? lv.brass : "#B8B3A0");
  for (let x = rear + 2; x < sx - 0.5; x += 5.5) ink(p, x, hy, x, hy + 0.9, 0.6, "#B8B3A0");
  // Smokebox.
  box(p, sx, bt + TAPER, sl, bb - bt - TAPER, lv.smokebox);
  if (lv.smokeboxFront !== lv.smokebox) {
    box(p, -1.6, bt + TAPER, 1.6, bb - bt - TAPER, lv.smokeboxFront, { hatch: 0.5 });
  }
  ink(p, -0.8, bt + TAPER + 0.4, -0.8, bb - 0.4, 0.8, "#6A6C70");
  ink(p, sx, bt + TAPER, sx, bb, 1.1, lv.era === 0 ? lv.brass : "#6A6C70");
  void ctx;
}

function drawAmericanKit(p: Pen, lay: SteamLayout, chimneyX: number): void {
  const { ctx } = p;
  const { lv } = lay;
  const bt = topAt(lay, -4);
  // Box headlamp with a conical roof, on a bracket.
  const lx = -4.4;
  const lw = 3.2;
  const lh = 3.6;
  const ly = bt + TAPER - lh;
  box(p, lx + 0.4, bt + TAPER - 0.4, lw - 0.8, 0.6, "#25272B", { hatch: 0 });
  box(p, lx, ly + 0.9, lw, lh - 1.1, "#2C2B28", { hatch: 0.45 });
  poly(
    p,
    [
      [lx - 0.2, ly + 0.9],
      [lx + lw * 0.5, ly - 0.2],
      [lx + lw + 0.2, ly + 0.9],
    ],
    "#1E1D1B",
    { hatch: 0 },
  );
  ctx.fillStyle = "#E4D9AE";
  ctx.fillRect(lx + lw - 1.1, ly + 1.6, 0.8, lh - 2.3);
  ink(p, lx, ly + 0.9, lx + lw, ly + 0.9, 0.9, lv.brass);
  // Bell on a yoke between stack and domes.
  const bx = chimneyX - 5.6;
  const by = topAt(lay, bx);
  ink(p, bx - 1.0, by + 0.3, bx - 1.0, by - 1.6, 1.2);
  ink(p, bx + 1.0, by + 0.3, bx + 1.0, by - 1.6, 1.2);
  ink(p, bx - 1.0, by - 1.5, bx + 1.0, by - 1.5, 1.2);
  ctx.beginPath();
  ctx.moveTo(bx - 1.0, by - 0.3);
  ctx.quadraticCurveTo(bx - 0.9, by - 2.5, bx, by - 2.6);
  ctx.quadraticCurveTo(bx + 0.9, by - 2.5, bx + 1.0, by - 0.3);
  ctx.closePath();
  ctx.fillStyle = lv.brass;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = hair(p);
  ctx.stroke();
}

function drawPilot(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { rb, lv } = lay;
  const beamTop = rb + 2.4;
  if (lay.american) {
    // Cowcatcher: slanted bars from the buffer beam down to just above the rail.
    const front = lay.pilotLen;
    poly(
      p,
      [
        [-0.8, beamTop],
        [front, RAIL_Y - 1.2],
        [front, RAIL_Y - 0.6],
        [-0.8, RAIL_Y - 0.6],
      ],
      "#232220",
      { hatch: 0 },
    );
    ctx.strokeStyle = "#8E897C";
    ctx.lineWidth = hair(p, 0.7);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x0 = -0.5 + t * (front + 0.5);
      ctx.moveTo(x0, beamTop + (RAIL_Y - 1.2 - beamTop) * t + 0.3);
      ctx.lineTo(x0, RAIL_Y - 0.7);
    }
    ctx.stroke();
    box(p, -1.4, beamTop - 0.2, 1.6, 1.2, lv.frame, { hatch: 0 });
  } else {
    box(p, -1.0, beamTop - 0.3, 1.4, 2.2, lv.frame, { hatch: 0 });
    pin(p, 0.8, beamTop + 0.5, 0.55);
    box(p, -0.9, beamTop + 2.0, 1.2, 0.5, lv.frame, { hatch: 0 });
  }
}

function drawMotion(p: Pen, lay: SteamLayout): void {
  const { hubY, D, lv } = lay;
  const r = D * 0.17;
  const theta = Math.PI * 1.12;
  const pinOf = (cx: number): [number, number] => [
    cx + Math.cos(theta) * r,
    hubY + Math.sin(theta) * r,
  ];
  lay.drivers.forEach((xs, gi) => {
    const cyl = lay.cylinders[gi] as SteamLayout["cylinders"][number];
    box(p, cyl.back, hubY - 2.0, 4.4, 3.4, lv.frame, { hatch: 0.45 });
    box(p, cyl.back + 0.6, hubY - 2.7, 3.2, 0.9, darken(lv.body, 0.1), { hatch: 0.4 });
    box(p, cyl.front - 0.2, hubY - 1.2, 0.8, 2.0, lv.era === 0 ? lv.brass : "#6F7276", {
      hatch: 0,
    });
    // Piston rod, guide bars, crosshead.
    ink(p, cyl.crosshead, hubY - 0.15, cyl.back, hubY - 0.15, 1.3, "#9A9E9F");
    ink(p, cyl.crosshead - 0.4, hubY - 1.0, cyl.back + 0.2, hubY - 1.0, 1.0);
    ink(p, cyl.crosshead - 0.4, hubY + 0.75, cyl.back + 0.2, hubY + 0.75, 1.0);
    box(p, cyl.crosshead - 0.5, hubY - 0.95, 1.3, 1.7, "#7C8084", { hatch: 0 });
    const main = xs[Math.min(cyl.main, xs.length - 1)] as number;
    const [px, py] = pinOf(main);
    rod(p, cyl.crosshead + 0.2, hubY - 0.1, px, py, 0.55);
    // Valve gear: radius rod, combination lever, expansion link.
    const linkX = main + D * 0.22;
    const linkY = hubY - D * 0.34;
    rod(p, linkX, linkY, cyl.back + 2.2, hubY - 2.4, 0.22);
    rod(p, cyl.crosshead + 0.2, hubY - 0.9, cyl.crosshead + 0.5, hubY - 2.2, 0.2);
    rod(p, cyl.crosshead + 0.5, hubY - 2.2, linkX, linkY, 0.16);
    pin(p, linkX, linkY, 0.6);
    const [ax, ay] = pinOf(xs[0] as number);
    const [bx, by] = pinOf(xs[xs.length - 1] as number);
    if (xs.length > 1) rod(p, ax, ay, bx, by, 0.55);
    for (const cx of xs) {
      const [qx, qy] = pinOf(cx);
      pin(p, qx, qy, 0.5);
    }
  });
}

function drawDrivers(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv, D, hubY } = lay;
  const theta = Math.PI * 1.12;
  for (const xs of lay.drivers) {
    for (const cx of xs) {
      ctx.beginPath();
      ctx.arc(cx, hubY, D / 2 + 0.75, Math.PI * 1.02, Math.PI * 1.98);
      ctx.strokeStyle = lv.frame;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, hubY, D / 2 + 1.1, Math.PI * 1.02, Math.PI * 1.98);
      ctx.strokeStyle = INK;
      ctx.lineWidth = hair(p, 0.8);
      ctx.stroke();
    }
  }
  for (const xs of lay.drivers) {
    for (const cx of xs) wheel(p, cx, hubY, D / 2, { counterweight: theta, spokes: 14 });
  }
}

/** Paints a steam engine + tender into `p` (already scaled); see `steamLayout`. */
export function drawSteamLoco(p: Pen, def: LocomotiveDef, lay: SteamLayout): void {
  if (isBespoke(def)) {
    drawEarlySteam(p, def, lay);
    return;
  }
  const { lv, rb, hubY } = lay;
  drawTender(p, lay);
  drawCab(p, lay);
  const frameRear =
    (lay.trailAxles.at(-1) ?? (lay.drivers.at(-1)!.at(-1) as number) - lay.D / 2) - 2.4;
  const frameFront = -0.4;
  box(p, frameRear, rb + 1.5, frameFront - frameRear, hubY + 1.0 - (rb + 1.5), lv.frame, {
    hatch: 0,
  });
  for (const x of lay.trailAxles) smallWheel(p, lay, x, 2);
  for (const x of lay.leadAxles) smallWheel(p, lay, x, 2);
  if (lay.leadAxles.length > 1) {
    box(
      p,
      (lay.leadAxles.at(-1) as number) - 2.4,
      18.4,
      (lay.leadAxles[0] as number) - (lay.leadAxles.at(-1) as number) + 4.8,
      1.1,
      lv.frame,
      { hatch: 0 },
    );
  }
  // Running board with a lining stripe.
  const rbFront = lay.american ? 1.0 : 0.2;
  box(p, lay.cabFront - 0.5, rb, rbFront - (lay.cabFront - 0.5), 0.9, lv.frame, { hatch: 0 });
  ink(
    p,
    lay.cabFront - 0.4,
    rb + 0.45,
    rbFront - 0.2,
    rb + 0.45,
    0.6,
    lv.era === 0 ? lv.brass : lv.lining,
  );
  drawBoiler(p, lay);
  const smokeLen = smokeLength(lay);
  const chimneyX = lay.american ? -(smokeLen * 0.72) : -smokeLen * 0.52;
  const domeSteam = lay.cabFront + (lay.w.groups[0]! >= 6 ? 8 : 6.2) + (lay.american ? 1.5 : 0);
  const domeSand = (domeSteam + chimneyX) / 2 + (lay.american ? 0.5 : 0.8);
  if (lv.era === 2) {
    drawDome(p, lay, domeSand, 3.6, 1.5);
    drawDome(p, lay, domeSteam, 3.6, 1.7);
    const t = topAt(lay, domeSteam);
    ink(p, domeSand + 1.7, t - 0.1, domeSteam - 1.7, t - 0.1, 1.2, "#5B5C60");
  } else {
    drawDome(p, lay, domeSand, lv.era === 0 ? 2.4 : 2.9, lv.era === 0 ? 2.8 : 2.6);
    drawDome(p, lay, domeSteam, lv.era === 0 ? 3.0 : 3.4, lv.era === 0 ? 3.2 : 2.9);
  }
  drawStack(p, lay, chimneyX);
  if (lay.american) drawAmericanKit(p, lay, chimneyX);
  else {
    // Small box lamp on the smokebox front.
    box(p, -2.2, lay.boilerTop + TAPER - 1.9, 1.7, 1.9, "#2C2B28", { hatch: 0 });
    box(p, -1.0, lay.boilerBottom - 0.2, 1.5, 0.7, lv.frame, { hatch: 0 });
  }
  drawDrivers(p, lay);
  drawMotion(p, lay);
  drawPilot(p, lay);
  void def;
  void STEEL;
}
