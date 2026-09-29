/**
 * Route timeline (STYLE §11.2): stops as dots on a vertical line, a small loco marker where the
 * train is (at a stop, or on the way to one), each stop with a loading-rule chip (tap to cycle),
 * and reorder / remove buttons. Used by the buy wizard's route step and the train panel.
 */
import type { LoadingRule } from "../sim/trains/types";
import { h } from "./h";
import { icon, type IconName } from "./icons";
import { strings } from "./strings";

export const LOADING_RULES: readonly LoadingRule[] = [
  "auto",
  "fullLoad",
  "unloadOnly",
  "passThrough",
  "transfer",
];

export const RULE_ICONS: Record<LoadingRule, IconName> = {
  auto: "swap",
  fullLoad: "cargo",
  unloadOnly: "arrowDown",
  passThrough: "arrowRight",
  transfer: "warehouse",
};

export function nextRule(rule: LoadingRule): LoadingRule {
  const idx = LOADING_RULES.indexOf(rule);
  return LOADING_RULES[(idx + 1) % LOADING_RULES.length] as LoadingRule;
}

export interface TimelineStop {
  name: string;
  rule: LoadingRule;
}

export interface TimelineMarker {
  /** `at`: the train is standing at stop `index`; `toward`: on its way to stop `index`. */
  kind: "at" | "toward";
  index: number;
}

export interface RouteTimelineOptions {
  stops: readonly TimelineStop[];
  marker?: TimelineMarker | undefined;
  onRule?: ((index: number, rule: LoadingRule) => void) | undefined;
  onRemove?: ((index: number) => void) | undefined;
  onMove?: ((index: number, dir: -1 | 1) => void) | undefined;
  /** Removing is refused below this many stops (a train needs two). */
  minStops?: number;
}

function ruleChip(stop: TimelineStop, index: number, options: RouteTimelineOptions): HTMLElement {
  const label = strings.trains.loadingRules[stop.rule];
  const inner = [icon(RULE_ICONS[stop.rule], "icon-xs"), h("span", null, label)];
  const title = strings.trains.ruleHint[stop.rule];
  return options.onRule
    ? h(
        "button",
        {
          className: "rule-chip",
          title,
          "aria-label": `${strings.trains.panel.changeRule}: ${label}`,
          "data-testid": "rule-chip",
          onClick: () => options.onRule?.(index, nextRule(stop.rule)),
        },
        ...inner,
      )
    : h("span", { className: "rule-chip static", title }, ...inner);
}

function miniBtn(
  name: IconName,
  label: string,
  disabled: boolean,
  onClick: () => void,
): HTMLElement {
  return h(
    "button",
    { className: "tl-btn", "aria-label": label, disabled, onClick },
    icon(name, "icon-xs"),
  );
}

export function routeTimeline(options: RouteTimelineOptions): HTMLElement {
  const { stops, marker } = options;
  const min = options.minStops ?? 2;
  const p = strings.trains.panel;
  const rows = stops.map((stop, i) => {
    const here = marker?.kind === "at" && marker.index === i;
    const enRoute = marker?.kind === "toward" && marker.index === i;
    const controls: HTMLElement[] = [];
    if (options.onMove) {
      controls.push(
        miniBtn("arrowUp", p.moveUp, i === 0, () => options.onMove?.(i, -1)),
        miniBtn("arrowDown", p.moveDown, i === stops.length - 1, () => options.onMove?.(i, 1)),
      );
    }
    if (options.onRemove) {
      controls.push(
        miniBtn("close", p.removeStop, stops.length <= min, () => options.onRemove?.(i)),
      );
    }
    return h(
      "li",
      {
        className: `tl-stop${here ? " here" : ""}${enRoute ? " next" : ""}`,
        "data-testid": "tl-stop",
      },
      enRoute
        ? h(
            "div",
            { className: "tl-between" },
            h("span", { className: "tl-marker" }, icon("trains", "icon-xs")),
            h("span", { className: "tl-between-text" }, p.nextStop),
          )
        : null,
      h(
        "div",
        { className: "tl-row" },
        h(
          "span",
          { className: "tl-dot" },
          here ? h("span", { className: "tl-marker" }, icon("trains", "icon-xs")) : String(i + 1),
        ),
        h(
          "div",
          { className: "tl-name" },
          h("span", { className: "tl-station" }, stop.name),
          here ? h("span", { className: "tl-here" }, p.hereNow) : null,
        ),
        ruleChip(stop, i, options),
        controls.length > 0 ? h("div", { className: "tl-controls" }, ...controls) : null,
      ),
    );
  });
  return h("ol", { className: "route-timeline" }, ...rows);
}
