/** Top-down map sprites (STYLE §7 refined by §9.5): same liveries as the side views, with extra
 * detail once the map is zoomed in (`detail`). Local space: +x = direction of travel, origin at
 * the vehicle centre; `len` × `w` is the sprite footprint in screen px. */

import type { CargoType } from "../../data/cargo";
import type { LocomotiveDef } from "../../data/trains";
import { darken, hash01, lighten, mix, rrectPath } from "./draw";
import { carLivery, powerLivery, steamLivery, type EraBucket } from "./livery";

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

/** Body hull: bevelled silhouette, fill shaded across the width, lit/dark edges. (The drop shadow
 * is a separate cached sprite, see `spriteCache.ts`.) */
function hull(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  l: number,
  w: number,
  c: number,
  stops: Stops,
): void {
  const g = ctx.createLinearGradient(0, y, 0, y + w);
  for (const [t, col] of stops) g.addColorStop(t, col);
  chamfer(ctx, x, y, l, w, c);
  ctx.fillStyle = g;
  ctx.fill();
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

/** Round roof fans on the centre line, by diesel model. */
const FAN_COUNT: Record<string, number> = {
  "high-horsepower-diesel": 3,
  "heavy-diesel": 3,
  "road-switcher-diesel": 2,
  "cab-unit-diesel": 2,
  "streamliner-diesel": 1,
};

/** Streamlined models: a deeper chamfer reads as a raked nose. */
const NOSED = new Set([
  "streamliner-diesel",
  "cab-unit-diesel",
  "e-unit-electric",
  "high-speed-trainset",
]);
/** Pantograph positions (fraction of the loco length from its centre) per electric model. */
const PANTO_X: Record<string, number[]> = {
  "early-electric": [-0.12],
  "e-unit-electric": [-0.24, 0.1],
  "modern-electric": [-0.1],
  "heavy-freight-electric": [-0.24, 0.1],
  "high-speed-trainset": [-0.18],
};

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
    // Frames and footplate: a dark strip the full length, the base under everything.
    hull(ctx, rear, -w * 0.47, len, w * 0.94, w * 0.05, [
      [0, "#2b2a27"],
      [1, "#1e1d1b"],
    ]);
    // Tender: bevelled box, a dark coal space with a lit mound.
    const tc = mute(lv.tender);
    hull(ctx, rear + len * 0.005, -w * 0.46, tenderLen, w * 0.92, w * 0.07, flat(tc));
    ctx.fillStyle = "#121315";
    ctx.fillRect(rear + w * 0.14, -w * 0.31, tenderLen - w * 0.26, w * 0.62);
    mound(ctx, rear + w * 0.16, rear + tenderLen - w * 0.14, w * 0.8, "#4a4e55", detail);
    // Cab body, then a separate roof that overhangs it on every side.
    hull(ctx, cabX, -w * 0.47, cabLen, w * 0.94, w * 0.05, flat(mute(lv.cab)));
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
    );
    // Boiler: a cylinder with a highlight line along its length and darker flanks.
    hull(ctx, boilerRear, -w * 0.38, boilerFront - boilerRear, w * 0.76, w * 0.05, cylStops(bodyC));
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
    hull(ctx, sx, -w * 0.4, front - sx, w * 0.8, w * 0.06, cylStops(mute(lv.smokebox, 0.05)));
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
  hull(ctx, -len / 2, -w / 2, len, w, NOSED.has(def.id) ? w * 0.3 : w * 0.12, roofStops(bodyC));
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(0.7, w * 0.05);
  ctx.beginPath();
  ctx.moveTo(-len * 0.44, -w * 0.04);
  ctx.lineTo(len * 0.2, -w * 0.04);
  ctx.stroke();
  const cabX = len * 0.22;
  hull(ctx, cabX, -w * 0.46, len * 0.26, w * 0.92, w * 0.08, roofStops(lighten(bodyC, 0.05)));
  // Thin cab window strips at both ends.
  ctx.fillStyle = lv.glass;
  ctx.fillRect(len / 2 - len * 0.05, -w * 0.34, len * 0.035, w * 0.68);
  ctx.fillRect(-len / 2 + len * 0.015, -w * 0.34, len * 0.03, w * 0.68);
  ctx.fillStyle = mute(lv.accent, 0.1); // nose tip
  ctx.fillRect(len / 2 - len * 0.015, -w * 0.4, len * 0.015, w * 0.8);
  const roofC = lighten(bodyC, 0.12);
  const dark = "#17191d";
  const electric = def.type === "electric";
  if (!electric) {
    // Radiator grille at the rear: a louvred block across the roof.
    ctx.fillStyle = darken(roofC, 0.5);
    ctx.fillRect(-len * 0.45, -w * 0.3, len * 0.1, w * 0.6);
    ctx.strokeStyle = "rgba(190,196,204,0.4)";
    ctx.lineWidth = Math.max(0.5, w * 0.025);
    for (const k of [-0.18, 0, 0.18]) {
      ctx.beginPath();
      ctx.moveTo(-len * 0.44, w * k);
      ctx.lineTo(-len * 0.36, w * k);
      ctx.stroke();
    }
    // Round grilled fans on the centre line.
    const nFans = FAN_COUNT[def.id] ?? 1;
    const fanR = w * 0.2;
    for (let i = 0; i < nFans; i++) {
      const px = len * (-0.27 + (0.4 * (i + 0.5)) / nFans - 0.0);
      dot(ctx, px, 0, fanR * 1.12, darken(roofC, 0.45));
      dot(ctx, px, 0, fanR, dark);
      if (detail) {
        ctx.strokeStyle = "rgba(190,196,204,0.6)";
        ctx.lineWidth = Math.max(0.5, w * 0.028);
        for (const k of [-0.55, -0.18, 0.18, 0.55]) {
          const hw = fanR * Math.sqrt(1 - k * k) * 0.95;
          ctx.beginPath();
          ctx.moveTo(px - hw, k * fanR);
          ctx.lineTo(px + hw, k * fanR);
          ctx.stroke();
        }
      }
    }
  } else {
    // Roof equipment: transformer / resistor boxes on the centre line (clear of the pantographs).
    const second = (PANTO_X[def.id]?.length ?? 1) > 1 ? -0.1 : 0.06;
    for (const bx of [-0.45, second]) {
      ctx.fillStyle = darken(roofC, 0.42);
      ctx.fillRect(len * bx, -w * 0.17, len * 0.09, w * 0.34);
      ctx.fillStyle = lighten(roofC, 0.25);
      ctx.fillRect(len * bx + len * 0.01, -w * 0.12, len * 0.07, w * 0.04);
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
  const pantos = PANTO_X[def.id];
  if (pantos) {
    // Seen from above: a thin rhombus frame on the roof centre line, a contact bar across the
    // body width and two insulators at its foot. Everything stays inside the footprint.
    for (const px of pantos.map((f) => f * len)) {
      const hl = len * 0.075;
      const hw = w * 0.3;
      ctx.strokeStyle = "#1c2026";
      ctx.lineWidth = Math.max(0.6, w * 0.045);
      ctx.beginPath();
      ctx.moveTo(px - hl, 0);
      ctx.lineTo(px, -hw);
      ctx.lineTo(px + hl, 0);
      ctx.lineTo(px, hw);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = lighten("#8b9097", 0.1);
      ctx.lineWidth = Math.max(0.8, w * 0.07);
      ctx.beginPath();
      ctx.moveTo(px + hl * 0.1, -w * 0.4);
      ctx.lineTo(px + hl * 0.1, w * 0.4);
      ctx.stroke();
      for (const sd of [-1, 1])
        dot(ctx, px - hl, sd * w * 0.12, Math.max(0.6, w * 0.045), "#D8DADC");
    }
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
  switch (shape) {
    case "tanker": {
      // A cylinder lying along the track: dark sides, lit line, saddles at the ends, a walkway.
      const bodyC = mute(lv.body);
      const r = w * 0.5;
      const g = ctx.createLinearGradient(0, -w * 0.44, 0, w * 0.44);
      for (const [t, col] of cylStops(bodyC)) g.addColorStop(t, col);
      ctx.fillStyle = "#1b1a18"; // underframe / saddles
      ctx.fillRect(-len / 2, -w * 0.46, len, w * 0.92);
      rrectPath(ctx, -len * 0.45, -w * 0.44, len * 0.9, w * 0.88, r * 0.7);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = Math.max(0.7, w * 0.04);
      ctx.beginPath();
      ctx.moveTo(-len * 0.38, -w * 0.18);
      ctx.lineTo(len * 0.38, -w * 0.18);
      ctx.stroke();
      ctx.strokeStyle = darken(bodyC, 0.45); // tank bands
      for (const bx of [-0.25, 0.25]) {
        ctx.beginPath();
        ctx.moveTo(len * bx, -w * 0.43);
        ctx.lineTo(len * bx, w * 0.43);
        ctx.stroke();
      }
      ctx.fillStyle = darken(bodyC, 0.4); // walkway and dome
      ctx.fillRect(-len * 0.3, -w * 0.04, len * 0.6, w * 0.08);
      dot(ctx, 0, 0, w * 0.14, darken(bodyC, 0.5));
      dot(ctx, -w * 0.02, -w * 0.03, w * 0.1, lighten(bodyC, 0.25));
      nubs(ctx, len, w);
      break;
    }
    case "hopper": {
      const bodyC = mute(lv.body);
      hull(ctx, -len / 2, -w / 2, len, w, w * 0.1, roofStops(bodyC));
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
      // Plank deck with the load stacked on it: logs, sawn lumber or steel plate.
      hull(ctx, -len / 2, -w * 0.46, len, w * 0.92, w * 0.05, roofStops("#6A5440"));
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = Math.max(0.5, w * 0.03);
      for (let k = 1; k < 10; k++) {
        const px = -len / 2 + (len * k) / 10;
        ctx.beginPath();
        ctx.moveTo(px, -w * 0.42);
        ctx.lineTo(px, w * 0.42);
        ctx.stroke();
      }
      if (loaded) {
        const lx0 = -len * 0.42;
        const ll = len * 0.84;
        if (cargo === "wood") {
          const n = 4; // round logs side by side, each lit along its length
          for (let k = 0; k < n; k++) {
            const ly = -w * 0.38 + (w * 0.76 * (k + 0.5)) / n;
            const lh = (w * 0.76) / n;
            const g = ctx.createLinearGradient(0, ly - lh / 2, 0, ly + lh / 2);
            for (const [t, col] of cylStops("#7A5530")) g.addColorStop(t, col);
            rrectPath(
              ctx,
              lx0 + hash01(k * 3 + 1) * len * 0.05,
              ly - lh / 2,
              ll * 0.96,
              lh,
              lh * 0.45,
            );
            ctx.fillStyle = g;
            ctx.fill();
          }
        } else if (cargo === "lumber") {
          hull(ctx, lx0, -w * 0.38, ll, w * 0.76, w * 0.03, roofStops("#C9A46A"));
          ctx.strokeStyle = "rgba(90,60,25,0.45)";
          ctx.lineWidth = Math.max(0.5, w * 0.03);
          for (let k = 1; k < 5; k++) {
            const ly = -w * 0.38 + (w * 0.76 * k) / 5;
            ctx.beginPath();
            ctx.moveTo(lx0 + w * 0.04, ly);
            ctx.lineTo(lx0 + ll - w * 0.04, ly);
            ctx.stroke();
          }
        } else {
          for (const k of [0, 1]) {
            hull(
              ctx,
              lx0 + k * ll * 0.51,
              -w * 0.36,
              ll * 0.47,
              w * 0.72,
              w * 0.04,
              roofStops("#9AA3AF"),
            );
          }
        }
        ctx.strokeStyle = "rgba(20,18,16,0.55)"; // straps
        ctx.lineWidth = Math.max(0.6, w * 0.05);
        for (const sx of [-0.2, 0.2]) {
          ctx.beginPath();
          ctx.moveTo(len * sx, -w * 0.4);
          ctx.lineTo(len * sx, w * 0.4);
          ctx.stroke();
        }
      } else if (detail) {
        ctx.fillStyle = darken("#6A5440", 0.45); // stake pockets
        for (const sx of [-0.42, -0.14, 0.14, 0.42])
          for (const sd of [-1, 1])
            ctx.fillRect(len * sx - w * 0.04, sd * w * 0.4 - w * 0.03, w * 0.08, w * 0.06);
      }
      nubs(ctx, len, w);
      break;
    }
    case "secure": {
      // Armoured van: heavy riveted roof, door bands, a padlock hasp.
      const bodyC = mute(lv.body);
      hull(ctx, -len / 2, -w / 2, len, w, w * 0.09, roofStops(bodyC));
      ctx.fillStyle = darken(bodyC, 0.4);
      for (const bx of [-0.3, 0, 0.3])
        ctx.fillRect(len * bx - w * 0.04, -w * 0.44, w * 0.08, w * 0.88);
      ctx.fillStyle = cargo === "enrichedUranium" ? "#C9A227" : "#B9944A";
      ctx.fillRect(-len * 0.45, -w * 0.05, len * 0.9, w * 0.1); // lit ridge
      if (detail) dot(ctx, len * 0.15, 0, w * 0.07, "#E8D9A0"); // padlock
      nubs(ctx, len, w);
      break;
    }
    case "boxcar":
    case "livestock": {
      const bodyC = mute(lv.body);
      hull(ctx, -len / 2, -w / 2, len, w, w * 0.09, roofStops(bodyC));
      // Ribbed roof: thin transverse lines between the eaves, a lighter ridge down the middle.
      const ribs = shape === "livestock" ? 14 : detail ? 12 : 8;
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
      // Low flat roof vents, by era: small lamp-tops on early stock, a clerestory strip with slits
      // on mid-era stock, flat air-conditioning boxes on modern stock.
      const roofC = modern ? lighten(bodyC, 0.06) : mix(mute(lv.roof, 0.05), bodyC, 0.45);
      ctx.fillStyle = darken(roofC, 0.38);
      if (era === "early" || shape === "mail") {
        for (const vx of [-0.22, 0, 0.22])
          ctx.fillRect(len * vx - len * 0.03, -w * 0.05, len * 0.06, w * 0.1);
      } else if (era === "mid") {
        ctx.fillRect(-len * 0.3, -w * 0.07, len * 0.6, w * 0.14);
        ctx.fillStyle = lighten(roofC, 0.3);
        for (let i = 0; i < 9; i++)
          ctx.fillRect(-len * 0.28 + i * len * 0.07, -w * 0.045, len * 0.035, w * 0.09);
      } else {
        for (const vx of [-0.27, -0.09, 0.09, 0.27])
          ctx.fillRect(len * vx - len * 0.06, -w * 0.12, len * 0.12, w * 0.24);
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
