/**
 * DOM wrappers around the side-view art module (STYLE §9, §11): the art cache hands out shared
 * offscreen canvases, so every placement copies pixels into its own <canvas> sized in CSS px.
 * Everything here is display-only (renderers never mutate state).
 */
import { CARGO, type CargoType } from "../data/cargo";
import { locomotiveById, type LocomotiveDef } from "../data/trains";
import {
  ART_HEIGHT_UNITS,
  carSideCanvas,
  carWidthUnits,
  eraBucket,
  locoSideCanvas,
  locoWidthUnits,
  wheelArrangementGlyph,
} from "../render/art";
import type { ArtCanvas } from "../render/art/canvas";
import { h } from "./h";
import { chipTextColor } from "./infoPanels";
import { icon, cargoIcon } from "./icons";

/** Copies a cached art canvas into a fresh DOM canvas (CSS size = backing size / dpr). */
export function artCanvasEl(src: ArtCanvas, className = ""): HTMLCanvasElement {
  const dpr = window.devicePixelRatio || 1;
  const cv = document.createElement("canvas");
  cv.width = src.width;
  cv.height = src.height;
  cv.getContext("2d")?.drawImage(src as CanvasImageSource, 0, 0);
  cv.className = `art-canvas${className ? ` ${className}` : ""}`;
  cv.style.width = `${(src.width / dpr).toFixed(1)}px`;
  cv.style.height = `${(src.height / dpr).toFixed(1)}px`;
  return cv;
}

/** A locomotive side view `height` CSS px tall. */
export function locoArt(def: LocomotiveDef, height: number, className = ""): HTMLCanvasElement {
  const el = artCanvasEl(locoSideCanvas(def, height), className);
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", def.name);
  return el;
}

/** A locomotive picture for a list/thumb slot; unknown ids fall back to a plain steam icon. */
export function locoThumbById(locoId: string, height: number): Node {
  const def = locomotiveById(locoId);
  return def ? locoArt(def, height) : icon("steam");
}

/** A car side view. */
export function carArt(
  cargo: CargoType,
  year: number,
  fill01: number,
  height: number,
): HTMLCanvasElement {
  const el = artCanvasEl(carSideCanvas(cargo, eraBucket(year), fill01, height));
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", CARGO[cargo].carLabel);
  return el;
}

/** The locomotive on a lit rail card — the "hero" picture. */
export function heroPlate(def: LocomotiveDef, height: number): HTMLElement {
  return h("div", { className: "hero-plate" }, locoArt(def, height));
}

export interface StripCar {
  cargoType: CargoType;
  /** 0..1 */
  fill01: number;
  /** Shown as a cargo pictogram above the car when > 0. */
  loaded?: boolean;
}

export interface ConsistStripOptions {
  locoId: string;
  cars: readonly StripCar[];
  year: number;
  /** Drawing height in CSS px. */
  height: number;
  /** Thin fill meter under each car (train panel). */
  fillMeters?: boolean;
  /** Makes each car a button with a small ✕ badge (consist builder). */
  onCarTap?: (index: number) => void;
  removeLabel?: (index: number) => string;
}

/** The whole train in side view: cars (rear, left) … locomotive (front, right), couplers in
 * between, horizontally scrollable when long. Car 0 is the one next to the locomotive. */
export function consistStrip(options: ConsistStripOptions): HTMLElement {
  const def = locomotiveById(options.locoId);
  const era = eraBucket(options.year);
  const u = options.height / ART_HEIGHT_UNITS;
  const gapPx = Math.max(2, Math.round(1.2 * u));
  const row = h("div", { className: "consist-row" });
  row.style.setProperty("--u", `${u.toFixed(3)}px`);
  row.style.setProperty("--gap", `${gapPx}px`);
  for (let i = options.cars.length - 1; i >= 0; i--) {
    const car = options.cars[i] as StripCar;
    const box = h(
      "div",
      { className: "cv-box" },
      carArt(car.cargoType, options.year, car.fill01, options.height),
    );
    box.style.width = `${Math.round(carWidthUnits(car.cargoType, era) * u)}px`;
    const badge = options.onCarTap
      ? h("span", { className: "cv-remove" }, icon("close", "icon-xs"))
      : null;
    const kids = [
      car.loaded ? h("span", { className: "cv-cargo" }, cargoBadge(car.cargoType)) : null,
      box,
      badge,
      options.fillMeters
        ? h(
            "div",
            { className: "cv-meter" },
            h("div", {
              className: "cv-meter-fill",
              style: { width: `${Math.round(Math.max(0, Math.min(1, car.fill01)) * 100)}%` },
            }),
          )
        : null,
    ];
    row.appendChild(
      options.onCarTap
        ? h(
            "button",
            {
              className: "consist-veh consist-car-btn",
              "aria-label": options.removeLabel?.(i) ?? CARGO[car.cargoType].carLabel,
              "data-cargo": car.cargoType,
              onClick: () => options.onCarTap?.(i),
            },
            ...kids,
          )
        : h("div", { className: "consist-veh", "data-cargo": car.cargoType }, ...kids),
    );
  }
  if (def) {
    const box = h("div", { className: "cv-box cv-loco" }, locoArt(def, options.height));
    box.style.width = `${Math.round(locoWidthUnits(def) * u)}px`;
    row.appendChild(h("div", { className: "consist-veh consist-loco-veh" }, box));
  }
  return h("div", { className: "consist-strip" }, row);
}

/** The enthusiast's wheel-arrangement diagram ("oOOo") for a steam locomotive; null otherwise. */
export function wheelGlyphEl(def: LocomotiveDef): HTMLElement | null {
  if (def.type !== "steam") return null;
  const svg = wheelArrangementGlyph(def.name);
  if (!svg) return null;
  const el = h("span", { className: "whyte" });
  el.innerHTML = svg;
  return el;
}

/** Traction-type icon name for a locomotive. */
export function tractionIcon(def: Pick<LocomotiveDef, "type">): "steam" | "diesel" | "electrify" {
  return def.type === "electric" ? "electrify" : def.type;
}

/** A cargo pictogram on a solid cargo-colour tile with a contrasting glyph (readable on any panel). */
export function cargoBadge(cargo: CargoType, className = ""): HTMLElement {
  const el = cargoIcon(cargo, className);
  const color = CARGO[cargo].color;
  el.style.background = color;
  el.style.color = chipTextColor(color);
  return el;
}
