/** Small "which one did you mean?" popup shown at the tap point (PLAN Phase 17 C). */
import { h } from "./h";
import { icon, type IconName } from "./icons";
import type { PickCandidate, PickKind } from "./picking";

const KIND_ICON: Record<PickKind, IconName> = {
  train: "trains",
  station: "station",
  industry: "shed",
  city: "info",
};

let current: HTMLElement | null = null;

export function closeChooser(): void {
  current?.remove();
  current = null;
}

export function isChooserOpen(): boolean {
  return current !== null;
}

export function showChooser(
  container: HTMLElement,
  x: number,
  y: number,
  options: PickCandidate[],
  onPick: (option: PickCandidate) => void,
): void {
  closeChooser();
  const el = h(
    "div",
    { className: "chooser", "data-testid": "chooser" },
    ...options.map((option) =>
      h(
        "button",
        {
          className: "chooser-item",
          "data-kind": option.kind,
          onClick: () => {
            closeChooser();
            onPick(option);
          },
        },
        icon(KIND_ICON[option.kind], "icon-sm"),
        option.name,
      ),
    ),
  );
  container.appendChild(el);
  // Keep the popup on-screen: anchor under the tap, flip/clamp near the edges.
  const rect = el.getBoundingClientRect();
  const left = Math.max(8, Math.min(x - rect.width / 2, window.innerWidth - rect.width - 8));
  const top = Math.max(8, Math.min(y + 12, window.innerHeight - rect.height - 8));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  current = el;
}
