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
  /** Serialised content, to tell whether a live re-render changed anything. */
  sig: string;
  live: (() => void) | undefined;
} | null = null;

/** True while a panel's `live` callback runs: `openPanel` then keeps the current DOM when nothing changed. */
let softRender = false;
let liveTimer: number | undefined;
const LIVE_REFRESH_MS = 900;

/** Typing, dropdowns and focused buttons are never interrupted by a live refresh. */
function isInteracting(root: HTMLElement): boolean {
  const el = document.activeElement;
  if (!el || !root.contains(el)) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

function liveTick(): void {
  const panel = currentPanel;
  if (!panel?.live) return;
  if (isInteracting(panel.root)) return;
  softRender = true;
  try {
    panel.live();
  } finally {
    softRender = false;
  }
}

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
  /** `bottom`: a bottom sheet across the map area (Phase 28B route step) instead of the right-hand
   * side panel; `className` adds modifier classes (e.g. the taller station-list mode). */
  placement?: "side" | "bottom" | undefined;
  className?: string | undefined;
  /** Re-renders the panel's dynamic parts (cash-dependent buttons, waiting cargo, …) about once per game day
   * while it is open: typically `() => render()` of the same panel. A refresh whose content is identical to what is
   * shown is dropped, so scroll position, hover and focus are untouched; one that changed keeps the scroll offset
   * (same `key`). Skipped while an input or dropdown inside the panel has focus. */
  live?: (() => void) | undefined;
}

/** Opens a panel, replacing any panel currently open. A replacement swaps in place (no slide-in
 * replay), so tab switches and re-renders after an action don't flash. */
export function openPanel(container: HTMLElement, options: PanelOptions): void {
  const previous = currentPanel;
  if (softRender && !(previous && options.key !== undefined && previous.key === options.key))
    return;
  const previousScroll =
    previous && options.key !== undefined && previous.key === options.key
      ? (previous.root.querySelector<HTMLElement>(".panel-body")?.scrollTop ?? 0)
      : 0;

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
  const root = h(
    "div",
    {
      className: `panel${options.placement === "bottom" ? " panel-bottom" : ""}${options.className ? ` ${options.className}` : ""}`,
    },
    ...children,
  );
  const sig = root.innerHTML;
  if (softRender && previous && previous.sig === sig) return;
  closePanel(true);
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
  currentPanel = {
    root,
    key: options.key,
    unregisterBack,
    onClose: options.onClose,
    sig,
    live: options.live,
  };
  if (options.live && liveTimer === undefined) {
    liveTimer = window.setInterval(liveTick, LIVE_REFRESH_MS);
  }
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
