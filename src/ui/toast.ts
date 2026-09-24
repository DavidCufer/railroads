/** Toasts (SPEC §10.1: "Toasts for news (non-blocking) at top-center"). */
import { h } from "./h";

const TOAST_DURATION_MS = 3500;
let toastContainer: HTMLElement | null = null;

function ensureContainer(container: HTMLElement): HTMLElement {
  if (toastContainer && toastContainer.isConnected) return toastContainer;
  toastContainer = h("div", { className: "toast-container" });
  container.appendChild(toastContainer);
  return toastContainer;
}

export type ToastKind = "info" | "warn";

export function showToast(container: HTMLElement, message: string, kind: ToastKind = "info"): void {
  const toastRoot = ensureContainer(container);
  const el = h("div", { className: `toast toast-${kind}` }, message);
  toastRoot.appendChild(el);
  void el.offsetWidth;
  el.classList.add("toast-visible");
  window.setTimeout(() => {
    el.classList.remove("toast-visible");
    window.setTimeout(() => el.remove(), 250);
  }, TOAST_DURATION_MS);
}
