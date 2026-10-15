/** Debug gallery (`?debug=1&gallery=1`): every locomotive and car type on a light and a dark
 * background, labelled. Used for screenshots and visual review of the side-view art. */

import { CARGO, CARGO_TYPES } from "../../data/cargo";
import { LOCOMOTIVES } from "../../data/trains";
import { carSideCanvas, consistSideCanvas, locoSideCanvas } from "./index";
import type { EraBucket } from "./livery";

const LIGHT = "#F1EBDD";
const DARK = "#1B2027";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

function card(
  bg: string,
  fg: string,
  label: string,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  height: number,
): HTMLElement {
  const c = el(
    "div",
    `background:${bg};color:${fg};padding:8px 12px 6px;border-radius:8px;display:inline-block;margin:4px;vertical-align:top`,
  );
  c.appendChild(
    el("div", "font:11px/14px system-ui,sans-serif;opacity:.75;margin-bottom:2px", label),
  );
  // The art cache hands out shared canvases: copy so each card owns its pixels.
  const cv = document.createElement("canvas");
  cv.width = canvas.width;
  cv.height = canvas.height;
  cv.getContext("2d")?.drawImage(canvas as CanvasImageSource, 0, 0);
  cv.style.display = "block";
  cv.style.width = `${Math.round(cv.width / (window.devicePixelRatio || 1))}px`;
  cv.style.height = `${height}px`;
  c.appendChild(cv);
  return c;
}

function pair(
  label: string,
  make: () => HTMLCanvasElement | OffscreenCanvas,
  height: number,
): HTMLElement {
  const row = el("div", "display:inline-flex;margin-right:6px");
  row.appendChild(card(LIGHT, "#222", label, make(), height));
  row.appendChild(card(DARK, "#ddd", label, make(), height));
  return row;
}

/** `?debug=1&gallery=1&sheet=1`: every locomotive on an aged-paper print plate, with name and year, plus a row of
 * cars: the period "builder's sheet" used for the Phase 49 review screenshot. */
function mountEngineSheet(height: number): void {
  document.body.style.cssText =
    "margin:0;background:var(--ink-900);height:auto;overflow:visible;position:static";
  document.documentElement.style.cssText = "height:auto;overflow:visible";
  document.getElementById("app")?.remove();
  const root = el(
    "div",
    "padding:10px 14px 14px;font-family:var(--font-ui);min-width:780px;max-width:1100px;color:var(--text)",
  );
  root.id = "gallery";
  document.body.appendChild(root);
  root.appendChild(
    el(
      "div",
      "font:700 13px var(--font-display);letter-spacing:.2em;text-transform:uppercase;color:var(--paper);margin:0 0 8px;border-bottom:3px double var(--brass-dk);padding-bottom:6px",
      "Rolling stock",
    ),
  );
  const grid = el("div", "display:grid;grid-template-columns:repeat(4,1fr);gap:8px");
  root.appendChild(grid);
  const plate = (label: string, sub: string, canvas: HTMLCanvasElement | OffscreenCanvas): void => {
    const d = el(
      "div",
      "background:radial-gradient(ellipse at 50% 35%,var(--card-paper-hi),var(--card-paper) 55%,var(--card-paper-edge) 130%);box-shadow:inset 0 0 0 3px var(--card-paper),inset 0 0 0 4px var(--card-rule);padding:8px 8px 4px;display:flex;flex-direction:column;align-items:center;color:#2a241a",
    );
    const cv = document.createElement("canvas");
    cv.width = canvas.width;
    cv.height = canvas.height;
    cv.getContext("2d")?.drawImage(canvas as CanvasImageSource, 0, 0);
    cv.style.cssText = `display:block;width:${Math.round(cv.width / (window.devicePixelRatio || 1))}px;height:${height}px;max-width:100%;object-fit:contain`;
    d.appendChild(cv);
    d.appendChild(el("div", "font:700 12px var(--font-display);margin-top:2px", label));
    d.appendChild(el("div", "font:10px var(--font-ui);letter-spacing:.1em;opacity:.7", sub));
    grid.appendChild(d);
  };
  for (const def of LOCOMOTIVES)
    plate(def.name, `${def.type} · ${def.introYear}`, locoSideCanvas(def, height));
  const cargos = [
    "passengers",
    "mail",
    "coal",
    "goods",
    "livestock",
    "oil",
    "wood",
    "steel",
  ] as const;
  for (const cargo of cargos)
    plate(
      CARGO[cargo].carLabel,
      "mid",
      carSideCanvas(cargo, "mid", cargo === "passengers" ? 0 : 1, height),
    );
}

export function mountGallery(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("sheet")) {
    mountEngineSheet(Number(params.get("h") ?? 64));
    return;
  }
  const height = Number(params.get("h") ?? 72);
  const only = params.get("only");
  document.body.style.cssText =
    "margin:0;background:#8b8f96;height:auto;overflow:visible;position:static";
  document.documentElement.style.cssText = "height:auto;overflow:visible";
  const root = el("div", "padding:12px;font-family:system-ui,sans-serif;min-width:1500px");
  root.id = "gallery";
  document.getElementById("app")?.remove();
  document.body.appendChild(root);

  const section = (id: string, title: string): HTMLElement => {
    const s = el("section", "margin-bottom:24px");
    s.id = id;
    s.appendChild(el("h2", "margin:0 0 6px;font:600 16px system-ui,sans-serif;color:#fff", title));
    root.appendChild(s);
    return s;
  };

  const steam = section("gallery-steam", "Steam");
  for (const def of LOCOMOTIVES.filter(
    (l) => l.type === "steam" && (!only || only.split(",").includes(l.id)),
  )) {
    steam.appendChild(
      pair(`${def.name} · ${def.introYear}`, () => locoSideCanvas(def, height), height),
    );
  }
  const modern = section("gallery-modern", "Diesel & electric");
  for (const def of LOCOMOTIVES.filter(
    (l) => l.type !== "steam" && (!only || only.split(",").includes(l.id)),
  )) {
    modern.appendChild(
      pair(`${def.name} · ${def.introYear}`, () => locoSideCanvas(def, height), height),
    );
  }
  const consists = section("gallery-consists", "Consists");
  const eras: Array<[EraBucket, number]> = [
    ["early", 1850],
    ["mid", 1900],
    ["modern", 1970],
  ];
  const mk = (
    loco: string,
    year: number,
    cargos: Array<[(typeof CARGO_TYPES)[number], number]>,
  ): HTMLElement =>
    pair(
      `${loco} · ${year}`,
      () =>
        consistSideCanvas(
          { locoModelId: loco, year, cars: cargos.map(([c, f]) => ({ cargoType: c, fill01: f })) },
          height,
        ),
      height,
    );
  consists.appendChild(
    mk("american-4-4-0", 1855, [
      ["passengers", 1],
      ["mail", 1],
      ["passengers", 0.5],
    ]),
  );
  consists.appendChild(
    mk("mikado-2-8-2", 1925, [
      ["coal", 1],
      ["coal", 0.6],
      ["goods", 1],
      ["oil", 1],
    ]),
  );
  consists.appendChild(
    mk("high-speed-trainset", 1990, [
      ["passengers", 1],
      ["passengers", 1],
      ["mail", 1],
    ]),
  );

  const cars = section("gallery-cars", "Cars (empty · half · full)");
  for (const [era] of eras.filter(([e]) => !params.get("era") || e === params.get("era"))) {
    cars.appendChild(
      el("h3", "margin:8px 0 2px;font:600 13px system-ui;color:#fff", `era: ${era}`),
    );
    for (const cargo of CARGO_TYPES) {
      const row = el("div", "display:flex;flex-wrap:wrap");
      for (const [bg, fg] of [
        [LIGHT, "#222"],
        [DARK, "#ddd"],
      ] as const) {
        for (const fill of [0, 0.5, 1]) {
          row.appendChild(
            card(
              bg,
              fg,
              `${CARGO[cargo].name} · ${era} · ${Math.round(fill * 100)}%`,
              carSideCanvas(cargo, era, fill, height),
              height,
            ),
          );
        }
      }
      cars.appendChild(row);
    }
  }
}
