/**
 * Screen-space rectangles floating UI (bottom-right buttons, the mini-map) occupies — dynamically-
 * drawn labels (city/station names) that would land under one are skipped entirely rather than
 * drawn behind it (Phase 8 review carry-over: a station label near the bottom-right corner rendered
 * its text right over/under the News button, see
 * docs/screenshots/phase-8-electrified-line-zoom2.png).
 */
export interface ReservedScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function intersectsReserved(
  rects: readonly ReservedScreenRect[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  for (const r of rects) {
    if (x1 < r.x0 || x0 > r.x1 || y1 < r.y0 || y0 > r.y1) continue;
    return true;
  }
  return false;
}
