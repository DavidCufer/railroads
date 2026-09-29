/** Whyte-notation parsing and the wheel-arrangement glyph (STYLE §9.1). */

export interface Whyte {
  /** Leading wheels (count of wheels, not axles). */
  lead: number;
  /** Driving wheels per group: `[6]` for 4-6-2, `[8, 8]` for the 4-8-8-4 articulated. */
  groups: number[];
  trail: number;
}

/** Finds and parses a Whyte designation ("4-6-2", "0-4-0", "4-8-8-4") inside any string. */
export function parseWhyte(text: string): Whyte | null {
  const m = /(\d+)-(\d+)-(\d+)(?:-(\d+))?/.exec(text);
  if (!m) return null;
  const n = m
    .slice(1)
    .filter((s) => s !== undefined)
    .map(Number);
  if (n.length === 4)
    return {
      lead: n[0] as number,
      groups: [n[1] as number, n[2] as number],
      trail: n[3] as number,
    };
  return { lead: n[0] as number, groups: [n[1] as number], trail: n[2] as number };
}

export function isArticulated(w: Whyte): boolean {
  return w.groups.length > 1;
}

/** The enthusiast's diagram: one small circle per leading/trailing axle, one large circle per
 * driving axle, driver groups separated by a gap ("oOOOo"). Inline SVG using `currentColor`. */
export function wheelArrangementGlyph(whyte: string | Whyte): string {
  const w = typeof whyte === "string" ? parseWhyte(whyte) : whyte;
  if (!w) return "";
  const small = 2.6;
  const big = 4.4;
  const gap = 1.6;
  let x = 0;
  const parts: string[] = [];
  const add = (r: number): void => {
    x += r;
    parts.push(`<circle cx="${x.toFixed(1)}" cy="5" r="${r}"/>`);
    x += r + gap;
  };
  for (let i = 0; i < w.lead / 2; i++) add(small);
  w.groups.forEach((g, gi) => {
    if (gi > 0) x += gap * 1.5;
    for (let i = 0; i < g / 2; i++) add(big);
  });
  for (let i = 0; i < w.trail / 2; i++) add(small);
  const width = Math.max(1, x - gap);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="whyte-glyph" viewBox="0 0 ${width.toFixed(1)} 10" width="${width.toFixed(1)}" height="10" fill="currentColor" role="img" aria-label="${w.lead}-${w.groups.join("-")}-${w.trail}">${parts.join("")}</svg>`;
}
