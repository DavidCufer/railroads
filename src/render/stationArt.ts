/**
 * Top-down station art (STYLE §10, PLAN 21.1). Everything is drawn in a local frame — origin at the
 * station tile centre, +x along the track, +y across it — scaled so 1 unit = one tile, so the same
 * picture serves single track, diagonals and passing loops. Light comes from the upper left: each
 * roof is two-tone (the half facing the light is lit), with a soft shadow to the lower right, exactly
 * like the Phase 19 train sprites. The building stands on the -y side of the track; anything on
 * the opposite side (engine shed, water tower, sidings) is laid out on +y.
 */
import type { StationImprovementType, StationType } from "../data/stations";
import { shadeColor } from "./color";

export type StationMarkerType = StationImprovementType | "engineShed" | "waterTower";

/** Platform length in tiles, centred on the station tile (clipped by `StationArtOptions.reach`). */
export const PLATFORM_LENGTH: Record<StationType, number> = { depot: 2, station: 3, terminal: 4 };

export interface StationArtOptions {
  type: StationType;
  /** On-screen size of one tile. */
  u: number;
  /** Track direction in screen space (folded so it never points left). */
  angle: number;
  /** Track-centre → platform edge distance, in tiles. */
  near: number;
  /** Passing loop (two lanes): platforms only on the outer side, building beyond. */
  loop: boolean;
  /** How far the straight track continues from the station tile centre, in tiles, toward -x/+x. */
  reach: readonly [number, number];
  improvements: readonly StationMarkerType[];
}

// --- palette --------------------------------------------------------------------------------
const SHADOW = "rgba(24, 18, 10, 0.30)";
const PLATFORM = "#D9D0B9";
const PLATFORM_KERB = "#F3EEDF";
const PLATFORM_OUTER = "#A99E85";
const STATION_BW = 1.7;
const STATION_BH = 0.46;
const SAFETY = "#E2C557";
const PAVING = "#BDB399";
const WOOD_WALL = "#8B6440";
const WOOD_ROOF = "#B9573B";
const BRICK_WALL = "#9C4F3B";
const BRICK_ROOF = "#B0563F";
const SLATE = "#5F6A78";
const CANOPY_ROOF = "#8794A2";
const SHED_ROOF = "#7E8B9A";
const GLASS = "#B8D6E8";

/** Everything needed to draw in the rotated local frame. */
interface G {
  ctx: CanvasRenderingContext2D;
  u: number;
  /** The -y half of a ridge-along-x roof faces the light. */
  litNegY: boolean;
  /** The -x half of a ridge-along-y roof faces the light. */
  litNegX: boolean;
  /** Shadow offset in the local frame (tiles). */
  sx: number;
  sy: number;
  /** ≥ 1 px per 0.02 tile: fine detail (ridges, shingles, lamps) is worth drawing. */
  detail: boolean;
  /** Extra-fine detail (texture lines, posts) at big zoom. */
  fine: boolean;
  px: number; // one screen pixel in tile units
}

function light(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgb(${Math.round(r + (255 - r) * k)}, ${Math.round(g + (255 - g) * k)}, ${Math.round(b + (255 - b) * k)})`;
}

function shadowRect(g: G, x: number, y: number, w: number, h: number, k = 1): void {
  g.ctx.fillStyle = SHADOW;
  g.ctx.fillRect(x + g.sx * k, y + g.sy * k, w, h);
}

/** A pitched roof over walls: shadow, wall rim, two roof halves, ridge highlight, eave outline. */
function roofBlock(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  roof: string,
  wall: string,
  ridgeAlongX = true,
  height = 1,
): void {
  const { ctx, px } = g;
  shadowRect(g, x, y, w, h, height);
  const rim = Math.max(px * 1.2, 0.012);
  ctx.fillStyle = shadeColor(wall, 0.78);
  ctx.fillRect(x - rim, y - rim, w + rim * 2, h + rim * 2);
  const lit = light(roof, 0.22);
  const shade = shadeColor(roof, 0.74);
  if (ridgeAlongX) {
    ctx.fillStyle = g.litNegY ? lit : shade;
    ctx.fillRect(x, y, w, h / 2);
    ctx.fillStyle = g.litNegY ? shade : lit;
    ctx.fillRect(x, y + h / 2, w, h / 2);
  } else {
    ctx.fillStyle = g.litNegX ? lit : shade;
    ctx.fillRect(x, y, w / 2, h);
    ctx.fillStyle = g.litNegX ? shade : lit;
    ctx.fillRect(x + w / 2, y, w / 2, h);
  }
  if (g.fine) {
    // Shingle / tile courses.
    ctx.strokeStyle = "rgba(0, 0, 0, 0.13)";
    ctx.lineWidth = px * 0.8;
    ctx.beginPath();
    const step = 0.05;
    if (ridgeAlongX) {
      for (let yy = y + step; yy < y + h - 0.01; yy += step) {
        if (Math.abs(yy - (y + h / 2)) < 0.02) continue;
        ctx.moveTo(x, yy);
        ctx.lineTo(x + w, yy);
      }
    } else {
      for (let xx = x + step; xx < x + w - 0.01; xx += step) {
        if (Math.abs(xx - (x + w / 2)) < 0.02) continue;
        ctx.moveTo(xx, y);
        ctx.lineTo(xx, y + h);
      }
    }
    ctx.stroke();
  }
  if (g.detail) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = px * 1.2;
    ctx.beginPath();
    if (ridgeAlongX) {
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
    } else {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(20, 12, 6, 0.5)";
    ctx.lineWidth = px;
    ctx.strokeRect(x, y, w, h);
  }
}

/** A flat-roofed block with a lit top edge (cold store, sheds with parapets). */
function flatBlock(g: G, x: number, y: number, w: number, h: number, top: string): void {
  const { ctx, px } = g;
  shadowRect(g, x, y, w, h);
  ctx.fillStyle = shadeColor(top, 0.78);
  ctx.fillRect(x - px, y - px, w + px * 2, h + px * 2);
  ctx.fillStyle = top;
  ctx.fillRect(x, y, w, h);
  if (g.detail) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillRect(x, y, w, px * 1.4);
    ctx.fillRect(x, y, px * 1.4, h);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(x, y + h - px * 1.4, w, px * 1.4);
  }
}

function chimney(g: G, x: number, y: number, s = 0.06): void {
  const { ctx } = g;
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + g.sx * 1.6, y + g.sy * 1.6, s, s);
  ctx.fillStyle = "#4A3830";
  ctx.fillRect(x, y, s, s);
  if (g.detail) {
    ctx.fillStyle = "#1E1814";
    ctx.fillRect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56);
  }
}

function dot(g: G, x: number, y: number, r: number, color: string): void {
  g.ctx.fillStyle = color;
  g.ctx.beginPath();
  g.ctx.arc(x, y, r, 0, Math.PI * 2);
  g.ctx.fill();
}

// --- platforms ------------------------------------------------------------------------------

/** Platform strip on one side of the track between x0..x1. `yIn` = distance from the track centre
 * to the near (track-side) edge; the strip is `thick` deep. */
function platform(
  g: G,
  x0: number,
  x1: number,
  yIn: number,
  thick: number,
  side: -1 | 1,
  lamps: boolean,
): void {
  const { ctx, px } = g;
  const y = side < 0 ? -(yIn + thick) : yIn;
  const w = x1 - x0;
  shadowRect(g, x0, y, w, thick, 0.5);
  ctx.fillStyle = PLATFORM;
  ctx.fillRect(x0, y, w, thick);
  const kerb = Math.max(px * 1.6, 0.022);
  const kerbY = side < 0 ? y + thick - kerb : y;
  ctx.fillStyle = PLATFORM_KERB;
  ctx.fillRect(x0, kerbY, w, kerb);
  if (g.detail) {
    ctx.fillStyle = SAFETY;
    const sf = Math.max(px, 0.012);
    ctx.fillRect(x0, side < 0 ? kerbY - sf - px * 0.5 : kerbY + kerb + px * 0.5, w, sf);
    ctx.fillStyle = PLATFORM_OUTER;
    ctx.fillRect(x0, side < 0 ? y : y + thick - px * 1.2, w, px * 1.2);
    // end ramps
    ctx.fillStyle = shadeColor(PLATFORM, 0.9);
    ctx.fillRect(x0, y, px * 1.2, thick);
    ctx.fillRect(x1 - px * 1.2, y, px * 1.2, thick);
  }
  if (g.fine) {
    ctx.strokeStyle = "rgba(90, 80, 60, 0.18)";
    ctx.lineWidth = px * 0.8;
    ctx.beginPath();
    for (let xx = x0 + 0.25; xx < x1 - 0.1; xx += 0.25) {
      ctx.moveTo(xx, y + px);
      ctx.lineTo(xx, y + thick - px);
    }
    ctx.stroke();
  }
  if (lamps && g.detail) {
    const ly = y + thick * (side < 0 ? 0.72 : 0.28);
    for (let xx = x0 + 0.3; xx < x1 - 0.15; xx += 0.62) {
      dot(g, xx + g.sx, ly + g.sy, 0.022, SHADOW);
      dot(g, xx, ly, 0.02, "#33383F");
      dot(g, xx, ly, 0.011, "#F4DE9A");
    }
  }
}

function bench(g: G, x: number, y: number): void {
  if (!g.fine) return;
  g.ctx.fillStyle = "#6E4A2B";
  g.ctx.fillRect(x, y, 0.13, 0.038);
  g.ctx.fillStyle = "#8F6540";
  g.ctx.fillRect(x, y, 0.13, 0.015);
}

/** Platform canopy: slate roof with a lit ridge and support posts along the track-side edge. */
function canopy(g: G, x0: number, x1: number, yIn: number, thick: number, side: -1 | 1): void {
  const { ctx, px } = g;
  const w = x1 - x0;
  const depth = thick * 0.5;
  const y = side < 0 ? -(yIn + thick * 0.14 + depth) : yIn + thick * 0.14;
  if (g.detail) {
    // posts
    ctx.fillStyle = "#2B3038";
    const py = side < 0 ? y + depth : y;
    for (let xx = x0 + 0.12; xx <= x1 - 0.1; xx += 0.42) dot(g, xx, py, 0.02, "#2B3038");
  }
  roofBlock(g, x0, y, w, depth, CANOPY_ROOF, "#3A424D", true, 1.3);
  if (g.detail) {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    // valance line along the track edge
    ctx.fillRect(x0, side < 0 ? y + depth - px * 1.5 : y, w, px * 1.5);
  }
}

// --- buildings ------------------------------------------------------------------------------

/** Depot: a small wooden hut with a red gabled roof and a low platform. */
function drawDepot(g: G, o: StationArtOptions, x0: number, x1: number): void {
  const { ctx } = g;
  const pt = 0.16;
  platform(g, x0, x1, o.near, pt, -1, true);
  if (!o.loop) {
    // low platform on the opposite side too, shorter
    platform(g, x0 + 0.3, x1 - 0.3, o.near, pt * 0.8, 1, false);
  }
  const yIn = o.near + pt + 0.05;
  // Hut
  const w = 0.7;
  const h = 0.36;
  const y = -(yIn + h);
  roofBlock(g, -w / 2, y, w, h, WOOD_ROOF, WOOD_WALL, true, 1.1);
  if (g.detail) {
    // eave overhang board + gable-end window/door hint on the platform side
    ctx.fillStyle = "#3B2A1D";
    ctx.fillRect(-0.07, y + h - 0.02, 0.14, 0.04);
    ctx.fillStyle = "#F3E7C4";
    ctx.fillRect(-w / 2 + 0.05, y + h - 0.02, 0.1, 0.03);
    ctx.fillRect(w / 2 - 0.15, y + h - 0.02, 0.1, 0.03);
  }
  chimney(g, w / 2 - 0.22, y + 0.06, 0.06);
  // Name board and a stack of crates on the platform.
  if (g.detail) {
    ctx.fillStyle = "#F0E6CC";
    ctx.fillRect(0.5, -(o.near + pt * 0.8) - 0.02, 0.22, 0.07);
    ctx.fillStyle = "#1F3A5F";
    ctx.fillRect(0.52, -(o.near + pt * 0.8), 0.18, 0.03);
    ctx.fillStyle = "#8A6A44";
    ctx.fillRect(-0.72, -(o.near + pt * 0.9), 0.1, 0.08);
    ctx.fillRect(-0.6, -(o.near + pt * 0.8), 0.08, 0.06);
  }
}

/** Station: brick building with a slate roof and cross-gable, canopied platforms. */
function drawStation(g: G, o: StationArtOptions, x0: number, x1: number): { bw: number } {
  const { ctx } = g;
  const pt = 0.24;
  const cx0 = x0 + 0.2;
  const cx1 = x1 - 0.2;
  // Platform on the far side first (it is behind the track visually, no overlap anyway).
  if (!o.loop) {
    platform(g, x0, x1, o.near, pt, 1, true);
    canopy(g, cx0 + 0.3, cx1 - 0.3, o.near, pt, 1);
    bench(g, 0.5, o.near + pt * 0.7);
  }
  platform(g, x0, x1, o.near, pt, -1, true);
  const bw = STATION_BW;
  const bh = STATION_BH;
  const yIn = o.near + pt + 0.07;
  // paved forecourt
  ctx.fillStyle = PAVING;
  ctx.fillRect(-bw / 2 - 0.12, -(yIn + bh + 0.1), bw + 0.24, bh + 0.1 + 0.07);
  canopy(g, cx0, cx1, o.near, pt, -1);
  const y = -(yIn + bh);
  // Main body, end pavilions (gable across), central cross-gable toward the track.
  roofBlock(g, -bw / 2 + 0.3, y, bw - 0.6, bh, BRICK_ROOF, BRICK_WALL, true, 1.2);
  for (const sgn of [-1, 1]) {
    const px0 = sgn < 0 ? -bw / 2 : bw / 2 - 0.32;
    roofBlock(g, px0, y - 0.03, 0.32, bh + 0.06, SLATE, BRICK_WALL, false, 1.4);
  }
  roofBlock(g, -0.19, y - 0.07, 0.38, bh + 0.11, "#C0654A", BRICK_WALL, false, 1.4);
  if (g.detail) {
    // door / window strip along the platform-side wall and clock on the gable
    ctx.fillStyle = "#F3E7C4";
    for (const xx of [-0.5, -0.36, 0.36, 0.5]) ctx.fillRect(xx - 0.03, y + bh + 0.005, 0.06, 0.03);
    ctx.fillStyle = "#3A2A20";
    ctx.fillRect(-0.05, y + bh + 0.005, 0.1, 0.035);
    dot(g, 0, y - 0.015, 0.03, "#F0E6CC");
    dot(g, 0, y - 0.015, 0.02, "#2A2622");
  }
  chimney(g, -bw / 2 + 0.42, y + 0.07);
  chimney(g, bw / 2 - 0.5, y + 0.07);
  return { bw };
}

/** Terminal: a barrel-vaulted train shed over the tracks with ribs and a glazed centre strip, and a
 * grand head building with a clock tower and pavilions. */
function drawTerminal(g: G, o: StationArtOptions, x0: number, x1: number): { bw: number } {
  const { ctx, px } = g;
  const half = Math.max(o.loop ? o.near + 0.08 : 0.44, 0.44);
  const sx0 = x0 + 0.08;
  const sx1 = x1 - 0.08;
  const len = sx1 - sx0;
  // Platforms visible at the sides inside the shed are hidden by the roof, but their ends show.
  platform(g, x0, x1, o.near, half - o.near + 0.02, 1, false);
  platform(g, x0, x1, o.near, half - o.near + 0.02, -1, false);
  // Shadow + roof
  shadowRect(g, sx0, -half, len, half * 2, 1.5);
  const grad = ctx.createLinearGradient(0, -half, 0, half);
  const a = g.litNegY
    ? [light(SHED_ROOF, 0.28), SHED_ROOF, shadeColor(SHED_ROOF, 0.66)]
    : [shadeColor(SHED_ROOF, 0.66), SHED_ROOF, light(SHED_ROOF, 0.28)];
  grad.addColorStop(0, a[0] as string);
  grad.addColorStop(0.5, a[1] as string);
  grad.addColorStop(1, a[2] as string);
  ctx.fillStyle = grad;
  ctx.fillRect(sx0, -half, len, half * 2);
  // Glazed centre strip.
  const gh = half * 0.3;
  ctx.fillStyle = GLASS;
  ctx.fillRect(sx0 + 0.06, -gh, len - 0.12, gh * 2);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(sx0 + 0.06, -gh, len - 0.12, gh * 0.7);
  ctx.fillStyle = "rgba(60, 100, 140, 0.35)";
  ctx.fillRect(sx0 + 0.06, gh * 0.55, len - 0.12, gh * 0.45);
  // Ribs (arches) and glazing bars.
  if (g.detail) {
    ctx.strokeStyle = "rgba(25, 32, 42, 0.55)";
    ctx.lineWidth = px * 1.4;
    ctx.beginPath();
    const ribs = Math.round(len / 0.26);
    for (let i = 0; i <= ribs; i++) {
      const xx = sx0 + (len * i) / ribs;
      ctx.moveTo(xx, -half);
      ctx.lineTo(xx, half);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let i = 0; i < ribs; i++) {
      const xx = sx0 + (len * (i + 0.5)) / ribs + px * 1.6;
      ctx.moveTo(xx, -half);
      ctx.lineTo(xx, -gh);
      ctx.moveTo(xx, gh);
      ctx.lineTo(xx, half);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(30, 40, 50, 0.5)";
    ctx.lineWidth = px * 1.2;
    ctx.beginPath();
    ctx.moveTo(sx0 + 0.06, -gh);
    ctx.lineTo(sx1 - 0.06, -gh);
    ctx.moveTo(sx0 + 0.06, gh);
    ctx.lineTo(sx1 - 0.06, gh);
    ctx.moveTo(sx0 + 0.06, 0);
    ctx.lineTo(sx1 - 0.06, 0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(15, 20, 28, 0.7)";
    ctx.lineWidth = px * 1.4;
    ctx.strokeRect(sx0, -half, len, half * 2);
    // Gable end walls (dark arch faces with a lit lip).
    ctx.fillStyle = "#2B333D";
    ctx.fillRect(sx0 - 0.03, -half, 0.05, half * 2);
    ctx.fillRect(sx1 - 0.02, -half, 0.05, half * 2);
    ctx.fillStyle = "#EDE4CC";
    ctx.fillRect(sx0 - 0.03, -half, px * 1.4, half * 2);
  }
  // Head building on the -y side with pavilions and a clock tower.
  const bw = Math.min(len + 0.3, 2.9);
  const bh = 0.5;
  const yIn = half + 0.08;
  const y = -(yIn + bh);
  ctx.fillStyle = PAVING;
  ctx.fillRect(-bw / 2 - 0.14, y - 0.1, bw + 0.28, bh + 0.1 + 0.08);
  roofBlock(g, -bw / 2 + 0.4, y, bw - 0.8, bh, SLATE, BRICK_WALL, true, 1.3);
  for (const sgn of [-1, 1]) {
    const bx = sgn < 0 ? -bw / 2 : bw / 2 - 0.42;
    roofBlock(g, bx, y - 0.05, 0.42, bh + 0.1, BRICK_ROOF, BRICK_WALL, false, 1.5);
  }
  // Clock tower (pyramid roof seen from above: four shaded triangles).
  const ts = 0.3;
  const tcx = 0;
  const tcy = y + bh / 2 - 0.02;
  shadowRect(g, tcx - ts / 2, tcy - ts / 2, ts, ts, 2.2);
  ctx.fillStyle = shadeColor(BRICK_WALL, 0.8);
  ctx.fillRect(tcx - ts / 2 - px, tcy - ts / 2 - px, ts + px * 2, ts + px * 2);
  const corners: Array<[number, number]> = [
    [tcx - ts / 2, tcy - ts / 2],
    [tcx + ts / 2, tcy - ts / 2],
    [tcx + ts / 2, tcy + ts / 2],
    [tcx - ts / 2, tcy + ts / 2],
  ];
  // Faces: top(-y), right(+x), bottom(+y), left(-x). Light comes from the screen's upper left, so
  // the local faces facing it are: -y when litNegY, -x when litNegX.
  const faceLit = [g.litNegY, !g.litNegX, !g.litNegY, g.litNegX];
  for (let i = 0; i < 4; i++) {
    const c0 = corners[i] as [number, number];
    const c1 = corners[(i + 1) % 4] as [number, number];
    ctx.fillStyle = faceLit[i] ? light("#4E7A72", 0.25) : shadeColor("#4E7A72", 0.7);
    ctx.beginPath();
    ctx.moveTo(c0[0], c0[1]);
    ctx.lineTo(c1[0], c1[1]);
    ctx.lineTo(tcx, tcy);
    ctx.closePath();
    ctx.fill();
  }
  if (g.detail) {
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = px;
    ctx.beginPath();
    for (const c of corners) {
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(tcx, tcy);
    }
    ctx.stroke();
    dot(g, tcx, tcy, 0.02, "#D9C46A");
    // clock faces on the platform-side (+y) wall
    dot(g, tcx, tcy + ts / 2 + 0.015, 0.03, "#F0E6CC");
  }
  for (const xx of g.detail ? [-0.5, -0.3, 0.3, 0.5] : []) {
    ctx.fillStyle = "#F3E7C4";
    ctx.fillRect(xx - 0.035, y + bh + 0.005, 0.07, 0.03);
  }
  chimney(g, -bw / 2 + 0.55, y + 0.07);
  chimney(g, bw / 2 - 0.62, y + 0.07);
  return { bw };
}

// --- improvements (local frame) --------------------------------------------------------------

interface Slot {
  type: StationMarkerType;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

const SIZES: Record<StationMarkerType, readonly [number, number]> = {
  warehouse: [1.0, 0.5],
  hotel: [0.5, 0.5],
  postOffice: [0.42, 0.32],
  coldStorage: [0.66, 0.44],
  engineShed: [1.3, 0.5],
  waterTower: [0.36, 0.36],
  freightYard: [1.3, 0.5],
  livestockPens: [0.9, 0.52],
};

/** Lays improvements out tidily: building-side ones sit beside/behind the main building in rows
 * parallel to the track; track-side ones (shed, tower, sidings) go on the far side. */
export function layoutImprovements(
  o: Pick<StationArtOptions, "type" | "near" | "improvements" | "loop">,
): Slot[] {
  const pt = o.type === "depot" ? 0.16 : o.type === "station" ? 0.24 : 0.5;
  const bw = o.type === "depot" ? 0.7 : o.type === "station" ? STATION_BW : 2.9;
  const bh = o.type === "depot" ? 0.36 : o.type === "station" ? STATION_BH : 0.5;
  const nearSide = o.type === "terminal" ? 0.52 + bh : o.near + pt + 0.07 + bh;
  const farSide = o.type === "depot" ? o.near + 0.2 : o.near + pt + 0.12;
  const rowBack = nearSide + 0.16; // second row starts behind the first row's outer edge
  const slots: Slot[] = [];
  const has = (t: StationMarkerType) => o.improvements.includes(t);
  const put = (type: StationMarkerType, cx: number, yEdge: number, dir: -1 | 1) => {
    const [w, h] = SIZES[type];
    slots.push({ type, cx, cy: dir * (yEdge + h / 2), w, h });
  };
  const edge = bw / 2 + 0.24;
  if (has("warehouse")) put("warehouse", -(edge + 0.5), nearSide - bh, -1);
  if (has("hotel")) put("hotel", edge + 0.25, nearSide - bh, -1);
  if (has("postOffice")) put("postOffice", edge + 0.5 + 0.12 + 0.21, nearSide - bh, -1);
  if (has("coldStorage")) put("coldStorage", 0, rowBack, -1);
  if (has("engineShed")) put("engineShed", -1.3, farSide, 1);
  if (has("waterTower")) put("waterTower", 1.55, farSide, 1);
  if (has("freightYard")) put("freightYard", -0.1, farSide + 0.66, 1);
  if (has("livestockPens")) put("livestockPens", 1.35, farSide + 0.66, 1);
  return slots;
}

function drawWarehouse(g: G, s: Slot, towardTrack: -1 | 1): void {
  const { ctx } = g;
  const x = s.cx - s.w / 2;
  const y = s.cy - s.h / 2;
  // Loading dock strip on the track side.
  ctx.fillStyle = "#6B5138";
  ctx.fillRect(x - 0.02, towardTrack > 0 ? y + s.h : y - 0.08, s.w + 0.04, 0.08);
  roofBlock(g, x, y, s.w, s.h, "#A79E86", "#7A705C", true, 1.2);
  if (g.detail) {
    // Skylights and big doors.
    ctx.fillStyle = "rgba(190, 220, 235, 0.9)";
    for (const dx of [0.2, 0.5, 0.8]) ctx.fillRect(x + s.w * dx - 0.06, s.cy - 0.05, 0.12, 0.1);
    ctx.fillStyle = "#3B2F22";
    const dy = towardTrack > 0 ? y + s.h - 0.01 : y - 0.01;
    for (const dx of [0.22, 0.5, 0.78]) ctx.fillRect(x + s.w * dx - 0.07, dy, 0.14, 0.03);
  }
}

function drawHotel(g: G, s: Slot): void {
  const x = s.cx - s.w / 2;
  const y = s.cy - s.h / 2;
  roofBlock(g, x, y, s.w, s.h, "#C9694B", "#8E5E48", true, 1.4);
  // Cross gable.
  roofBlock(g, s.cx - 0.09, y - 0.03, 0.18, s.h + 0.06, "#C9694B", "#8E5E48", false, 1.5);
  if (g.detail) {
    g.ctx.fillStyle = "#F6DE96";
    for (const dx of [-0.17, 0.17]) g.ctx.fillRect(s.cx + dx - 0.02, y + s.h - 0.005, 0.04, 0.03);
  }
  chimney(g, x + 0.06, y + 0.05, 0.05);
}

function drawPostOffice(g: G, s: Slot): void {
  const x = s.cx - s.w / 2;
  const y = s.cy - s.h / 2;
  roofBlock(g, x, y, s.w, s.h, "#C44A3F", "#8A5648", true, 1.1);
  if (g.detail) {
    g.ctx.fillStyle = "#F4EFE0";
    g.ctx.fillRect(s.cx - 0.05, s.cy - 0.03, 0.1, 0.06);
    dot(g, x + s.w + 0.05, y + s.h + 0.04, 0.02, "#C72A2A");
  }
  chimney(g, x + s.w - 0.11, y + 0.04, 0.045);
}

function drawColdStorage(g: G, s: Slot): void {
  const x = s.cx - s.w / 2;
  const y = s.cy - s.h / 2;
  flatBlock(g, x, y, s.w, s.h, "#DCE9F2");
  if (g.detail) {
    // Cooling fans and a stripe.
    for (const dx of [-0.17, 0.17]) {
      dot(g, s.cx + dx, s.cy, 0.07, "#8FA9BC");
      dot(g, s.cx + dx, s.cy, 0.05, "#2E5E8C");
      dot(g, s.cx + dx, s.cy, 0.012, "#DCE9F2");
    }
    g.ctx.fillStyle = "#4C8CC0";
    g.ctx.fillRect(x, y + s.h - 0.05, s.w, 0.03);
  }
}

function drawEngineShed(g: G, s: Slot, towardTrack: -1 | 1): void {
  const { ctx } = g;
  const x = s.cx - s.w / 2;
  const y = s.cy - s.h / 2;
  roofBlock(g, x, y, s.w, s.h, "#78838F", "#4E5560", true, 1.2);
  // Doors at the track-side end, smoke vents along the ridge.
  ctx.fillStyle = "#1E2226";
  for (const dx of [0.2, 0.5, 0.8]) {
    ctx.fillRect(x + s.w * dx - 0.045, s.cy - 0.03, 0.09, 0.06);
  }
  if (g.detail) {
    ctx.fillStyle = "#15181B";
    const doorY = towardTrack > 0 ? y - 0.005 : y + s.h - 0.03;
    ctx.fillRect(x + s.w * 0.5 - 0.15, doorY, 0.3, 0.035);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (const dx of [0.2, 0.5, 0.8]) ctx.fillRect(x + s.w * dx - 0.045, s.cy - 0.03, 0.09, px1(g));
  }
}

function px1(g: G): number {
  return g.px;
}

function drawWaterTower(g: G, s: Slot): void {
  const { ctx, px } = g;
  const r = 0.14;
  const x = s.cx;
  const y = s.cy;
  // Long shadow of the tower + tank.
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(x + g.sx * 4, y + g.sy * 4, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = SHADOW;
  ctx.lineWidth = r * 1.3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + g.sx * 1.2, y + g.sy * 1.2);
  ctx.lineTo(x + g.sx * 4, y + g.sy * 4);
  ctx.stroke();
  ctx.lineCap = "butt";
  // Legs.
  ctx.strokeStyle = "#3A3936";
  ctx.lineWidth = Math.max(px * 1.4, 0.02);
  ctx.beginPath();
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    ctx.moveTo(x + dx * r * 0.55, y + dy * r * 0.55);
    ctx.lineTo(x + dx * r * 1.12, y + dy * r * 1.12);
  }
  ctx.stroke();
  // Spout toward the track (+y is away from the building, the track is at -y from here).
  ctx.strokeStyle = "#2E2E2E";
  ctx.lineWidth = Math.max(px * 1.6, 0.025);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.2, y - r * 0.8);
  ctx.lineTo(x - 0.2, y - 0.3);
  ctx.stroke();
  // Tank: barrel body then conical roof, lit toward the light.
  dot(g, x, y, r, "#6A4C33");
  dot(g, x, y, r * 0.98, shadeColor("#8B6644", 0.88));
  ctx.fillStyle = light("#9B7650", 0.15);
  ctx.beginPath();
  ctx.arc(x - r * 0.08, y - r * 0.1, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  if (g.detail) {
    ctx.strokeStyle = "rgba(40, 24, 12, 0.5)";
    ctx.lineWidth = px;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    // Cone shading: lit wedge.
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r * 0.86, Math.PI * 0.85, Math.PI * 1.55);
    ctx.closePath();
    ctx.fill();
    dot(g, x, y, r * 0.09, "#33291F");
  }
}

function drawFreightYard(g: G, s: Slot): void {
  const { ctx, px } = g;
  const x0 = s.cx - s.w / 2;
  const x1 = s.cx + s.w / 2;
  for (const dy of [-0.13, 0.13]) {
    const yy = s.cy + dy;
    // Ballast bed, ties, rails.
    ctx.fillStyle = "rgba(120, 110, 96, 0.55)";
    ctx.fillRect(x0, yy - 0.075, s.w, 0.15);
    ctx.strokeStyle = "#5C4634";
    ctx.lineWidth = px * 1.4;
    ctx.beginPath();
    for (let xx = x0 + 0.04; xx < x1; xx += 0.055) {
      ctx.moveTo(xx, yy - 0.06);
      ctx.lineTo(xx, yy + 0.06);
    }
    ctx.stroke();
    ctx.strokeStyle = "#B9BEC6";
    ctx.lineWidth = px * 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, yy - 0.035);
    ctx.lineTo(x1, yy - 0.035);
    ctx.moveTo(x0, yy + 0.035);
    ctx.lineTo(x1, yy + 0.035);
    ctx.stroke();
    ctx.fillStyle = "#C24A3A";
    ctx.fillRect(x1 - 0.03, yy - 0.06, 0.03, 0.12); // buffer stop
  }
  if (g.detail) {
    // A parked wagon on the far siding.
    ctx.fillStyle = SHADOW;
    ctx.fillRect(x0 + 0.25 + g.sx, s.cy - 0.13 - 0.04 + g.sy, 0.4, 0.08);
    ctx.fillStyle = "#7B4A34";
    ctx.fillRect(x0 + 0.25, s.cy - 0.13 - 0.04, 0.4, 0.08);
    ctx.fillStyle = "#A66A4A";
    ctx.fillRect(x0 + 0.25, s.cy - 0.13 - 0.04, 0.4, 0.035);
  }
}

function drawPens(g: G, s: Slot): void {
  const { ctx, px } = g;
  const x = s.cx - s.w / 2;
  const y = s.cy - s.h / 2;
  ctx.fillStyle = "#A08760";
  ctx.fillRect(x, y, s.w, s.h);
  ctx.fillStyle = "rgba(90, 60, 30, 0.28)";
  ctx.fillRect(x + s.w / 2, y, s.w / 2, s.h);
  ctx.strokeStyle = SHADOW;
  ctx.lineWidth = Math.max(px * 1.6, 0.025);
  ctx.strokeRect(x + g.sx, y + g.sy, s.w, s.h);
  ctx.strokeStyle = "#6E4F2C";
  ctx.strokeRect(x, y, s.w, s.h);
  ctx.beginPath();
  ctx.moveTo(s.cx, y);
  ctx.lineTo(s.cx, y + s.h);
  ctx.stroke();
  if (g.detail) {
    for (const [dx, dy, c] of [
      [-0.25, -0.1, "#E9E4D6"],
      [-0.12, 0.1, "#E9E4D6"],
      [0.18, -0.08, "#6B5540"],
      [0.3, 0.1, "#E9E4D6"],
    ] as const) {
      const ax = s.cx + dx;
      const ay = s.cy + dy;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(ax, ay, 0.05, 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawImprovement(g: G, s: Slot): void {
  switch (s.type) {
    case "warehouse":
      drawWarehouse(g, s, 1);
      break;
    case "hotel":
      drawHotel(g, s);
      break;
    case "postOffice":
      drawPostOffice(g, s);
      break;
    case "coldStorage":
      drawColdStorage(g, s);
      break;
    case "engineShed":
      drawEngineShed(g, s, -1);
      break;
    case "waterTower":
      drawWaterTower(g, s);
      break;
    case "freightYard":
      drawFreightYard(g, s);
      break;
    case "livestockPens":
      drawPens(g, s);
      break;
  }
}

// --- entry points ---------------------------------------------------------------------------

/** Vertical screen extent (in tiles, below the tile centre) of the art including improvements —
 * used to drop the name plate clear of it. */
export function stationArtBottom(o: StationArtOptions): number {
  const slots = layoutImprovements(o);
  let bottom = 0.5;
  const c = Math.cos(o.angle);
  const s = Math.sin(o.angle);
  for (const slot of slots) {
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const lx = slot.cx + (dx * slot.w) / 2;
      const ly = slot.cy + (dy * slot.h) / 2;
      bottom = Math.max(bottom, lx * s + ly * c);
    }
  }
  return bottom;
}

/** Draws the station art centred at (cx, cy) with the track running along `o.angle`. */
export function drawStationArt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  o: StationArtOptions,
): void {
  const { u, angle } = o;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = 0.05;
  // Screen-space shadow (1, 1.3)·d mapped into the local (rotated) frame.
  const sx = c * d + s * d * 1.3;
  const sy = -s * d + c * d * 1.3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(u, u);
  const g: G = {
    ctx,
    u,
    litNegY: c - s >= 0,
    litNegX: c + s > 0,
    sx,
    sy,
    detail: u >= 22,
    fine: u >= 44,
    px: 1 / u,
  };
  const len = PLATFORM_LENGTH[o.type];
  // Platform extents: half the length each way, clipped to the straight track available.
  const x0 = -Math.min(len / 2, 0.5 + o.reach[0]);
  const x1 = Math.min(len / 2, 0.5 + o.reach[1]);
  if (o.type === "depot") drawDepot(g, o, x0, x1);
  else if (o.type === "station") drawStation(g, o, x0, x1);
  else drawTerminal(g, o, x0, x1);
  for (const slot of layoutImprovements(o)) drawImprovement(g, slot);
  ctx.restore();
}
