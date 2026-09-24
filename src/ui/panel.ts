/**
 * Slide-in side panel (SPEC §10.1: "Panels slide in from the right (max 45% width)"). Used for
 * Station/Train/City/Industry/Finance/... panels. Registers itself with the Android back button
 * while open (SPEC/PLAN Phase 2).
 */
import { h } from "./h";
import { pushBackHandler } from "./backButton";
import { strings } from "./strings";

let currentPanel: { root: HTMLElement; unregisterBack: () => void } | null = null;

export interface PanelOptions {
  title: string;
  body: Node[];
}

/** Opens a panel, replacing any panel currently open. */
export function openPanel(container: HTMLElement, options: PanelOptions): void {
  closePanel();

  const close = (): void => closePanel();
  const root = h(
    "div",
    { className: "panel" },
    h(
      "div",
      { className: "panel-header" },
      h("span", { className: "panel-title" }, options.title),
      h(
        "button",
        { className: "panel-close", onClick: close, "aria-label": strings.ui.close },
        "✕",
      ),
    ),
    h("div", { className: "panel-body" }, ...options.body),
  );
  container.appendChild(root);
  // Force a reflow so the slide-in transition plays instead of jumping straight to open.
  void root.offsetWidth;
  root.classList.add("panel-open");

  const unregisterBack = pushBackHandler(close);
  currentPanel = { root, unregisterBack };
}

export function closePanel(): void {
  if (!currentPanel) return;
  const { root, unregisterBack } = currentPanel;
  currentPanel = null;
  unregisterBack();
  root.classList.remove("panel-open");
  window.setTimeout(() => root.remove(), 220);
}

export function isPanelOpen(): boolean {
  return currentPanel !== null;
}
