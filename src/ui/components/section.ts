import { h } from "../h";

/** A labelled group: small-caps label (optional right-hand note) over its content. */
export function section(
  label: string,
  content: Array<Node | null | false>,
  note?: string,
): HTMLElement {
  return h(
    "div",
    { className: "section" },
    note
      ? h(
          "div",
          { className: "section-head" },
          h("div", { className: "panel-section-title" }, label),
          h("span", { className: "section-note" }, note),
        )
      : h("div", { className: "panel-section-title" }, label),
    ...content,
  );
}
