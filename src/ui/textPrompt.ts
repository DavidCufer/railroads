/** In-game text prompt (replaces `window.prompt`, PLAN Phase 34 item 7): a small dialog with a themed `.input`. */
import { h } from "./h";
import { strings } from "./strings";

export function askText(
  parent: HTMLElement,
  options: { title: string; value: string; confirmLabel: string },
): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h("input", {
      className: "input",
      type: "text",
      value: options.value,
      maxlength: "40",
      "aria-label": options.title,
      "data-testid": "text-prompt-input",
    });
    const finish = (result: string | null): void => {
      scrim.remove();
      resolve(result);
    };
    const scrim = h(
      "div",
      { className: "modal-scrim text-prompt-scrim" },
      h(
        "div",
        { className: "text-prompt", role: "dialog", "aria-label": options.title },
        h("div", { className: "panel-title" }, options.title),
        input,
        h(
          "div",
          { className: "text-prompt-actions" },
          h(
            "button",
            { className: "save-slot-btn", onClick: () => finish(null) },
            strings.ui.cancel,
          ),
          h(
            "button",
            {
              className: "save-slot-btn save-slot-btn-primary",
              onClick: () => finish(input.value),
            },
            options.confirmLabel,
          ),
        ),
      ),
    );
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(input.value);
      else if (e.key === "Escape") finish(null);
    });
    parent.appendChild(scrim);
    input.focus();
    input.select();
  });
}
