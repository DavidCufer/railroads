/** Toasts (SPEC §10.1: "Toasts for news (non-blocking) at top-center"). */
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

/** `onTap` makes the toast a button (news that is about a place: tap to look at it). */
export function showToast(
  container: HTMLElement,
  message: string,
  kind: ToastKind = "info",
  onTap?: () => void,
): void {
  const toastRoot = ensureContainer(container);
  const inset = openPanelInset();
  toastRoot.style.setProperty("--toast-right-inset", `${inset}px`);
  // With a panel open the map area is narrow: also keep clear of the tool column on the left.
  toastRoot.style.setProperty("--toast-left-inset", inset > 0 ? `${TOOL_COLUMN_PX}px` : "0px");
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
  toastRoot.appendChild(el);
  void el.offsetWidth;
  el.classList.add("toast-visible");
  window.setTimeout(() => {
    el.classList.remove("toast-visible");
    window.setTimeout(() => el.remove(), 250);
  }, TOAST_DURATION_MS);
}
