/** Toasts (SPEC §10.1: "Toasts for news (non-blocking) at top-center"). */
import { TOAST_MAX_VISIBLE } from "../data/news";
import { h } from "./h";

const TOAST_DURATION_MS = 3500;
/** Width of the left tool column (Track / Double / … / Info) plus its margin. */
const TOOL_COLUMN_PX = 68;
let toastContainer: HTMLElement | null = null;

function ensureContainer(container: HTMLElement): HTMLElement {
  if (toastContainer && toastContainer.isConnected) return toastContainer;
  toastContainer = h("div", { className: "toast-container" });
  container.appendChild(toastContainer);
  return toastContainer;
}

export type ToastKind = "info" | "warn";

/** Width of the open side panel (0 if none): toasts are laid out over the map area to its left. */
function openPanelInset(): number {
  const panel = document.querySelector(".panel.panel-open:not(.panel-bottom)");
  return panel ? Math.round(panel.getBoundingClientRect().width) : 0;
}

/** Lays the container out over the map area left of whatever panel is open *now*: a toast raised before a
 * panel opened (or kept alive while one closes) must still never cover its header (Bug 4). */
function syncInset(toastRoot: HTMLElement): void {
  const inset = openPanelInset();
  toastRoot.style.setProperty("--toast-right-inset", `${inset}px`);
  // With a panel open the map area is narrow: also keep clear of the tool column on the left.
  toastRoot.style.setProperty("--toast-left-inset", inset > 0 ? `${TOOL_COLUMN_PX}px` : "0px");
}

/** Identical messages raised within this window show once (Phase 41: the jam hint came twice in a row). */
const TOAST_DEDUPE_MS = 5000;
const recentToasts = new Map<string, number>();

let insetTimer: number | null = null;

function watchInset(toastRoot: HTMLElement): void {
  if (insetTimer !== null) return;
  insetTimer = window.setInterval(() => {
    syncInset(toastRoot);
    if (toastRoot.childElementCount === 0 || !toastRoot.isConnected) {
      if (insetTimer !== null) window.clearInterval(insetTimer);
      insetTimer = null;
    }
  }, 100);
}

/** `onTap` makes the toast a button (news that is about a place: tap to look at it). */
export function showToast(
  container: HTMLElement,
  message: string,
  kind: ToastKind = "info",
  onTap?: () => void,
): void {
  const now = performance.now();
  const shownAt = recentToasts.get(message);
  if (shownAt !== undefined && now - shownAt < TOAST_DEDUPE_MS) return;
  recentToasts.set(message, now);
  if (recentToasts.size > 50) {
    for (const [m, t] of recentToasts) if (now - t >= TOAST_DEDUPE_MS) recentToasts.delete(m);
  }
  const toastRoot = ensureContainer(container);
  syncInset(toastRoot);
  watchInset(toastRoot);
  const el = h(
    "div",
    { className: `toast toast-${kind}${onTap ? " toast-tappable" : ""}` },
    message,
  );
  if (onTap) {
    el.addEventListener("click", () => {
      onTap();
      el.remove();
    });
  }
  // Phase 47: at most TOAST_MAX_VISIBLE on screen; the oldest goes when a newer one arrives.
  const live = [...toastRoot.children].filter(
    (c) => !c.hasAttribute("data-leaving") && !c.hasAttribute("data-explain"),
  );
  for (const old of live.slice(0, Math.max(0, live.length - TOAST_MAX_VISIBLE + 1))) old.remove();
  toastRoot.appendChild(el);
  void el.offsetWidth;
  el.classList.add("toast-visible");
  window.setTimeout(() => {
    el.classList.remove("toast-visible");
    el.setAttribute("data-leaving", "");
    window.setTimeout(() => el.remove(), 250);
  }, TOAST_DURATION_MS);
}

/** Phase 55: text the player asked for (a cargo chip's name and amount, why a demand is unmet). It stays until it is
 * tapped, the panel closes or the next explanation replaces it, and news toasts never push it out. */
export function showExplanation(
  container: HTMLElement,
  message: string,
  kind: ToastKind = "info",
): void {
  dismissExplanation();
  const toastRoot = ensureContainer(container);
  syncInset(toastRoot);
  watchInset(toastRoot);
  const el = h(
    "div",
    {
      className: `toast toast-${kind} toast-explain`,
      "data-explain": "",
      "data-testid": "explanation",
    },
    message,
  );
  el.addEventListener("click", () => el.remove());
  toastRoot.appendChild(el);
  void el.offsetWidth;
  el.classList.add("toast-visible");
}

/** Removes the explanation on screen, if any (the panel it belongs to closed). */
export function dismissExplanation(): void {
  toastRoot()?.querySelector("[data-explain]")?.remove();
}

function toastRoot(): HTMLElement | null {
  return toastContainer && toastContainer.isConnected ? toastContainer : null;
}
