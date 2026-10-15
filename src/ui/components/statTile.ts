import { h } from "../h";
import { icon, type IconName } from "../icons";
import { toneClass, type Tone } from "./tone";

export interface StatTileOptions {
  icon?: IconName | undefined;
  value: string;
  caption: string;
  tone?: Tone | undefined;
  /** Tooltip explaining the figure. */
  title?: string | undefined;
}

/** STYLE §8.2 StatTile: icon + value over a tiny uppercase caption. */
export function statTile(options: StatTileOptions): HTMLElement {
  return h(
    "div",
    {
      className: "stat-tile",
      ...(options.title || !options.caption ? { title: options.title ?? "" } : {}),
    },
    h(
      "div",
      { className: `stat-value${toneClass(options.tone)}` },
      options.icon ? icon(options.icon, "icon-sm") : null,
      h("span", null, options.value),
    ),
    options.caption ? h("div", { className: "stat-caption" }, options.caption) : null,
  );
}

export function statRow(...tiles: HTMLElement[]): HTMLElement {
  return h("div", { className: `stat-row${tiles.length === 4 ? " stat-row-4" : ""}` }, ...tiles);
}
