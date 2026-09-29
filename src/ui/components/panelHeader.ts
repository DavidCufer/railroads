import { h } from "../h";
import { icon } from "../icons";
import { strings } from "../strings";

export interface PanelHeaderOptions {
  title: string | Node;
  subtitle?: string | Node | undefined;
  /** 40×40 slot left of the title: a cargo tile, station-type glyph, tiny loco view… */
  thumb?: Node | undefined;
  onClose: () => void;
}

/** STYLE §8.2 PanelHeader v2: 52px, optional thumb, title + subtitle, ghost close, hairline with a
 * short brass accent under the thumb. */
export function panelHeader(options: PanelHeaderOptions): HTMLElement {
  return h(
    "div",
    { className: `panel-header${options.thumb ? " has-thumb" : ""}` },
    options.thumb ? h("div", { className: "panel-thumb" }, options.thumb) : null,
    h(
      "div",
      { className: "panel-header-text" },
      h("div", { className: "panel-title" }, options.title),
      options.subtitle ? h("div", { className: "panel-subtitle" }, options.subtitle) : null,
    ),
    h(
      "button",
      { className: "panel-close", onClick: options.onClose, "aria-label": strings.ui.close },
      icon("close"),
    ),
  );
}
