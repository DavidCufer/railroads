/**
 * Top-down station buildings (STYLE §10). Everything is drawn in a local frame — origin at the tile
 * centre, +x along the track, +y across it — in units of one tile (`u` = on-screen tile size), so
 * the same picture serves single track, diagonals and passing loops. Light comes from the upper
 * left: roofs are two-tone (lit half / shaded half split by the ridge) with a 1px shadow to the
 * lower right, matching the Phase 19 train sprites.
 */
import type { StationImprovementType, StationType } from "../data/stations";

export type StationMarkerType = StationImprovementType | "engineShed" | "waterTower";

const WOOD = "#9A7048";
const WOOD_ROOF_LIT = "#B5573A";
const WOOD_ROOF_SHADE = "#8E3F2B";
const BRICK = "#A4553F";
const BRICK_ROOF_LIT = "#5C6672";
const BRICK_ROOF_SHADE = "#3F4753";
const PLATFORM = "#C9BDA0";
const PLATFORM_EDGE = "#8F846C";
const CANOPY = "#39424D";
const CANOPY_RIDGE = "#6A7684";
const SHED_ROOF = "#59636F";
const SHED_RIB = "#2F3842";
const SHED_RIDGE = "#8794A3";
const SHADOW = "rgba(20, 16, 10, 0.28)";

/** Below this on-screen tile size only flat blocks are drawn (no ridges, ribs or posts). */
const DETAIL_SIZE = 20;

/** A gabled roof seen from above: two tones split by the ridge (along x when `ridgeAlongX`). */
function gable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lit: string,
  shade: string,
  detail: boolean,
  ridgeAlongX = true,
): void {
  if (ridgeAlongX) {
    ctx.fillStyle = lit;
    ctx.fillRect(x, y, w, h / 2);
    ctx.fillStyle = shade;
    ctx.fillRect(x, y + h / 2, w, h / 2);
  } else {
    ctx.fillStyle = lit;
    ctx.fillRect(x, y, w / 2, h);
    ctx.fillStyle = shade;
    ctx.fillRect(x + w / 2, y, w / 2, h);
  }
  if (detail) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ridgeAlongX) {
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
    } else {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}

function shadowRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  u: number,
): void {
  const d = Math.max(1, u * 0.05);
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + d, y + d * 1.3, w, h);
}

/** A raised platform strip with a lighter kerb edge on the track side. `side` = -1 (above the
 * track in the local frame) or +1 (below). */
function platform(
  ctx: CanvasRenderingContext2D,
  u: number,
  len: number,
  near: number,
  thick: number,
  side: -1 | 1,
  detail: boolean,
): void {
  const y = side < 0 ? -(near + thick) : near;
  ctx.fillStyle = PLATFORM;
  ctx.fillRect(-len / 2, y, len, thick);
  if (detail) {
    ctx.fillStyle = PLATFORM_EDGE;
    const e = Math.max(1, u * 0.025);
    ctx.fillRect(-len / 2, side < 0 ? -near - e : near, len, e);
  }
}

function canopy(
  ctx: CanvasRenderingContext2D,
  u: number,
  len: number,
  near: number,
  thick: number,
  side: -1 | 1,
  detail: boolean,
): void {
  const y = side < 0 ? -(near + thick) : near;
  const inset = thick * 0.12;
  shadowRect(ctx, -len / 2, y + inset, len, thick - inset * 2, u);
  ctx.fillStyle = CANOPY;
  ctx.fillRect(-len / 2, y + inset, len, thick - inset * 2);
  if (detail) {
    ctx.fillStyle = CANOPY_RIDGE;
    const rh = Math.max(1, thick * 0.18);
    ctx.fillRect(-len / 2, y + thick / 2 - rh / 2, len, rh);
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    const posts = 5;
    for (let i = 0; i < posts; i++) {
      const px = -len / 2 + (len * (i + 0.5)) / posts;
      ctx.fillRect(px - 0.5, y + inset, 1, thick - inset * 2);
    }
  }
}

/** Depot: a small wooden hut with a red gabled roof and a short low platform. */
function drawDepot(
  ctx: CanvasRenderingContext2D,
  u: number,
  near: number,
  side: -1 | 1,
  detail: boolean,
): void {
  platform(ctx, u, u * 0.56, near, u * 0.1, side, detail);
  const w = u * 0.34;
  const h = u * 0.24;
  const gap = near + u * 0.1 + u * 0.03;
  const y = side < 0 ? -(gap + h) : gap;
  const x = -w / 2;
  shadowRect(ctx, x, y, w, h, u);
  ctx.fillStyle = WOOD;
  ctx.fillRect(x - u * 0.02, y - u * 0.02, w + u * 0.04, h + u * 0.04);
  gable(ctx, x, y, w, h, WOOD_ROOF_LIT, WOOD_ROOF_SHADE, detail, true);
  if (detail) {
    // Chimney.
    ctx.fillStyle = "#4A3A32";
    ctx.fillRect(x + w * 0.7, y + h * 0.2, u * 0.05, u * 0.05);
  }
}

/** Station: brick building with a slate roof, platforms with canopies on both sides of the track. */
function drawStationBody(
  ctx: CanvasRenderingContext2D,
  u: number,
  near: number,
  side: -1 | 1,
  detail: boolean,
  bothSides: boolean,
): void {
  const len = u * 0.94;
  const pt = u * 0.14;
  platform(ctx, u, len, near, pt, side, detail);
  canopy(ctx, u, len * 0.86, near + pt * 0.05, pt * 0.9, side, detail);
  if (bothSides) {
    platform(ctx, u, len, near, pt, side === -1 ? 1 : -1, detail);
    canopy(ctx, u, len * 0.86, near + pt * 0.05, pt * 0.9, side === -1 ? 1 : -1, detail);
  }
  const w = u * 0.7;
  const h = u * 0.3;
  const gap = near + pt + u * 0.03;
  const y = side < 0 ? -(gap + h) : gap;
  const x = -w / 2;
  shadowRect(ctx, x, y, w, h, u);
  ctx.fillStyle = BRICK;
  ctx.fillRect(x - u * 0.02, y - u * 0.02, w + u * 0.04, h + u * 0.04);
  gable(ctx, x, y, w, h, BRICK_ROOF_LIT, BRICK_ROOF_SHADE, detail, true);
  if (detail) {
    // Cross-gable in the middle and two chimneys.
    gable(
      ctx,
      -u * 0.09,
      y - u * 0.01,
      u * 0.18,
      h + u * 0.02,
      BRICK_ROOF_LIT,
      BRICK_ROOF_SHADE,
      true,
      false,
    );
    ctx.fillStyle = "#3A2B26";
    ctx.fillRect(x + w * 0.16, y + h * 0.18, u * 0.05, u * 0.05);
    ctx.fillRect(x + w * 0.8, y + h * 0.18, u * 0.05, u * 0.05);
  }
}

/** Terminal: an arched train shed drawn as a ribbed roof spanning the tracks, with a head building
 * and a clock tower behind it. */
function drawTerminal(
  ctx: CanvasRenderingContext2D,
  u: number,
  side: -1 | 1,
  detail: boolean,
  half: number,
): void {
  const len = u * 1.0;
  const span = Math.max(half, u * 0.27);
  // Head building behind the shed.
  const bw = u * 0.86;
  const bh = u * 0.3;
  const by = side < 0 ? -(span + u * 0.03 + bh) : span + u * 0.03;
  shadowRect(ctx, -bw / 2, by, bw, bh, u);
  ctx.fillStyle = BRICK;
  ctx.fillRect(-bw / 2 - u * 0.02, by - u * 0.02, bw + u * 0.04, bh + u * 0.04);
  gable(ctx, -bw / 2, by, bw, bh, BRICK_ROOF_LIT, BRICK_ROOF_SHADE, detail, true);
  // The shed: translucent-looking roof so the rails read through it.
  shadowRect(ctx, -len / 2, -span, len, span * 2, u);
  ctx.fillStyle = SHED_ROOF;
  ctx.fillRect(-len / 2, -span, len, span * 2);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#B7C6D6"; // skylight sheen over the whole roof
  ctx.fillRect(-len / 2, -span, len, span * 0.9);
  ctx.restore();
  if (detail) {
    ctx.strokeStyle = SHED_RIB;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ribs = 9;
    for (let i = 0; i <= ribs; i++) {
      const x = -len / 2 + (len * i) / ribs;
      ctx.moveTo(x, -span);
      ctx.lineTo(x, span);
    }
    ctx.stroke();
    ctx.fillStyle = SHED_RIDGE;
    ctx.fillRect(-len / 2, -Math.max(0.5, u * 0.012), len, Math.max(1, u * 0.024));
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.strokeRect(-len / 2 + 0.5, -span + 0.5, len - 1, span * 2 - 1);
  }
  // Clock tower.
  const tw = u * 0.13;
  const ty = by + bh / 2 - tw / 2;
  ctx.fillStyle = BRICK_ROOF_SHADE;
  ctx.fillRect(-tw / 2, ty, tw, tw);
  if (detail) {
    ctx.fillStyle = "#EDE6D2";
    ctx.beginPath();
    ctx.arc(0, ty + tw / 2, tw * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draws the station at (cx, cy) with the track running along `angle`. `near` is how far the
 * platform's inner edge sits from the track centre line (a passing loop pushes it beyond the outer
 * lane); `side` is which side of the track the building stands on. */
export function drawStationBuilding(
  ctx: CanvasRenderingContext2D,
  type: StationType,
  cx: number,
  cy: number,
  u: number,
  angle: number,
  near: number,
  side: -1 | 1,
  loop: boolean,
): void {
  const detail = u >= DETAIL_SIZE;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  if (type === "depot") drawDepot(ctx, u, near, side, detail);
  else if (type === "station") drawStationBody(ctx, u, near, side, detail, !loop);
  else drawTerminal(ctx, u, side, detail, loop ? near : u * 0.27);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Improvements
// ---------------------------------------------------------------------------------------------

/** Distinct top-down miniatures next to the station. Drawn in screen space (not rotated) with
 * `r` ≈ half the marker footprint. */
export function drawImprovementMarker(
  ctx: CanvasRenderingContext2D,
  type: StationMarkerType,
  cx: number,
  cy: number,
  r: number,
): void {
  const detail = r >= 4;
  const sh = Math.max(1, r * 0.22);
  ctx.save();
  switch (type) {
    case "waterTower": {
      // Round tank on legs: shadow, four leg stubs, lit tank with a rim and a conical cap.
      ctx.fillStyle = SHADOW;
      ctx.beginPath();
      ctx.ellipse(cx + sh, cy + sh * 1.6, r * 0.8, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      if (detail) {
        ctx.strokeStyle = "#3B3A36";
        ctx.lineWidth = Math.max(1, r * 0.15);
        ctx.beginPath();
        for (const [dx, dy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          ctx.moveTo(cx + dx * r * 0.45, cy + dy * r * 0.45);
          ctx.lineTo(cx + dx * r * 0.75, cy + dy * r * 0.75);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "#7B5A3C";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#A87C52";
      ctx.beginPath();
      ctx.arc(cx - r * 0.12, cy - r * 0.12, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
      if (detail) {
        ctx.fillStyle = "#3A82C4";
        ctx.beginPath();
        ctx.arc(cx - r * 0.2, cy - r * 0.2, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "engineShed": {
      // A long low roof with smoke vents.
      const w = r * 2.1;
      const h = r * 1.25;
      shadowRectPx(ctx, cx - w / 2, cy - h / 2, w, h, sh);
      gable(ctx, cx - w / 2, cy - h / 2, w, h, "#7C8794", "#535E6B", detail, true);
      ctx.fillStyle = "#23272C";
      for (const dx of [-0.55, 0, 0.55]) {
        ctx.fillRect(cx + dx * r - r * 0.12, cy - h / 2 + r * 0.12, r * 0.24, r * 0.22);
      }
      if (detail) {
        ctx.fillStyle = "#23272C"; // doors at the front end
        ctx.fillRect(cx - w / 2, cy - h / 2 + h * 0.2, Math.max(1, r * 0.12), h * 0.6);
      }
      break;
    }
    case "warehouse": {
      // A large goods shed: wide pitched roof, loading-dock strip.
      const w = r * 2.2;
      const h = r * 1.5;
      shadowRectPx(ctx, cx - w / 2, cy - h / 2, w, h, sh);
      gable(ctx, cx - w / 2, cy - h / 2, w, h, "#B8AE96", "#8E846E", detail, true);
      if (detail) {
        ctx.fillStyle = "#5F4A32";
        ctx.fillRect(cx - w / 2, cy + h / 2 - r * 0.22, w, r * 0.22);
      }
      break;
    }
    case "hotel": {
      const w = r * 1.25;
      const h = r * 1.5;
      shadowRectPx(ctx, cx - w / 2, cy - h / 2, w, h, sh);
      gable(ctx, cx - w / 2, cy - h / 2, w, h, "#C86F55", "#96432F", detail, false);
      if (detail) {
        ctx.fillStyle = "#F3D68C";
        for (const dy of [-0.35, 0.05, 0.45]) ctx.fillRect(cx - w / 2 - 1, cy + dy * r, 1, r * 0.2);
      }
      break;
    }
    case "postOffice": {
      const w = r * 1.5;
      const h = r * 1.1;
      shadowRectPx(ctx, cx - w / 2, cy - h / 2, w, h, sh);
      gable(ctx, cx - w / 2, cy - h / 2, w, h, "#D2564A", "#9D372F", detail, true);
      if (detail) {
        ctx.fillStyle = "#F4EFE0";
        ctx.fillRect(cx - r * 0.25, cy - r * 0.16, r * 0.5, r * 0.32);
      }
      break;
    }
    case "coldStorage": {
      const w = r * 1.5;
      const h = r * 1.3;
      shadowRectPx(ctx, cx - w / 2, cy - h / 2, w, h, sh);
      gable(ctx, cx - w / 2, cy - h / 2, w, h, "#DCE9F2", "#A9C1D3", detail, true);
      if (detail) {
        ctx.fillStyle = "#2E5E8C";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "freightYard": {
      // Two short sidings with ties.
      ctx.strokeStyle = "#5A4A3A";
      ctx.lineWidth = Math.max(1, r * 0.4);
      ctx.setLineDash([Math.max(1, r * 0.12), Math.max(1, r * 0.3)]);
      ctx.beginPath();
      for (const dy of [-0.4, 0.4]) {
        ctx.moveTo(cx - r * 0.95, cy + dy * r);
        ctx.lineTo(cx + r * 0.95, cy + dy * r);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#C9CDD2";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const dy of [-0.55, -0.25, 0.25, 0.55]) {
        ctx.moveTo(cx - r * 0.95, cy + dy * r);
        ctx.lineTo(cx + r * 0.95, cy + dy * r);
      }
      ctx.stroke();
      break;
    }
    case "livestockPens": {
      ctx.fillStyle = "rgba(120, 90, 50, 0.35)";
      ctx.fillRect(cx - r * 0.8, cy - r * 0.6, r * 1.6, r * 1.2);
      ctx.strokeStyle = "#7A5B36";
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.strokeRect(cx - r * 0.8, cy - r * 0.6, r * 1.6, r * 1.2);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.6);
      ctx.lineTo(cx, cy + r * 0.6);
      ctx.stroke();
      break;
    }
    default:
      ctx.fillStyle = "#B8BDC4";
      ctx.fillRect(cx - r * 0.5, cy - r * 0.5, r, r);
  }
  ctx.restore();
}

function shadowRectPx(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  d: number,
): void {
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + d, y + d * 1.3, w, h);
}
