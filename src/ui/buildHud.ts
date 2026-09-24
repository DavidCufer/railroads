/**
 * Build-mode HUD (SPEC §5.2): a floating cost label that follows the drag (offset from the
 * finger, so the label is never hidden under it), and the confirm bar shown on release
 * (✓ Build($X) / ✕, with a tap-to-cycle bridge-type chip when the path crosses water/a river).
 */
import { h } from "./h";
import { strings } from "./strings";
import { formatMoney } from "./format";
import type { BuildMode } from "../render/buildPreview";

let costLabelEl: HTMLElement | null = null;
let confirmBarEl: HTMLElement | null = null;

function ensureCostLabel(container: HTMLElement): HTMLElement {
  if (costLabelEl && costLabelEl.isConnected) return costLabelEl;
  costLabelEl = h("div", { className: "build-cost-label" });
  container.appendChild(costLabelEl);
  return costLabelEl;
}

/** Positions the cost label near (screenX, screenY) but offset up-and-away from the touch point,
 * clamped to stay fully inside the viewport (and below the top bar). */
export function showDragCostLabel(
  container: HTMLElement,
  screenX: number,
  screenY: number,
  cost: number,
  ok: boolean,
  viewportW: number,
  viewportH: number,
): void {
  const el = ensureCostLabel(container);
  el.textContent = formatMoney(cost);
  el.classList.toggle("build-cost-blocked", !ok);

  const OFFSET_Y = 46;
  const labelW = 90;
  const labelH = 28;
  let left = screenX - labelW / 2;
  let top = screenY - OFFSET_Y - labelH;
  left = Math.max(8, Math.min(viewportW - labelW - 8, left));
  top = Math.max(52, Math.min(viewportH - labelH - 8, top));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.display = "block";
}

export function hideDragCostLabel(): void {
  if (costLabelEl) costLabelEl.style.display = "none";
}

export interface ConfirmBarOptions {
  mode: BuildMode;
  cost: number;
  ok: boolean;
  /** Set when the path includes a bridge — label of the current type, tap to cycle. */
  bridgeLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onCycleBridge?: () => void;
}

const CONFIRM_LABEL: Record<BuildMode, string> = {
  track: strings.build.confirmBuild,
  double: strings.build.confirmUpgrade,
  bulldoze: strings.build.confirmBulldoze,
};

export function showConfirmBar(container: HTMLElement, options: ConfirmBarOptions): void {
  hideConfirmBar();

  const costText =
    options.mode === "bulldoze" ? `+${formatMoney(options.cost)}` : formatMoney(options.cost);
  const children: Node[] = [h("span", { className: "confirm-bar-cost" }, costText)];
  if (options.bridgeLabel) {
    children.push(
      h(
        "button",
        {
          className: "confirm-bar-bridge",
          "aria-label": strings.build.tapToChangeBridge,
          onClick: () => options.onCycleBridge?.(),
        },
        options.bridgeLabel,
      ),
    );
  }
  children.push(
    h(
      "button",
      {
        className: "confirm-bar-build",
        disabled: !options.ok,
        onClick: () => options.onConfirm(),
      },
      `✓ ${CONFIRM_LABEL[options.mode]}`,
    ),
    h(
      "button",
      {
        className: "confirm-bar-cancel",
        "aria-label": strings.ui.close,
        onClick: () => options.onCancel(),
      },
      strings.build.cancel,
    ),
  );

  confirmBarEl = h("div", { className: "confirm-bar" }, ...children);
  container.appendChild(confirmBarEl);
}

export function hideConfirmBar(): void {
  if (confirmBarEl) {
    confirmBarEl.remove();
    confirmBarEl = null;
  }
}

export function isConfirmBarOpen(): boolean {
  return confirmBarEl !== null;
}
