/** Temporary dev-only controls (Phase 1): regenerate the map with a new seed / size. */
import type { MapSizeName } from "../data/mapGen";
import { strings } from "./strings";

export interface DebugControlsHandlers {
  onRegenerate: (seed: number, size: MapSizeName) => void;
}

const SIZE_OPTIONS: Array<{ value: MapSizeName; label: string }> = [
  { value: "small", label: strings.debug.sizeSmall },
  { value: "medium", label: strings.debug.sizeMedium },
  { value: "large", label: strings.debug.sizeLarge },
];

export function createDebugControls(
  container: HTMLElement,
  handlers: DebugControlsHandlers,
): HTMLElement {
  const panel = document.createElement("div");
  panel.id = "debug-controls";
  // Bottom-left, just clear of the build toolbar's column (which can span nearly the full
  // height below the top bar) and above the fps/tick debug overlay — never overlaps the top bar
  // or a slide-in panel's header/close button (both anchored top/right) — Phase 3 review.
  panel.style.cssText = [
    "position:absolute",
    "left:68px",
    "bottom:36px",
    "display:flex",
    "gap:6px",
    "align-items:center",
    "background:rgba(24,28,34,0.82)",
    "color:#fff",
    "padding:4px 6px",
    "border-radius:8px",
    "font:11px sans-serif",
    "z-index:6",
  ].join(";");

  const sizeSelect = document.createElement("select");
  sizeSelect.setAttribute("aria-label", strings.debug.sizeLabel);
  for (const opt of SIZE_OPTIONS) {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.label;
    sizeSelect.appendChild(el);
  }
  sizeSelect.value = "medium";

  const button = document.createElement("button");
  button.textContent = strings.debug.regenerate;
  button.addEventListener("click", () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    handlers.onRegenerate(seed, sizeSelect.value as MapSizeName);
  });

  panel.appendChild(sizeSelect);
  panel.appendChild(button);
  container.appendChild(panel);
  return panel;
}
