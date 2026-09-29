/** Pure helpers behind the UI v2 charts/meters (STYLE §8.2) — no DOM, unit-tested. */

export interface Point {
  x: number;
  y: number;
}

/** Maps `values` onto a `w`×`h` box (with `pad` all round): x evenly spaced, y inverted so larger
 * values sit higher. A flat series is drawn along the vertical middle; fewer than 2 values → []. */
export function sparklinePoints(values: readonly number[], w: number, h: number, pad = 3): Point[] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  return values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * innerW,
    y: span === 0 ? h / 2 : pad + (1 - (v - min) / span) * innerH,
  }));
}

export interface StackPart<K extends string = string> {
  key: K;
  value: number;
}

export interface StackSegment<K extends string = string> extends StackPart<K> {
  /** Share of the total, 0..1 (all segments together sum to 1). */
  frac: number;
}

/** Splits `parts` into fractions of their positive total. Zero/negative parts are dropped. */
export function stackSegments<K extends string>(parts: readonly StackPart<K>[]): StackSegment<K>[] {
  const positive = parts.filter((p) => p.value > 0);
  const total = positive.reduce((sum, p) => sum + p.value, 0);
  if (total <= 0) return [];
  return positive.map((p) => ({ ...p, frac: p.value / total }));
}

/** How many of `max` pips a 1..max rating fills (clamped, rounded). */
export function pipCount(value: number, max = 5): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

/** Meter fill 0..1 from a value and its ceiling (0 when the ceiling is not positive). */
export function meterFraction(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(1, value / max));
}

/** Which colour the cash chip flashes when cash moves from `prev` to `next` (null: no flash).
 * Sub-dollar drift (e.g. fractional upkeep accruing) is ignored. */
export function cashFlashTone(prev: number, next: number): "go" | "signal" | null {
  const delta = next - prev;
  if (Math.abs(delta) < 1) return null;
  return delta > 0 ? "go" : "signal";
}
