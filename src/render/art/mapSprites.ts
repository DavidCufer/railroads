/** Top-down map sprites (STYLE §7 refined by §9.5): same liveries as the side views, with extra
 * detail once the map is zoomed in (`detail`). Local space: +x = direction of travel, origin at
 * the vehicle centre; `len` × `w` is the sprite footprint in screen px. */

import type { CargoType } from "../../data/cargo";
import type { LocomotiveDef } from "../../data/trains";
import { darken, hash01, lighten, mix, rrectPath } from "./draw";
import { carLivery, powerLivery, steamLivery, type EraBucket } from "./livery";

const OUTLINE = "rgba(20, 18, 16, 0.55)";

function outline(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Pulls toy-bright livery colours toward a warm grey so the models read as painted metal. */
const mute = (c: string, t = 0.12): string => mix(c, "#7C7668", t);

/** Heading of the sprite being drawn (radians, set by the renderer): the light comes from the
 * screen's top-left, so bevels and highlights are computed against it, not against local axes. */
let heading = 0;
export function setSpriteHeading(angle: number): void {
  heading = angle;
}

/** Direction towards the light in the sprite's local space (unit vector). */
function lightLocal(): [number, number] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const k = Math.SQRT1_2;
  return [-k * c - k * s, k * s - k * c];
}

/** Soft drop shadow on the ballast; the offset is in device space so it ignores the sprite's
 * rotation (down-right). Call before filling the body, `shadowOff` after. */
function shadowOn(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.shadowColor = "rgba(15, 14, 10, 0.42)";
  ctx.shadowBlur = Math.max(1.5, size * 0.06);
  ctx.shadowOffsetX = Math.max(0.7, size * 0.035);
  ctx.shadowOffsetY = Math.max(1, size * 0.05);
}
function shadowOff(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Square-ended body outline with small bevelled corners. */
function chamfer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  l: number,
  w: number,
  c: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + l - c, y);
  ctx.lineTo(x + l, y + c);
  ctx.lineTo(x + l, y + w - c);
  ctx.lineTo(x + l - c, y + w);
  ctx.lineTo(x + c, y + w);
  ctx.lineTo(x, y + w - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

/** Lit edges towards the light, darker edges away from it (instead of an outline). */
function bevel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  l: number,
  w: number,
  c: number,
): void {
  const [lx, ly] = lightLocal();
  const t = Math.max(0.7, w * 0.07);
  const edges: Array<[number, number, number, number, number, number]> = [
    [0, -1, x + c, y + t / 2, x + l - c, y + t / 2],
    [0, 1, x + c, y + w - t / 2, x + l - c, y + w - t / 2],
    [-1, 0, x + t / 2, y + c, x + t / 2, y + w - c],
    [1, 0, x + l - t / 2, y + c, x + l - t / 2, y + w - c],
  ];
  ctx.lineWidth = t;
  ctx.lineCap = "butt";
  for (const [nx, ny, x0, y0, x1, y1] of edges) {
    const s = nx * lx + ny * ly;
    ctx.strokeStyle = s > 0 ? `rgba(255,255,255,${0.5 * s})` : `rgba(0,0,0,${-0.55 * s})`;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

type Stops = ReadonlyArray<readonly [number, string]>;

/** Body hull: bevelled silhouette, fill shaded across the width, drop shadow, lit/dark edges. */
function hull(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  l: number,
  w: number,
  c: number,
  stops: Stops,
  size: number,
  shadow = true,
): void {
  const g = ctx.createLinearGradient(0, y, 0, y + w);
  for (const [t, col] of stops) g.addColorStop(t, col);
  chamfer(ctx, x, y, l, w, c);
  if (shadow) shadowOn(ctx, size);
  ctx.fillStyle = g;
  ctx.fill();
  shadowOff(ctx);
  bevel(ctx, x, y, l, w, c);
}

/** Roof stops: a light band down the centre, darker eaves. */
const roofStops = (c: string): Stops => [
  [0, darken(c, 0.26)],
  [0.28, c],
  [0.5, lighten(c, 0.26)],
  [0.72, c],
  [1, darken(c, 0.28)],
];

/** A cylinder seen from above: dark sides, a highlight line off-centre towards the light. */
const cylStops = (c: string): Stops => [
  [0, darken(c, 0.5)],
  [0.22, darken(c, 0.1)],
  [0.36, lighten(c, 0.38)],
  [0.52, c],
  [0.8, darken(c, 0.36)],
  [1, darken(c, 0.6)],
];

/** Buffers and a coupling at each end: small dark nubs just outside the body. */
function nubs(ctx: CanvasRenderingContext2D, len: number, w: number): void {
  const t = Math.max(1, w * 0.12);
  ctx.fillStyle = "#23211e";
  for (const e of [-1, 1]) {
    const x0 = e > 0 ? len / 2 : -len / 2 - t;
    for (const s of [-1, 1]) ctx.fillRect(x0, s * w * 0.3 - t * 0.6, t, t * 1.2);
    ctx.fillRect(e > 0 ? len / 2 : -len / 2 - t * 1.5, -t * 0.22, t * 1.5, t * 0.44);
  }
}

/** A lit mound of loose load (coal, ore) filling x0..x1, highlight towards the light. */
function mound(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  w: number,
  color: string,
  detail: boolean,
): void {
  const cx = (x0 + x1) / 2;
  const rx = (x1 - x0) / 2;
  const ry = w * 0.38;
  const [lx, ly] = lightLocal();
  const g = ctx.createRadialGradient(
    cx + lx * rx * 0.35,
    ly * ry * 0.4,
    ry * 0.1,
    cx,
    0,
    Math.max(rx, ry) * 1.05,
  );
  g.addColorStop(0, lighten(color, 0.55));
  g.addColorStop(0.45, lighten(color, 0.14));
  g.addColorStop(1, darken(color, 0.45));
  ctx.beginPath();
  ctx.ellipse(cx, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  if (detail) {
    for (let i = 0; i < 12; i++) {
      const px = cx + (hash01(i * 7 + 3) - 0.5) * rx * 1.5;
      const py = (hash01(i * 13 + 1) - 0.5) * ry * 1.3;
      dot(ctx, px, py, Math.max(0.6, w * 0.04), lighten(color, 0.4));
    }
  }
}

/** Position (local x, px) of a steam locomotive's chimney relative to its centre. */
export function chimneyOffset(len: number): number {
  return len * 0.3;
}

const FAN_MODELS = new Set([
  "high-horsepower-diesel",
  "heavy-diesel",
  "road-switcher-diesel",
  "cab-unit-diesel",
]);
const PANTO_MODELS = new Set([
  "early-electric",
  "e-unit-electric",
  "modern-electric",
  "heavy-freight-electric",
  "high-speed-trainset",
]);

export function drawLocoSprite(
  ctx: CanvasRenderingContext2D,
  len: number,
  w: number,
  size: number,
  def: LocomotiveDef,
  detail: boolean,
): void {
  const [lx, ly] = lightLocal();
  if (def.type === "steam") {
    const lv = steamLivery(def);
    const front = len / 2;
    const rear = -len / 2;
    const tenderLen = len * 0.24;
    const cabLen = len * 0.2;
    const cabX = rear + tenderLen + len * 0.01;
    const boilerRear = cabX + cabLen;
    const boilerFront = front - len * 0.07;
    const bodyC = mute(lv.body, 0.1);
    const flat = (c: string): Stops => [
      [0, darken(c, 0.25)],
      [0.5, lighten(c, 0.08)],
      [1, darken(c, 0.3)],
    ];
    // Frames and footplate: a dark strip the full length, carrying the drop shadow.
    hull(
      ctx,
      rear,
      -w * 0.47,
      len,
      w * 0.94,
      w * 0.05,
      [
        [0, "#2b2a27"],
        [1, "#1e1d1b"],
      ],
      size,
    );
    // Tender: bevelled box, a dark coal space with a lit mound.
    const tc = mute(lv.tender);
    hull(ctx, rear + len * 0.005, -w * 0.46, tenderLen, w * 0.92, w * 0.07, flat(tc), size, false);
    ctx.fillStyle = "#121315";
    ctx.fillRect(rear + w * 0.14, -w * 0.31, tenderLen - w * 0.26, w * 0.62);
    mound(ctx, rear + w * 0.16, rear + tenderLen - w * 0.14, w * 0.8, "#4a4e55", detail);
    // Cab body, then a separate roof that overhangs it on every side.
    hull(ctx, cabX, -w * 0.47, cabLen, w * 0.94, w * 0.05, flat(mute(lv.cab)), size, false);
    if (detail) {
      ctx.fillStyle = lv.glass;
      for (const sd of [-1, 1])
        ctx.fillRect(cabX + cabLen * 0.22, sd * w * 0.46 - w * 0.03, cabLen * 0.56, w * 0.06);
    }
    hull(
      ctx,
      cabX - w * 0.05,
      -w * 0.52,
      cabLen + w * 0.1,
      w * 1.04,
      w * 0.06,
      roofStops(mute(lv.cabRoof)),
      size * 0.8,
    );
    // Boiler: a cylinder with a highlight line along its length and darker flanks.
    hull(
      ctx,
      boilerRear,
      -w * 0.38,
      boilerFront - boilerRear,
      w * 0.76,
      w * 0.05,
      cylStops(bodyC),
      size,
      false,
    );
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = Math.max(0.7, w * 0.04);
    ctx.beginPath();
    ctx.moveTo(boilerRear + w * 0.08, -w * 0.38 + w * 0.76 * 0.36);
    ctx.lineTo(boilerFront - w * 0.06, -w * 0.38 + w * 0.76 * 0.36);
    ctx.stroke();
    ctx.strokeStyle = lv.era === 0 ? mute(lv.brass) : darken(bodyC, 0.5);
    ctx.lineWidth = Math.max(0.7, w * 0.06);
    const bands = detail ? 4 : 2;
    for (let i = 1; i <= bands; i++) {
      const bx = boilerRear + ((boilerFront - boilerRear) * i) / (bands + 1);
      ctx.beginPath();
      ctx.moveTo(bx, -w * 0.37);
      ctx.lineTo(bx, w * 0.37);
      ctx.stroke();
    }
    // Smokebox: a darker drum at the front, with a lit door disc.
    const sx = boilerFront - len * 0.015;
    hull(
      ctx,
      sx,
      -w * 0.4,
      front - sx,
      w * 0.8,
      w * 0.06,
      cylStops(mute(lv.smokebox, 0.05)),
      size,
      false,
    );
    if (detail) dot(ctx, front - w * 0.05, 0, w * 0.1, lighten(lv.smokeboxFront, 0.22));
    // Chimney: dark circle with a light rim; then the domes.
    const chimneyX = chimneyOffset(len);
    const chimneyR = w * 0.15;
    dot(ctx, chimneyX, 0, chimneyR, "#0f1013");
    ctx.strokeStyle = lv.era === 0 ? mute(lv.brass) : "rgba(220,224,228,0.7)";
    ctx.lineWidth = Math.max(0.8, w * 0.06);
    ctx.beginPath();
    ctx.arc(chimneyX, 0, chimneyR, 0, Math.PI * 2);
    ctx.stroke();
    const domeX = chimneyX - len * 0.17;
    const domeC = lv.brassDomes ? mute(lv.brass) : lighten(bodyC, 0.1);
    dot(ctx, domeX, 0, w * 0.13, darken(domeC, 0.4));
    dot(ctx, domeX + lx * w * 0.02, ly * w * 0.02, w * 0.105, domeC);
    dot(ctx, domeX + lx * w * 0.05, ly * w * 0.05, w * 0.04, lighten(domeC, 0.55));
    if (detail) {
      dot(ctx, domeX - len * 0.12, 0, w * 0.085, domeC);
      ctx.strokeStyle = "#8e9094"; // running-board rods
      ctx.lineWidth = Math.max(0.6, w * 0.04);
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(boilerRear + len * 0.05, sd * w * 0.44);
        ctx.lineTo(front - len * 0.12, sd * w * 0.44);
        ctx.stroke();
      }
      dot(ctx, front - w * 0.02, -w * 0.28, w * 0.06, "#F2E6B8"); // lamps
      dot(ctx, front - w * 0.02, w * 0.28, w * 0.06, "#F2E6B8");
    }
    nubs(ctx, len, w);
    return;
  }
  const lv = powerLivery(def.id);
  const bodyC = mute(lv.body, 0.08);
  // Hood: bevelled body, a highlight ridge along the roof, a lighter cab block at the front.
  hull(ctx, -len / 2, -w / 2, len, w, w * 0.12, roofStops(bodyC), size);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(0.7, w * 0.05);
  ctx.beginPath();
  ctx.moveTo(-len * 0.44, -w * 0.04);
  ctx.lineTo(len * 0.2, -w * 0.04);
  ctx.stroke();
  const cabX = len * 0.22;
  hull(
    ctx,
    cabX,
    -w * 0.46,
    len * 0.26,
    w * 0.92,
    w * 0.08,
    roofStops(lighten(bodyC, 0.05)),
    size,
    false,
  );
  // Thin cab window strips at both ends.
  ctx.fillStyle = lv.glass;
  ctx.fillRect(len / 2 - len * 0.05, -w * 0.34, len * 0.035, w * 0.68);
  ctx.fillRect(-len / 2 + len * 0.015, -w * 0.34, len * 0.03, w * 0.68);
  ctx.fillStyle = mute(lv.accent, 0.1); // nose tip
  ctx.fillRect(len / 2 - len * 0.015, -w * 0.4, len * 0.015, w * 0.8);
  // Roof equipment: rows of small grilled fans (or plain vents on the other models).
  const fans = FAN_MODELS.has(def.id);
  const fanR = w * 0.12;
  for (const fx of [-0.34, -0.19, -0.04, 0.11]) {
    for (const sd of [-1, 1]) {
      const px = len * fx;
      const py = sd * w * 0.22;
      if (fans) {
        dot(ctx, px, py, fanR, "#17191d");
        if (detail) {
          ctx.strokeStyle = "rgba(190,196,204,0.55)";
          ctx.lineWidth = Math.max(0.5, w * 0.025);
          for (const k of [-0.5, 0, 0.5]) {
            ctx.beginPath();
            ctx.moveTo(px - fanR * 0.85, py + k * fanR);
            ctx.lineTo(px + fanR * 0.85, py + k * fanR);
            ctx.stroke();
          }
        }
      } else {
        ctx.fillStyle = darken(bodyC, 0.4);
        ctx.fillRect(px - fanR * 0.8, py - fanR * 0.5, fanR * 1.6, fanR);
      }
    }
  }
  if (detail) {
    ctx.strokeStyle = lv.handrail; // handrails along the eaves
    ctx.lineWidth = Math.max(0.5, w * 0.03);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-len * 0.46, s * w * 0.44);
      ctx.lineTo(len * 0.46, s * w * 0.44);
      ctx.stroke();
    }
  }
  nubs(ctx, len, w);
  if (PANTO_MODELS.has(def.id)) {
    ctx.strokeStyle = "#20242a";
    ctx.lineWidth = Math.max(1, w * 0.09);
    ctx.beginPath();
    if (def.id === "early-electric" || def.id === "e-unit-electric") {
      ctx.moveTo(-w * 0.22, -w * 0.5);
      ctx.lineTo(-w * 0.06, -w * 1.05);
      ctx.lineTo(w * 0.06, -w * 1.05);
      ctx.lineTo(w * 0.22, -w * 0.5);
    } else {
      ctx.moveTo(-w * 0.1, -w * 0.5);
      ctx.lineTo(w * 0.2, -w * 1.0);
      ctx.lineTo(-w * 0.1, -w * 1.0);
    }
    ctx.stroke();
  }
}

type CarShape =
  "passenger" | "mail" | "hopper" | "tanker" | "flatcar" | "boxcar" | "livestock" | "secure";

const SHAPE: Record<CargoType, CarShape> = {
  passengers: "passenger",
  mail: "mail",
  coal: "hopper",
  ironOre: "hopper",
  wood: "flatcar",
  grain: "hopper",
  livestock: "livestock",
  oil: "tanker",
  steel: "flatcar",
  lumber: "flatcar",
  food: "boxcar",
  goods: "boxcar",
  fuel: "tanker",
  silverOre: "hopper",
  silverBars: "secure",
  uraniumOre: "hopper",
  enrichedUranium: "secure",
};

export function drawCarSprite(
  ctx: CanvasRenderingContext2D,
  len: number,
  w: number,
  size: number,
  cargo: CargoType,
  era: EraBucket,
  loaded: boolean,
  detail: boolean,
): void {
  const lv = carLivery(cargo, era);
  const shape = SHAPE[cargo];
  const loadColor = lv.load === "#000" ? lv.body : lv.load;
  const body = (r: number): void => {
    rrectPath(ctx, -len / 2, -w / 2, len, w, r);
    ctx.fillStyle = lv.body;
    ctx.fill();
    outline(ctx, size);
  };
  switch (shape) {
    case "tanker": {
      rrectPath(ctx, -len / 2, -w / 2, len, w, w * 0.5);
      ctx.fillStyle = lv.body;
      ctx.fill();
      outline(ctx, size);
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.fillRect(-len * 0.4, -w * 0.12, len * 0.8, w * 0.18);
      if (detail) dot(ctx, 0, 0, w * 0.14, darken(lv.body, 0.35));
      break;
    }
    case "hopper": {
      const bodyC = mute(lv.body);
      hull(ctx, -len / 2, -w / 2, len, w, w * 0.1, roofStops(bodyC), size);
      if (cargo === "grain" && era === "modern") {
        // Covered hopper: roof hatches, no open top.
        for (const hx of [-0.28, 0, 0.28]) {
          dot(ctx, len * hx, 0, w * 0.17, darken(lv.roof, 0.35));
          dot(ctx, len * hx - w * 0.02, -w * 0.02, w * 0.12, lighten(lv.roof, 0.12));
        }
      } else if (cargo === "grain") {
        ctx.fillStyle = lv.roof;
        ctx.fillRect(-len * 0.4, -w * 0.06, len * 0.8, w * 0.12); // boxcar roof ridge
      } else {
        // Open top: a raised rim round a dark well, the load heaped lighter in the middle.
        const inset = w * 0.15;
        const x0 = -len / 2 + inset;
        const l = len - inset * 2;
        chamfer(ctx, x0, -w / 2 + inset, l, w - inset * 2, w * 0.06);
        ctx.fillStyle = "#121110";
        ctx.fill();
        if (loaded) mound(ctx, x0 + w * 0.04, x0 + l - w * 0.04, w * 0.9, loadColor, detail);
        bevel(ctx, x0, -w / 2 + inset, l, w - inset * 2, w * 0.06);
        if (detail && !loaded) {
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(-len * 0.34, -w * 0.05, len * 0.68, w * 0.1);
        }
      }
      nubs(ctx, len, w);
      break;
    }
    case "flatcar": {
      ctx.fillStyle = "#5A4632";
      ctx.fillRect(-len / 2, -w * 0.28, len, w * 0.56);
      if (loaded) {
        ctx.fillStyle = cargo === "wood" ? "#6B4A2B" : cargo === "lumber" ? "#C9A46A" : "#9AA3AF";
        const blocks = 3;
        const blockW = (len / blocks) * 0.8;
        for (let i = 0; i < blocks; i++) {
          const bx = -len / 2 + (i + 0.5) * (len / blocks);
          ctx.fillRect(bx - blockW / 2, -w * 0.4, blockW, w * 0.8);
          if (detail) {
            ctx.fillStyle = darken(ctx.fillStyle as string, 0.3);
            ctx.fillRect(bx - blockW / 2, -w * 0.02, blockW, Math.max(1, w * 0.05));
            ctx.fillStyle =
              cargo === "wood" ? "#6B4A2B" : cargo === "lumber" ? "#C9A46A" : "#9AA3AF";
          }
        }
      }
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = Math.max(1, size * 0.02);
      ctx.strokeRect(-len / 2, -w * 0.28, len, w * 0.56);
      break;
    }
    case "secure": {
      body(w * 0.16);
      ctx.fillStyle = cargo === "enrichedUranium" ? "#E8C21E" : "#C9A24A";
      ctx.fillRect(-len * 0.44, w * 0.18, len * 0.88, Math.max(1, w * 0.14)); // stripe
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      for (const bx of [-0.3, 0.3])
        ctx.fillRect(len * bx - w * 0.04, -w * 0.44, w * 0.08, w * 0.88);
      if (detail) dot(ctx, 0, -w * 0.08, w * 0.1, "#E8D9A0"); // padlock
      break;
    }
    case "boxcar":
    case "livestock": {
      const bodyC = mute(lv.body);
      hull(ctx, -len / 2, -w / 2, len, w, w * 0.09, roofStops(bodyC), size);
      // Ribbed roof: thin transverse lines between the eaves, a lighter ridge down the middle.
      const ribs = shape === "livestock" ? 11 : detail ? 12 : 8;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = Math.max(0.5, w * 0.035);
      for (let k = 1; k < ribs; k++) {
        const rx = -len * 0.46 + (len * 0.92 * k) / ribs;
        ctx.beginPath();
        ctx.moveTo(rx, -w * 0.42);
        ctx.lineTo(rx, w * 0.42);
        ctx.stroke();
      }
      ctx.strokeStyle = lighten(bodyC, 0.42);
      ctx.lineWidth = Math.max(0.7, w * 0.07);
      ctx.beginPath();
      ctx.moveTo(-len * 0.45, 0);
      ctx.lineTo(len * 0.45, 0);
      ctx.stroke();
      if (detail) {
        ctx.fillStyle = darken(bodyC, 0.35); // end-door frames
        for (const ex of [-1, 1])
          ctx.fillRect(ex * len * 0.47 - w * 0.03, -w * 0.4, w * 0.06, w * 0.8);
      }
      nubs(ctx, len, w);
      break;
    }
    case "mail":
    case "passenger":
    default: {
      const bodyC = mute(lv.body, 0.08);
      const modern = era === "modern" && shape === "passenger";
      // Square-ended coach: a curved roof (light band down the middle, darker eaves).
      hull(
        ctx,
        -len / 2,
        -w / 2,
        len,
        w,
        w * 0.08,
        roofStops(modern ? lighten(bodyC, 0.06) : mix(mute(lv.roof, 0.05), bodyC, 0.45)),
        size,
      );
      // Eave strips in the body colour show the side below the roof edge.
      ctx.fillStyle = bodyC;
      for (const sd of [-1, 1])
        ctx.fillRect(-len * 0.4, sd * w * 0.44 - w * 0.04, len * 0.8, w * 0.08);
      // End vestibules with a narrower, darker gangway.
      for (const ex of [-1, 1]) {
        ctx.fillStyle = darken(bodyC, 0.3);
        ctx.fillRect(
          ex > 0 ? len * 0.4 : -len / 2 + w * 0.02,
          -w * 0.36,
          len * 0.1 - w * 0.02,
          w * 0.72,
        );
        ctx.fillStyle = "#1c1b19";
        ctx.fillRect(ex > 0 ? len * 0.47 : -len / 2 + w * 0.02, -w * 0.24, len * 0.03, w * 0.48);
      }
      // Row of small roof vents.
      const vents = shape === "mail" ? 3 : 5;
      for (let i = 0; i < vents; i++) {
        const vx = -len * 0.3 + (len * 0.6 * (i + 0.5)) / vents;
        dot(ctx, vx, 0, w * 0.09, darken(modern ? bodyC : mute(lv.roof), 0.45));
        dot(
          ctx,
          vx + w * 0.015,
          -w * 0.015,
          w * 0.05,
          lighten(modern ? bodyC : mute(lv.roof), 0.3),
        );
      }
      if (detail) {
        ctx.fillStyle = "rgba(225, 228, 230, 0.55)";
        const n = shape === "mail" ? 2 : 5;
        for (let i = 0; i < n; i++) {
          const wx = -len * 0.34 + (len * 0.68 * (i + 0.5)) / n;
          for (const sd of [-1, 1])
            ctx.fillRect(wx - w * 0.06, sd * w * 0.44 - w * 0.025, w * 0.12, w * 0.05);
        }
      }
      nubs(ctx, len, w);
    }
  }
}
