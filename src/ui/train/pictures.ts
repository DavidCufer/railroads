/** DOM wrappers around the side-view art (src/render/art): crisp canvases sized in CSS px. The art
 * module caches offscreen canvases; the DOM needs its own element per use, so we blit a copy. */
import {
  consistLayout,
  consistSideCanvas,
  ART_HEIGHT_UNITS,
  carSideCanvas,
  drawLocoSide,
  eraBucket,
  locoSideCanvas,
  locoWidthUnits,
  type ConsistLayout,
  type ConsistSpec,
} from "../../render/art";
import { devicePixelRatioSafe, type ArtCanvas } from "../../render/art/canvas";
import type { CargoType } from "../../data/cargo";
import type { LocomotiveDef } from "../../data/trains";
import { h } from "../h";

function blit(src: ArtCanvas, className: string, label?: string): HTMLCanvasElement {
  const dpr = devicePixelRatioSafe();
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.className = className;
  c.style.width = `${src.width / dpr}px`;
  c.style.height = `${src.height / dpr}px`;
  if (label) {
    c.setAttribute("role", "img");
    c.setAttribute("aria-label", label);
  } else {
    c.setAttribute("aria-hidden", "true");
  }
  const ctx = c.getContext("2d");
  if (ctx) ctx.drawImage(src as CanvasImageSource, 0, 0);
  return c;
}

/** The locomotive's side view, `height` CSS px tall (its width follows the drawing). */
export function locoPicture(def: LocomotiveDef, height: number, label?: string): HTMLCanvasElement {
  return blit(locoSideCanvas(def, height), "loco-pic", label ?? def.name);
}

/** A loco picture inside a fixed-size box (`width` × `height` CSS px), scaled down to fit, right-aligned
 * like the drawings face right. Used for card thumbs so rows line up regardless of engine length. */
export function locoThumb(def: LocomotiveDef, boxW: number, boxH: number): HTMLElement {
  // Render at a height that makes the drawing fit the box, capped by boxH.
  const naturalW = (locoWidthUnits(def) * boxH) / ART_HEIGHT_UNITS;
  const height = naturalW > boxW ? Math.floor((boxW * boxH) / naturalW) : boxH;
  return h(
    "span",
    { className: "loco-thumb", style: { width: `${boxW}px`, height: `${boxH}px` } },
    locoPicture(def, Math.max(12, height)),
  );
}

/** Silhouette scaled to fit a fixed box, like `locoThumb`. */
export function locoSilhouetteThumb(def: LocomotiveDef, boxW: number, boxH: number): HTMLElement {
  const naturalW = (locoWidthUnits(def) * boxH) / ART_HEIGHT_UNITS;
  const height = naturalW > boxW ? Math.floor((boxW * boxH) / naturalW) : boxH;
  return h(
    "span",
    { className: "loco-thumb", style: { width: `${boxW}px`, height: `${boxH}px` } },
    locoSilhouette(def, Math.max(12, height)),
  );
}

const silhouetteCache = new Map<string, HTMLCanvasElement>();

/** Dark silhouette of a future model (roster: "only the year is shown"). */
export function locoSilhouette(def: LocomotiveDef, height: number): HTMLCanvasElement {
  const dpr = devicePixelRatioSafe();
  const key = `${def.id}@${height}x${dpr}`;
  let base = silhouetteCache.get(key);
  if (!base) {
    const w = Math.max(1, Math.round((locoWidthUnits(def) * height * dpr) / ART_HEIGHT_UNITS));
    base = document.createElement("canvas");
    base.width = w;
    base.height = Math.max(1, Math.round(height * dpr));
    const ctx = base.getContext("2d");
    if (ctx) {
      drawLocoSide(ctx, def, 0, 0, height * dpr, { ground: false });
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#0e1319";
      ctx.fillRect(0, 0, base.width, base.height);
    }
    silhouetteCache.set(key, base);
  }
  return blit(base, "loco-pic loco-silhouette");
}

export function carPicture(
  cargo: CargoType,
  year: number,
  fill01: number,
  height: number,
  label?: string,
): HTMLCanvasElement {
  return blit(carSideCanvas(cargo, eraBucket(year), fill01, height), "car-pic", label);
}

export interface ConsistStripCar {
  cargoType: CargoType;
  fill01: number;
}

export interface ConsistStrip {
  root: HTMLElement;
  /** Absolutely positioned slot per car (index like `cars`), for overlays (meters, ✕ badges, taps). */
  slots: HTMLElement[];
  loco: HTMLElement;
  layout: ConsistLayout;
}

/** Whole train in side view inside a horizontally scrollable strip; scrolled so the locomotive
 * (right end) is visible. `slots` are positioned over each car; `pad` px of headroom above and
 * below hold pictograms / meters. */
export function consistStrip(
  locoModelId: string,
  cars: readonly ConsistStripCar[],
  year: number,
  height: number,
  opts: { padTop?: number; padBottom?: number } = {},
): ConsistStrip {
  const spec: ConsistSpec = { locoModelId, cars: [...cars], year };
  const layout = consistLayout(spec);
  const canvas = blit(consistSideCanvas(spec, height), "consist-pic");
  const u = height / ART_HEIGHT_UNITS;
  const padTop = opts.padTop ?? 0;
  const padBottom = opts.padBottom ?? 0;
  const inner = h(
    "div",
    {
      className: "consist-inner",
      style: {
        width: `${layout.totalUnits * u}px`,
        height: `${height + padTop + padBottom}px`,
        paddingTop: `${padTop}px`,
      },
    },
    canvas,
  );
  const slots = cars.map((_, i) => {
    const l = layout.cars[i] as { x: number; w: number };
    const slot = h("div", {
      className: "consist-slot",
      style: {
        left: `${l.x * u}px`,
        width: `${l.w * u}px`,
        top: `${padTop}px`,
        height: `${height}px`,
      },
    });
    inner.appendChild(slot);
    return slot;
  });
  const locoSlot = h("div", {
    className: "consist-slot consist-loco-slot",
    style: {
      left: `${layout.loco.x * u}px`,
      width: `${layout.loco.w * u}px`,
      top: `${padTop}px`,
      height: `${height}px`,
      pointerEvents: "none",
    },
  });
  inner.appendChild(locoSlot);
  const root = h("div", { className: "consist-strip" }, inner);
  // Show the front of the train (the locomotive) first.
  requestAnimationFrame(() => {
    root.scrollLeft = root.scrollWidth;
  });
  return { root, slots, loco: locoSlot, layout };
}
