/**
 * Full-screen sheet (STYLE §11.1, §11.3): a header (back/close, title, optional stepper), a scrolling
 * body and a pinned footer, covering the whole game view. Used by the buy-train wizard and the
 * Roster. Registers with the Android back button while open.
 */
import { pushBackHandler } from "./backButton";
import { h } from "./h";
import { icon } from "./icons";
import { strings } from "./strings";

export interface SheetOptions {
  /** Extra class on the root (`sheet-wizard`, `sheet-roster`). */
  className: string;
  title: string | Node;
  subtitle?: string | Node | undefined;
  /** Node shown in the middle of the header (the stepper). */
  center?: Node | undefined;
  body: Node[];
  footer?: Node[] | undefined;
  onClose?: (() => void) | undefined;
}

export interface SheetHandle {
  root: HTMLElement;
  close: () => void;
}

let current: SheetHandle | null = null;

export function isSheetOpen(): boolean {
  return current !== null;
}

/** Closes whichever sheet is open (no-op when none). */
export function closeSheet(): void {
  current?.close();
}

export function openSheet(container: HTMLElement, options: SheetOptions): SheetHandle {
  current?.close();
  const unregister = pushBackHandler(() => handle.close());
  const closeBtn = h(
    "button",
    { className: "sheet-close", "aria-label": strings.ui.close, onClick: () => handle.close() },
    icon("close"),
  );
  const header = h(
    "div",
    { className: "sheet-header" },
    h(
      "div",
      { className: "sheet-heading" },
      h("div", { className: "sheet-title panel-title" }, options.title),
      options.subtitle ? h("div", { className: "sheet-subtitle" }, options.subtitle) : null,
    ),
    options.center ? h("div", { className: "sheet-center" }, options.center) : null,
    closeBtn,
  );
  const root = h(
    "div",
    { className: `sheet ${options.className}` },
    header,
    h("div", { className: "sheet-body" }, ...options.body),
    options.footer && options.footer.length > 0
      ? h("div", { className: "sheet-footer panel-actions" }, ...options.footer)
      : null,
  );
  container.appendChild(root);
  let closed = false;
  const handle: SheetHandle = {
    root,
    close: () => {
      if (closed) return;
      closed = true;
      unregister();
      root.remove();
      if (current === handle) current = null;
      options.onClose?.();
    },
  };
  current = handle;
  return handle;
}
