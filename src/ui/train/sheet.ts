/** Full-screen sheet (STYLE §11): header with close + serif title (+ optional stepper), scrolling
 * body, pinned footer. Used by the buy wizard, Edit cars and the Roster. One sheet at a time. */
import { pushBackHandler } from "../backButton";
import { h } from "../h";
import { icon } from "../icons";
import { strings } from "../strings";

export interface SheetOptions {
  title: string | Node;
  subtitle?: string | Node | undefined;
  /** Node shown at the right of the header (the wizard stepper). */
  headerExtra?: Node | undefined;
  className?: string;
  onClose?: () => void;
}

export interface SheetHandle {
  root: HTMLElement;
  header: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  setHeaderExtra(node: Node | null): void;
  close(): void;
}

let current: SheetHandle | null = null;

export function isSheetOpen(): boolean {
  return current !== null;
}

export function closeSheet(): void {
  current?.close();
}

export function openSheet(container: HTMLElement, options: SheetOptions): SheetHandle {
  current?.close();
  const extraSlot = h("div", { className: "sheet-extra" });
  if (options.headerExtra) extraSlot.appendChild(options.headerExtra);
  const closeBtn = h(
    "button",
    { className: "sheet-close", "aria-label": strings.ui.close },
    icon("close"),
  );
  const header = h(
    "div",
    { className: "sheet-header" },
    closeBtn,
    h(
      "div",
      { className: "sheet-heading" },
      h("div", { className: "sheet-title" }, options.title),
      options.subtitle ? h("div", { className: "sheet-subtitle" }, options.subtitle) : null,
    ),
    extraSlot,
  );
  const body = h("div", { className: "sheet-body" });
  const footer = h("div", { className: "sheet-footer panel-actions" });
  const root = h(
    "div",
    { className: `sheet${options.className ? ` ${options.className}` : ""}` },
    header,
    body,
    footer,
  );
  container.appendChild(root);
  let closed = false;
  let unregister: () => void = () => {};
  const handle: SheetHandle = {
    root,
    header,
    body,
    footer,
    setHeaderExtra(node) {
      extraSlot.replaceChildren(...(node ? [node] : []));
    },
    close() {
      if (closed) return;
      closed = true;
      unregister();
      root.remove();
      if (current === handle) current = null;
      options.onClose?.();
    },
  };
  closeBtn.addEventListener("click", () => handle.close());
  unregister = pushBackHandler(() => handle.close());
  current = handle;
  return handle;
}
