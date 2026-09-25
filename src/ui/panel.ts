/**
 * Slide-in side panel (SPEC §10.1: "Panels slide in from the right (max 45% width)"). Used for
 * Station/Train/City/Industry/Finance/... panels. Registers itself with the Android back button
 * while open (SPEC/PLAN Phase 2).
 */
import { h } from "./h";
import { pushBackHandler } from "./backButton";
import { strings } from "./strings";

let currentPanel: {
  root: HTMLElement;
  unregisterBack: () => void;
  onClose: (() => void) | undefined;
} | null = null;

export interface PanelOptions {
  title: string;
  body: Node[];
  /** A pinned action row (e.g. Build/Cancel, Buy/Cancel, Sell, Yearly Report) rendered as its own
   * flex sibling *outside* `.panel-body`'s scrollport — never scrolls, never overlaps body content
   * (Phase 7.1 review carry-over: passing these buttons as the last item of `body` and relying on
   * `.panel-actions`' own `position: sticky` to fake pinning had the same flaw the header fix below
   * addresses — sticky only "sticks" once scrolled *past* its natural flow position, so on a panel
   * whose content is much taller than the viewport it could render mid-scroll, overlapping later
   * rows instead of sitting at the bottom; see docs/screenshots/phase-7-finance-panel.png). */
  footer?: Node[];
  /** Called when this panel closes — including via its own ✕ button, the Android back button, or
   * a later `openPanel` call replacing it, not just an explicit `closePanel()` call — so a caller
   * with side state tied to the panel being open (e.g. Station mode's catchment overlay) can
   * clean it up in one place instead of every individual close path. */
  onClose?: () => void;
}

/** Opens a panel, replacing any panel currently open. */
export function openPanel(container: HTMLElement, options: PanelOptions): void {
  closePanel();

  const close = (): void => closePanel();
  const children = [
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
  ];
  if (options.footer && options.footer.length > 0) {
    children.push(h("div", { className: "panel-actions" }, ...options.footer));
  }
  const root = h("div", { className: "panel" }, ...children);
  container.appendChild(root);
  // Force a reflow so the slide-in transition plays instead of jumping straight to open.
  void root.offsetWidth;
  root.classList.add("panel-open");

  const unregisterBack = pushBackHandler(close);
  currentPanel = { root, unregisterBack, onClose: options.onClose };
}

export function closePanel(): void {
  if (!currentPanel) return;
  const { root, unregisterBack, onClose } = currentPanel;
  currentPanel = null;
  unregisterBack();
  root.classList.remove("panel-open");
  window.setTimeout(() => root.remove(), 220);
  onClose?.();
}

export function isPanelOpen(): boolean {
  return currentPanel !== null;
}
