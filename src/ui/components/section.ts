import { h } from "../h";
import { infoTip } from "./infoTip";

/** A labelled group: small-caps label (optional right-hand note) over its content. A short note ("/mo") shows
 * as is; a longer one hides behind an (i) so the panel stays quiet (STYLE §16). */
export function section(
  label: string,
  content: Array<Node | null | false>,
  note?: string,
): HTMLElement {
  if (!note)
    return h(
      "div",
      { className: "section" },
      h("div", { className: "panel-section-title" }, label),
      ...content,
    );
  if (note.length <= 6) {
    return h(
      "div",
      { className: "section" },
      h(
        "div",
        { className: "section-head" },
        h("div", { className: "panel-section-title" }, label),
        h("span", { className: "section-note" }, note),
      ),
      ...content,
    );
  }
  const tip = infoTip(note);
  return h(
    "div",
    { className: "section" },
    h(
      "div",
      { className: "section-head" },
      h("div", { className: "panel-section-title" }, label),
      tip.button,
    ),
    tip.host,
    ...content,
  );
}
