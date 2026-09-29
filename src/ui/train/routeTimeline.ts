/** Vertical route timeline (STYLE §11.2): stops as dots on a line, a loading-rule chip per stop
 * (tap to cycle), reorder/remove controls, and an optional locomotive marker for a live train. */
import type { LoadingRule } from "../../sim/trains/types";
import { h } from "../h";
import { icon, type IconName } from "../icons";
import { strings } from "../strings";

export const LOADING_RULES: readonly LoadingRule[] = [
  "auto",
  "fullLoad",
  "unloadOnly",
  "passThrough",
  "transfer",
];

const RULE_ICONS: Record<LoadingRule, IconName> = {
  auto: "check",
  fullLoad: "cargo",
  unloadOnly: "arrowDown",
  passThrough: "fastForward",
  transfer: "warehouse",
};

export function nextRule(rule: LoadingRule): LoadingRule {
  return LOADING_RULES[(LOADING_RULES.indexOf(rule) + 1) % LOADING_RULES.length] as LoadingRule;
}

export interface TimelineStop {
  name: string;
  rule: LoadingRule;
}

export interface TimelineOptions {
  stops: readonly TimelineStop[];
  /** Live train marker: `at` a stop's dot, or `toward` a stop (on the segment before it). */
  marker?: { kind: "at" | "toward"; index: number; icon: IconName } | undefined;
  onRule?: (index: number) => void;
  onRemove?: (index: number) => void;
  onMove?: (index: number, delta: -1 | 1) => void;
}

export function routeTimeline(o: TimelineOptions): HTMLElement {
  const n = o.stops.length;
  const t = strings.trains.panel;
  const markerEl = (): HTMLElement =>
    h(
      "span",
      { className: "tl-marker", title: t.here },
      icon(o.marker?.icon ?? "steam", "icon-sm"),
    );
  const rows = o.stops.map((stop, i) => {
    const towardHere = o.marker?.kind === "toward" && o.marker.index === i;
    const atHere = o.marker?.kind === "at" && o.marker.index === i;
    const rule = stop.rule;
    return h(
      "div",
      { className: `train-order-row tl-row${atHere ? " here" : ""}` },
      h(
        "div",
        { className: "tl-rail" },
        h("span", { className: `tl-line tl-line-up${i === 0 ? " hidden" : ""}` }),
        h("span", { className: "tl-dot" }, atHere ? markerEl() : null),
        h("span", {
          className: `tl-line tl-line-down${i === n - 1 && !o.marker ? " hidden" : ""}`,
        }),
        towardHere && i > 0 ? h("span", { className: "tl-marker-slot up" }, markerEl()) : null,
      ),
      h(
        "div",
        { className: "tl-main" },
        h("span", { className: "tl-name train-order-label" }, `${i + 1}. ${stop.name}`),
        h(
          "button",
          {
            className: "train-order-rule-btn rule-chip",
            "aria-label": `${strings.trains.loadingRules[rule]}. ${t.changeRule}`,
            disabled: !o.onRule,
            onClick: () => o.onRule?.(i),
          },
          icon(RULE_ICONS[rule], "icon-sm"),
          strings.trains.loadingRules[rule],
        ),
      ),
      h(
        "div",
        { className: "tl-tools" },
        o.onMove
          ? h(
              "button",
              {
                className: "tl-tool",
                "aria-label": t.moveUp,
                disabled: i === 0,
                onClick: () => o.onMove?.(i, -1),
              },
              icon("arrowUp", "icon-sm"),
            )
          : null,
        o.onMove
          ? h(
              "button",
              {
                className: "tl-tool",
                "aria-label": t.moveDown,
                disabled: i === n - 1,
                onClick: () => o.onMove?.(i, 1),
              },
              icon("arrowDown", "icon-sm"),
            )
          : null,
        o.onRemove
          ? h(
              "button",
              {
                className: "train-order-remove-btn tl-tool",
                "aria-label": t.removeStop,
                onClick: () => o.onRemove?.(i),
              },
              icon("close", "icon-sm"),
            )
          : null,
      ),
    );
  });
  const list = h("div", { className: "tl train-orders-list" }, ...rows);
  if (o.marker?.kind === "toward" && o.marker.index === 0 && n > 1) {
    list.appendChild(
      h(
        "div",
        { className: "tl-return" },
        h(
          "span",
          { className: "tl-rail" },
          h("span", { className: "tl-line tl-line-up" }),
          markerEl(),
        ),
        h(
          "span",
          { className: "tl-return-text" },
          strings.trains.panel.returnsTo((o.stops[0] as TimelineStop).name),
        ),
      ),
    );
  }
  return list;
}
