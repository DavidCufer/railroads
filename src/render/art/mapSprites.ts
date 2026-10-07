/** Top-down map sprites (STYLE §7 refined by §9.5): same liveries as the side views, with extra
 * detail once the map is zoomed in (`detail`). Local space: +x = direction of travel, origin at
 * the vehicle centre; `len` × `w` is the sprite footprint in screen px. */

import type { CargoType } from "../../data/cargo";
import type { LocomotiveDef } from "../../data/trains";
import { darken, lighten, rrectPath } from "./draw";
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
    const cabLen = len * 0.28;
    const tenderLen = len * 0.22;
    const boilerFront = front - len * 0.08;
    const boilerRear = rear + tenderLen + cabLen;
    // Tender.
    ctx.fillStyle = lv.tender;
    ctx.fillRect(rear, -w * 0.46, tenderLen, w * 0.92);
    ctx.strokeStyle = lv.tenderLining;
    ctx.lineWidth = Math.max(0.5, w * 0.04);
    ctx.strokeRect(rear + w * 0.08, -w * 0.38, tenderLen - w * 0.16, w * 0.76);
    if (detail) {
      ctx.fillStyle = lv.coal;
      ctx.fillRect(rear + w * 0.14, -w * 0.3, tenderLen - w * 0.28, w * 0.6);
      ctx.fillStyle = "#4b4f56";
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(
          rear + w * 0.2 + ((i * 37) % 10) * 0.05 * tenderLen,
          -w * 0.24 + ((i * 53) % 10) * 0.05 * w,
          Math.max(1, w * 0.06),
          Math.max(1, w * 0.06),
        );
      }
    }
    // Cab.
    ctx.fillStyle = lv.cab;
    ctx.fillRect(rear + tenderLen, -w * 0.5, cabLen, w);
    ctx.fillStyle = lv.cabRoof;
    ctx.fillRect(rear + tenderLen + cabLen * 0.12, -w * 0.5, cabLen * 0.76, w * 0.16);
    if (detail) {
      ctx.fillStyle = lighten(lv.cabRoof, 0.18);
      ctx.fillRect(rear + tenderLen + cabLen * 0.12, -w * 0.05, cabLen * 0.76, w * 0.1); // roof ridge
    }
    // Boiler: top-lit, so a lighter centre stripe.
    rrectPath(ctx, boilerRear, -w * 0.4, boilerFront - boilerRear, w * 0.8, w * 0.32);
    ctx.fillStyle = lv.body;
    ctx.fill();
    ctx.fillStyle = lighten(lv.body, 0.22);
    ctx.fillRect(boilerRear + w * 0.1, -w * 0.13, boilerFront - boilerRear - w * 0.2, w * 0.2);
    ctx.strokeStyle = lv.era === 0 ? lv.brass : darken(lv.body, 0.5);
    ctx.lineWidth = Math.max(1, w * 0.09);
    const bands = detail ? 4 : 3;
    for (let i = 1; i <= bands; i++) {
      const bx = boilerRear + ((boilerFront - boilerRear) * i) / (bands + 1);
      ctx.beginPath();
      ctx.moveTo(bx, -w * 0.38);
      ctx.lineTo(bx, w * 0.38);
      ctx.stroke();
    }
    // Smokebox nose.
    ctx.fillStyle = lv.smokebox;
    ctx.fillRect(boilerFront, -w * 0.42, front - boilerFront, w * 0.84);
    if (lv.smokeboxFront !== lv.smokebox) {
      ctx.fillStyle = lv.smokeboxFront;
      ctx.fillRect(front - len * 0.03, -w * 0.4, len * 0.03, w * 0.8);
    }
    // Chimney and domes on the centre line.
    const chimneyX = chimneyOffset(len);
    const chimneyR = w * 0.16;
    const domeX = chimneyX - len * 0.16;
    const domeR = w * 0.11;
    dot(ctx, chimneyX, 0, chimneyR, "#15161a");
    if (lv.era === 0) {
      ctx.strokeStyle = lv.brass;
      ctx.lineWidth = Math.max(1, w * 0.05);
      ctx.beginPath();
      ctx.arc(chimneyX, 0, chimneyR, 0, Math.PI * 2);
      ctx.stroke();
    }
    dot(ctx, domeX, 0, domeR, lv.brassDomes ? lv.brass : darken(lv.body, 0.3));
    if (detail) {
      dot(ctx, domeX - len * 0.13, 0, domeR * 0.8, lv.brassDomes ? lv.brass : darken(lv.body, 0.3));
      dot(ctx, front - w * 0.06, 0, w * 0.07, "#F7E7A6"); // headlamp
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = Math.max(1, w * 0.035);
    ctx.beginPath();
    ctx.arc(chimneyX, 0, chimneyR, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const lv = powerLivery(def.id);
  rrectPath(ctx, -len / 2, -w / 2, len, w, w * 0.18);
  ctx.fillStyle = lv.body;
  ctx.fill();
  outline(ctx, size);
  // Centre roof band (top-lit) and accent stripe.
  ctx.fillStyle = lv.band;
  ctx.fillRect(-len * 0.44, -w * 0.12, len * 0.88, w * 0.24);
  ctx.fillStyle = lv.accent;
  ctx.fillRect(len / 2 - w * 0.16, -w * 0.5, w * 0.16, w);
  // Cab glass at the front, roof trim at the rear.
  ctx.fillStyle = lv.glass;
  ctx.fillRect(len * 0.2, -w * 0.3, len * 0.18, w * 0.6);
  ctx.fillStyle = lv.roof;
  ctx.fillRect(-len * 0.46, -w * 0.5, len * 0.1, w);
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
      rrectPath(ctx, -len / 2, -w / 2, len, w, w * 0.15);
      ctx.fillStyle = lv.body;
      ctx.fill();
      if (cargo === "grain" && era === "modern") {
        // Covered hopper: roof hatches, no open top.
        for (const hx of [-0.28, 0, 0.28]) dot(ctx, len * hx, 0, w * 0.16, lv.roof);
      } else if (cargo === "grain") {
        ctx.fillStyle = lv.roof;
        ctx.fillRect(-len * 0.4, -w * 0.06, len * 0.8, w * 0.12); // boxcar roof ridge
      } else {
        const inset = w * 0.16;
        ctx.fillStyle = loaded ? loadColor : "#1A1A1A";
        ctx.fillRect(-len / 2 + inset, -w / 2 + inset, len - inset * 2, w - inset * 2);
        if (loaded) {
          ctx.beginPath();
          ctx.ellipse(0, -w * 0.06, len * 0.28, w * 0.22, 0, 0, Math.PI * 2);
          ctx.fillStyle = lighten(loadColor, 0.12);
          ctx.fill();
        }
      }
      rrectPath(ctx, -len / 2, -w / 2, len, w, w * 0.15);
      outline(ctx, size);
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
      body(w * 0.2);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
      ctx.lineWidth = Math.max(0.5, w * 0.06);
      const ribs = shape === "livestock" ? 5 : 4;
      for (let r = 0; r < ribs; r++) {
        const rx = -len / 2 + (len * (shape === "livestock" ? r + 0.5 : r + 1)) / ribs;
        if (shape === "boxcar" && r === ribs - 1) break;
        ctx.beginPath();
        ctx.moveTo(rx, -w * 0.44);
        ctx.lineTo(rx, w * 0.44);
        ctx.stroke();
      }
      if (detail) {
        ctx.fillStyle = lv.roof;
        ctx.fillRect(-len * 0.42, -w * 0.05, len * 0.84, w * 0.1); // roof walk
      }
      break;
    }
    case "mail":
    case "passenger":
    default: {
      body(w * 0.24);
      if (shape === "passenger" && era === "modern") {
        ctx.fillStyle = "#46637F";
        ctx.fillRect(-len * 0.44, -w * 0.4, len * 0.88, w * 0.16);
        ctx.fillRect(-len * 0.44, w * 0.24, len * 0.88, w * 0.16);
      }
      ctx.strokeStyle = shape === "mail" ? "rgba(255,230,180,0.4)" : "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = Math.max(1, w * 0.12);
      ctx.beginPath();
      ctx.moveTo(-len * 0.42, 0);
      ctx.lineTo(len * 0.42, 0);
      ctx.stroke();
      if (detail) {
        if (era === "mid" && shape === "passenger") {
          ctx.strokeStyle = lv.roof; // clerestory centre line
          ctx.lineWidth = Math.max(1, w * 0.16);
          ctx.beginPath();
          ctx.moveTo(-len * 0.34, 0);
          ctx.lineTo(len * 0.34, 0);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(230, 235, 240, 0.8)";
        const n = shape === "mail" ? 2 : 5;
        for (let i = 0; i < n; i++) {
          const wx = -len * 0.36 + (len * 0.72 * (i + 0.5)) / n;
          for (const s of [-1, 1])
            ctx.fillRect(wx - w * 0.06, s * w * 0.36 - w * 0.04, w * 0.12, w * 0.08);
        }
      }
    }
  }
}
