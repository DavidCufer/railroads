/** "A Year in Review is waiting" flag (Phase 28B). UI-only, not saved: the report itself always
 * summarises the last finished year, so it can be opened from Finance at any time. */
let waitingYear: number | null = null;
const listeners = new Set<() => void>();

export function setYearReportBadge(year: number): void {
  waitingYear = year;
  for (const l of listeners) l();
}
export function clearYearReportBadge(): void {
  if (waitingYear === null) return;
  waitingYear = null;
  for (const l of listeners) l();
}
export function yearReportBadge(): number | null {
  return waitingYear;
}
export function onYearReportBadgeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
