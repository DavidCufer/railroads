import { h } from "../h";
import { icon, type IconName } from "../icons";
import { toneClass, type Tone } from "./tone";

export interface StatTileOptions {
  icon?: IconName | undefined;
  value: string;
  caption: string;
  tone?: Tone | undefined;
}

/** STYLE §8.2 StatTile: icon + value over a tiny uppercase caption. */
export function statTile(options: StatTileOptions): HTMLElement {
  return h(
    "div",
    { className: "stat-tile" },
    h(
      "div",
      { className: `stat-value${toneClass(options.tone)}` },
      options.icon ? icon(options.icon, "icon-sm") : null,
      h("span", null, options.value),
    ),
    h("div", { className: "stat-caption" }, options.caption),
  );
}

export function statRow(...tiles: HTMLElement[]): HTMLElement {
  return h("div", { className: `stat-row${tiles.length === 4 ? " stat-row-4" : ""}` }, ...tiles);
}
