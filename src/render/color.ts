/** Small color helpers for terrain shading/blending. */

export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Multiplies a `#rrggbb` color's channels by `factor` (hillshading). */
export function shadeColor(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${clampByte(r * factor)}, ${clampByte(g * factor)}, ${clampByte(b * factor)})`;
}

/** Returns a `#rrggbb` color as `rgba(...)` with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
