import { h } from "../h";
import { meterFraction, pipCount } from "./chartMath";
import { toneClass, type Tone } from "./tone";

/** STYLE §8.2 Meter: 6px bar with an optional value label to the right. */
export function meter(
  value: number,
  max: number,
  tone: Tone = "brass",
  label?: string,
): HTMLElement {
  const pct = Math.round(meterFraction(value, max) * 100);
  return h(
    "div",
    { className: "meter-row" },
    h(
      "div",
      { className: "meter", role: "meter", "aria-valuenow": String(pct) },
      h("div", { className: `meter-fill${toneClass(tone)}`, style: { width: `${pct}%` } }),
    ),
    label ? h("span", { className: "meter-label" }, label) : null,
  );
}

/** STYLE §8.2 Pips: `max` small squares, `value` of them filled brass. */
export function pips(value: number, max = 5): HTMLElement {
  const filled = pipCount(value, max);
  return h(
    "span",
    { className: "pips", role: "img", "aria-label": `${filled}/${max}` },
    ...Array.from({ length: max }, (_, i) => h("i", { className: i < filled ? "on" : "" })),
  );
}
