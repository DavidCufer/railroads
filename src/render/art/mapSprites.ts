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
const mute = (c: string, t = 0.16): string => mix(c, "#7C7668", t);

/** Soft drop shadow on the ballast; the offset is in device space so it ignores the sprite's
 * rotation (light stays top-left). Call before filling the body, `noShadow` after. */
function shadowOn(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.shadowColor = "rgba(15, 14, 10, 0.38)";
  ctx.shadowBlur = Math.max(1.5, size * 0.05);
  ctx.shadowOffsetX = Math.max(0.5, size * 0.025);
  ctx.shadowOffsetY = Math.max(1, size * 0.045);
}
function shadowOff(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Rounded body shaded as a curved roof: lit centre line, darker flanks. */
function curved(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  w: number,
  r: number,
  color: string,
  size: number,
  withShadow = true,
): void {
  const g = ctx.createLinearGradient(0, y, 0, y + w);
  g.addColorStop(0, darken(color, 0.3));
  g.addColorStop(0.35, lighten(color, 0.14));
  g.addColorStop(0.55, lighten(color, 0.06));
  g.addColorStop(1, darken(color, 0.34));
  rrectPath(ctx, x, y, len, w, r);
  if (withShadow) shadowOn(ctx, size);
  ctx.fillStyle = g;
  ctx.fill();
  shadowOff(ctx);
}

/** Buffer beams: a dark sliver and two stubby buffers at each end of a vehicle. */
function buffers(ctx: CanvasRenderingContext2D, len: number, w: number, ends: 1 | 2 = 2): void {
  ctx.fillStyle = "#2a2824";
  const t = Math.max(0.8, w * 0.1);
  for (const e of ends === 2 ? [-1, 1] : [-1]) {
    for (const s of [-1, 1])
      ctx.fillRect(e * len * 0.5 - (e > 0 ? t : 0), s * w * 0.3 - t * 0.5, t, t);
  }
}

/** Deterministic lumpy heap of dots (coal, ore). */
function heap(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  w: number,
  color: string,
  detail: boolean,
): void {
  const n = detail ? 14 : 8;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const px = x0 + (x1 - x0) * t;
    const py = (hash01(i * 7 + 3) - 0.5) * w * 0.34;
    const r = w * (0.12 + hash01(i * 13 + 1) * 0.08);
    dot(ctx, px, py, r, mix(color, "#000000", hash01(i + 5) * 0.2));
    if (detail) dot(ctx, px - r * 0.25, py - r * 0.3, r * 0.4, lighten(color, 0.28));
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
  if (def.type === "steam") {
    const lv = steamLivery(def);
    const front = len / 2;
    const rear = -len / 2;
    const tenderLen = len * 0.24;
    const cabLen = len * 0.2;
    const cabX = rear + tenderLen + len * 0.015;
    const boilerRear = cabX + cabLen;
    const boilerFront = front - len * 0.07;
    const bodyC = mute(lv.body);
    // Frames and footplate under everything: a dark strip the full length, with the shadow.
    rrectPath(ctx, rear, -w * 0.47, len, w * 0.94, w * 0.12);
    shadowOn(ctx, size);
    ctx.fillStyle = "#2b2a27";
    ctx.fill();
    shadowOff(ctx);
    // Tender: curved side tank, coal bunker or water hatch on top.
    curved(
      ctx,
      rear + len * 0.01,
      -w * 0.45,
      tenderLen,
      w * 0.9,
      w * 0.1,
      mute(lv.tender),
      size,
      false,
    );
    ctx.fillStyle = "#17181a";
    ctx.fillRect(rear + w * 0.1, -w * 0.32, tenderLen - w * 0.18, w * 0.64);
    heap(ctx, rear + w * 0.2, rear + tenderLen - w * 0.14, w * 1.1, "#3b3f45", detail);
    if (detail) {
      ctx.strokeStyle = mute(lv.tenderLining);
      ctx.lineWidth = Math.max(0.5, w * 0.035);
      ctx.strokeRect(rear + len * 0.01 + w * 0.05, -w * 0.4, tenderLen - w * 0.1, w * 0.8);
    }
    // Cab: roof with a slight overhang, lit ridge, side-window slits.
    curved(ctx, cabX, -w * 0.5, cabLen, w, w * 0.1, mute(lv.cab), size, false);
    ctx.fillStyle = mute(lv.cabRoof);
    rrectPath(ctx, cabX - w * 0.03, -w * 0.44, cabLen + w * 0.06, w * 0.88, w * 0.08);
    ctx.fill();
    ctx.fillStyle = lighten(mute(lv.cabRoof), 0.2);
    ctx.fillRect(cabX + cabLen * 0.08, -w * 0.06, cabLen * 0.84, w * 0.12);
    if (detail) {
      ctx.fillStyle = lv.glass;
      for (const sd of [-1, 1])
        ctx.fillRect(cabX + cabLen * 0.25, sd * w * 0.47 - w * 0.03, cabLen * 0.5, w * 0.06);
    }
    // Boiler: round shading (lit along the top-left), thin lagging bands, rear firebox swell.
    curved(
      ctx,
      boilerRear,
      -w * 0.4,
      boilerFront - boilerRear,
      w * 0.8,
      w * 0.3,
      bodyC,
      size,
      false,
    );
    const hl = ctx.createLinearGradient(0, -w * 0.4, 0, w * 0.4);
    hl.addColorStop(0.18, "rgba(255,255,255,0)");
    hl.addColorStop(0.32, "rgba(255,255,255,0.22)");
    hl.addColorStop(0.46, "rgba(255,255,255,0)");
    rrectPath(ctx, boilerRear, -w * 0.4, boilerFront - boilerRear, w * 0.8, w * 0.3);
    ctx.fillStyle = hl;
    ctx.fill();
    ctx.strokeStyle = lv.era === 0 ? lv.brass : darken(bodyC, 0.45);
    ctx.lineWidth = Math.max(0.6, w * 0.06);
    const bands = detail ? 4 : 2;
    for (let i = 1; i <= bands; i++) {
      const bx = boilerRear + ((boilerFront - boilerRear) * i) / (bands + 1);
      ctx.beginPath();
      ctx.moveTo(bx, -w * 0.38);
      ctx.lineTo(bx, w * 0.38);
      ctx.stroke();
    }
    // Smokebox: darker drum with a round door at the very front.
    curved(
      ctx,
      boilerFront - len * 0.02,
      -w * 0.4,
      front - boilerFront + len * 0.02,
      w * 0.8,
      w * 0.22,
      mute(lv.smokebox, 0.05),
      size,
      false,
    );
    if (detail) dot(ctx, front - w * 0.03, 0, w * 0.1, lighten(lv.smokeboxFront, 0.18));
    // Chimney (ringed top), domes, safety valves on the centre line.
    const chimneyX = chimneyOffset(len);
    const chimneyR = w * 0.15;
    dot(ctx, chimneyX, 0, chimneyR * 1.2, darken(bodyC, 0.5));
    dot(ctx, chimneyX, 0, chimneyR * 0.85, "#14151a");
    ctx.strokeStyle = lv.era === 0 ? lv.brass : lighten(bodyC, 0.2);
    ctx.lineWidth = Math.max(0.6, w * 0.045);
    ctx.beginPath();
    ctx.arc(chimneyX, 0, chimneyR, 0, Math.PI * 2);
    ctx.stroke();
    const domeX = chimneyX - len * 0.17;
    const domeC = lv.brassDomes ? lv.brass : lighten(bodyC, 0.08);
    dot(ctx, domeX, 0, w * 0.13, darken(domeC, 0.3));
    dot(ctx, domeX - w * 0.02, -w * 0.02, w * 0.1, domeC);
    dot(ctx, domeX - w * 0.05, -w * 0.05, w * 0.04, lighten(domeC, 0.5));
    if (detail) {
      dot(ctx, domeX - len * 0.12, 0, w * 0.085, domeC);
      // Cylinders and running-board rods low on each flank.
      ctx.strokeStyle = "#8e9094";
      ctx.lineWidth = Math.max(0.6, w * 0.04);
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(boilerRear + len * 0.05, sd * w * 0.45);
        ctx.lineTo(front - len * 0.12, sd * w * 0.45);
        ctx.stroke();
      }
      dot(ctx, front - w * 0.02, -w * 0.28, w * 0.06, "#F2E6B8"); // lamps
      dot(ctx, front - w * 0.02, w * 0.28, w * 0.06, "#F2E6B8");
    }
    buffers(ctx, len, w);
    return;
  }
  const lv = powerLivery(def.id);
  const bodyC = mute(lv.body, 0.1);
  curved(ctx, -len / 2, -w / 2, len, w, w * 0.2, bodyC, size);
  // Livery stripe low on both flanks, a lit roof panel, darker radiator/roof end at the rear.
  ctx.fillStyle = mute(lv.accent, 0.1);
  for (const sd of [-1, 1]) ctx.fillRect(-len * 0.46, sd * w * 0.4 - w * 0.05, len * 0.92, w * 0.1);
  ctx.fillStyle = lighten(mute(lv.band, 0.1), 0.05);
  rrectPath(ctx, -len * 0.4, -w * 0.2, len * 0.62, w * 0.4, w * 0.1);
  ctx.fill();
  ctx.fillStyle = darken(mute(lv.roof, 0.1), 0.15);
  ctx.fillRect(-len * 0.47, -w * 0.4, len * 0.07, w * 0.8);
  // Cab: windscreen glass wrapping the front, a roof block over the cab.
  ctx.fillStyle = darken(bodyC, 0.12);
  rrectPath(ctx, len * 0.24, -w * 0.43, len * 0.2, w * 0.86, w * 0.1);
  ctx.fill();
  ctx.fillStyle = lv.glass;
  ctx.fillRect(len * 0.405, -w * 0.34, len * 0.05, w * 0.68);
  ctx.fillStyle = lighten(bodyC, 0.12);
  ctx.fillRect(len * 0.27, -w * 0.3, len * 0.12, w * 0.6);
  buffers(ctx, len, w);
  if (detail) {
    if (FAN_MODELS.has(def.id)) {
      for (const fx of [-0.3, -0.1, 0.1]) {
        dot(ctx, len * fx, 0, w * 0.17, "#15181c");
        dot(ctx, len * fx, 0, w * 0.08, lighten("#15181c", 0.2));
      }
    }
    // Handrail edge lines.
    ctx.strokeStyle = lv.handrail;
    ctx.lineWidth = Math.max(0.5, w * 0.035);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-len * 0.46, s * w * 0.44);
      ctx.lineTo(len * 0.46, s * w * 0.44);
      ctx.stroke();
    }
  }
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
      curved(ctx, -len / 2, -w / 2, len, w, w * 0.12, bodyC, size);
      if (cargo === "grain" && era === "modern") {
        // Covered hopper: roof hatches, no open top.
        for (const hx of [-0.28, 0, 0.28]) {
          dot(ctx, len * hx, 0, w * 0.17, darken(lv.roof, 0.3));
          dot(ctx, len * hx - w * 0.02, -w * 0.02, w * 0.12, lighten(lv.roof, 0.1));
        }
      } else if (cargo === "grain") {
        ctx.fillStyle = lv.roof;
        ctx.fillRect(-len * 0.4, -w * 0.06, len * 0.8, w * 0.12); // boxcar roof ridge
      } else {
        // Open top: raised rim, dark inside, the load heaped above the rim.
        const inset = w * 0.17;
        rrectPath(ctx, -len / 2 + inset, -w / 2 + inset, len - inset * 2, w - inset * 2, w * 0.06);
        ctx.fillStyle = loaded ? darken(loadColor, 0.35) : "#161514";
        ctx.fill();
        if (loaded) heap(ctx, -len * 0.38, len * 0.38, w * 0.85, loadColor, detail);
        else if (detail) {
          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.fillRect(-len * 0.36, -w * 0.05, len * 0.72, w * 0.1);
        }
        ctx.strokeStyle = lighten(bodyC, 0.2);
        ctx.lineWidth = Math.max(0.6, w * 0.05);
        rrectPath(ctx, -len / 2 + inset, -w / 2 + inset, len - inset * 2, w - inset * 2, w * 0.06);
        ctx.stroke();
        if (detail) {
          ctx.strokeStyle = darken(bodyC, 0.35); // side ribs
          for (const rx of [-0.3, -0.1, 0.1, 0.3])
            for (const sd of [-1, 1]) {
              ctx.beginPath();
              ctx.moveTo(len * rx, sd * w * 0.34);
              ctx.lineTo(len * rx, sd * w * 0.5);
              ctx.stroke();
            }
        }
      }
      buffers(ctx, len, w);
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
      curved(ctx, -len / 2, -w / 2, len, w, w * 0.1, bodyC, size);
      // Roof planks run lengthwise; a ridge along the middle and a running board over it.
      ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
      ctx.lineWidth = Math.max(0.5, w * 0.035);
      const planks = shape === "livestock" ? 6 : 4;
      for (let k = 1; k < planks; k++) {
        const py = -w * 0.42 + (w * 0.84 * k) / planks;
        ctx.beginPath();
        ctx.moveTo(-len * 0.44, py);
        ctx.lineTo(len * 0.44, py);
        ctx.stroke();
      }
      ctx.fillStyle = lighten(bodyC, 0.2);
      ctx.fillRect(-len * 0.44, -w * 0.05, len * 0.88, w * 0.1);
      if (detail) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
        ctx.lineWidth = Math.max(0.5, w * 0.04);
        for (const ex of [-0.46, 0.46]) {
          ctx.beginPath();
          ctx.moveTo(len * ex, -w * 0.46);
          ctx.lineTo(len * ex, w * 0.46);
          ctx.stroke();
        }
        ctx.fillStyle = lv.roof; // roof-walk hatch cap
        ctx.fillRect(-len * 0.1, -w * 0.12, len * 0.2, w * 0.24);
      }
      buffers(ctx, len, w);
      break;
    }
    case "mail":
    case "passenger":
    default: {
      const bodyC = mute(lv.body);
      curved(ctx, -len / 2, -w / 2, len, w, w * 0.22, bodyC, size);
      const modern = era === "modern" && shape === "passenger";
      // Roof: a lit crown, darker ends over the vestibules.
      ctx.fillStyle = modern ? lighten(bodyC, 0.08) : mute(lv.roof);
      rrectPath(ctx, -len * 0.4, -w * 0.3, len * 0.8, w * 0.6, w * 0.2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
      ctx.fillRect(-len * 0.38, -w * 0.18, len * 0.76, w * 0.1);
      if (era === "mid" && shape === "passenger") {
        ctx.fillStyle = lighten(mute(lv.roof), 0.14); // clerestory
        ctx.fillRect(-len * 0.3, -w * 0.09, len * 0.6, w * 0.18);
      }
      if (modern) {
        ctx.fillStyle = "#3f5b73"; // window band along both flanks
        for (const sd of [-1, 1])
          ctx.fillRect(-len * 0.4, sd * w * 0.4 - w * 0.07, len * 0.8, w * 0.14);
      } else if (shape === "mail") {
        ctx.fillStyle = "rgba(255,230,180,0.35)";
        ctx.fillRect(-len * 0.38, w * 0.33, len * 0.76, Math.max(0.8, w * 0.06));
      }
      if (detail) {
        ctx.fillStyle = "rgba(225, 228, 230, 0.55)";
        const n = shape === "mail" ? 2 : 5;
        for (let i = 0; i < n; i++) {
          const wx = -len * 0.36 + (len * 0.72 * (i + 0.5)) / n;
          for (const sd of [-1, 1])
            ctx.fillRect(wx - w * 0.06, sd * w * 0.4 - w * 0.03, w * 0.12, w * 0.06);
        }
        ctx.strokeStyle = "rgba(0, 0, 0, 0.3)"; // vestibule gangways
        ctx.lineWidth = Math.max(0.5, w * 0.05);
        for (const ex of [-0.44, 0.44]) {
          ctx.beginPath();
          ctx.moveTo(len * ex, -w * 0.4);
          ctx.lineTo(len * ex, w * 0.4);
          ctx.stroke();
        }
      }
      buffers(ctx, len, w);
    }
  }
}
