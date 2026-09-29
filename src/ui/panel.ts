/**
 * Slide-in side panel (SPEC §10.1: "Panels slide in from the right (max 45% width)"). Used for
 * Station/Train/City/Industry/Finance/... panels. Registers itself with the Android back button
 * while open (SPEC/PLAN Phase 2).
 */
import { h } from "./h";
import { pushBackHandler } from "./backButton";
import { panelHeader } from "./components/panelHeader";

let currentPanel: {
  root: HTMLElement;
  key: string | undefined;
  unregisterBack: () => void;
  onClose: (() => void) | undefined;
} | null = null;

export interface PanelOptions {
  title: string | Node;
  /** Optional muted line under the title (STYLE §8.2), may contain inline icons. */
  subtitle?: string | Node | undefined;
  /** 40×40 thumb left of the title (cargo tile, station-type glyph, loco view…). */
  thumb?: Node | undefined;
  /** A sticky tab row (`components/tabs`) shown between the header and the scrolling body. */
  tabs?: Node | undefined;
  body: Node[];
  /** A pinned action row rendered as its own flex sibling *outside* `.panel-body`'s scrollport —
   * never scrolls, never overlaps body content. Use `components/footer` buttons. */
  footer?: Node[] | undefined;
  /** Called when this panel closes — including via its own ✕ button, the Android back button, or
   * a later `openPanel` call replacing it, not just an explicit `closePanel()` call — so a caller
   * with side state tied to the panel being open (e.g. Station mode's catchment overlay) can
   * clean it up in one place instead of every individual close path. */
  onClose?: () => void | undefined;
  /** Identifies "the same panel, re-rendered" (e.g. `station:3`). Re-opening with the key of the
   * panel currently shown keeps its scroll position. */
  key?: string | undefined;
}

/** Opens a panel, replacing any panel currently open. A replacement swaps in place (no slide-in
 * replay), so tab switches and re-renders after an action don't flash. */
export function openPanel(container: HTMLElement, options: PanelOptions): void {
  const previous = currentPanel;
  const previousScroll =
    previous && options.key !== undefined && previous.key === options.key
      ? (previous.root.querySelector<HTMLElement>(".panel-body")?.scrollTop ?? 0)
      : 0;
  closePanel(true);

  const close = (): void => closePanel();
  const children: Node[] = [
    panelHeader({
      title: options.title,
      subtitle: options.subtitle,
      thumb: options.thumb,
      onClose: close,
    }),
  ];
  if (options.tabs) children.push(options.tabs);
  children.push(h("div", { className: "panel-body" }, ...options.body));
  if (options.footer && options.footer.length > 0) {
    children.push(h("div", { className: "panel-actions" }, ...options.footer));
  }
  const root = h("div", { className: "panel" }, ...children);
  container.appendChild(root);
  if (previous) {
    root.classList.add("panel-instant", "panel-open");
    const body = root.querySelector<HTMLElement>(".panel-body");
    if (body) body.scrollTop = previousScroll;
  } else {
    // Force a reflow so the slide-in transition plays instead of jumping straight to open.
    void root.offsetWidth;
    root.classList.add("panel-open");
  }

  const unregisterBack = pushBackHandler(close);
  currentPanel = { root, key: options.key, unregisterBack, onClose: options.onClose };
}

/** Closes the open panel; `replacing` removes it immediately (no slide-out) for `openPanel`. */
export function closePanel(replacing = false): void {
  if (!currentPanel) return;
  const { root, unregisterBack, onClose } = currentPanel;
  currentPanel = null;
  unregisterBack();
  if (replacing) {
    root.remove();
  } else {
    root.classList.remove("panel-open");
    window.setTimeout(() => root.remove(), 220);
  }
  onClose?.();
}

export function isPanelOpen(): boolean {
  return currentPanel !== null;
}
