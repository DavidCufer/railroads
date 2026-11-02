/** Stations already in the orders being edited, so the map can mark them while picking (Phase 81). UI state only. */
let marks: readonly number[] = [];
export function setPickMarks(ids: readonly number[]): void {
  marks = ids;
}
export function getPickMarks(): readonly number[] {
  return marks;
}
