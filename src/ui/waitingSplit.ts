/** Phase 43: where the people waiting at a station are going, in one short line ("Milan 40 · Trieste 540"). Pure read
 * of the passenger pile's `lots` (by destination) and older `bound` buckets; people beyond the top rows and those with no assigned destination are folded into the last "other towns" row. */
import type { GameState } from "../sim/state";
import { strings } from "./strings";

const SHOWN = 3;

export interface WaitingRow {
  /** Destination station name, or the "other towns" bucket (beyond the top rows, plus people with no destination yet). */
  label: string;
  n: number;
}

/** One row per destination, biggest first ("→ Milan 40"); people with no assigned destination are the last row. */
export function waitingSplitRows(state: GameState, stationId: number): WaitingRow[] | undefined {
  const pile = state.stationCargo.get(stationId)?.passengers;
  if (!pile || pile.amount < 1) return undefined;
  const nameOf = (id: number): string => state.stations.find((s) => s.id === id)?.name ?? "?";
  // Phase 48: people wait bound for their destination station (those who changed here included); older piles by first leg.
  const byStation = new Map<number, number>();
  for (const lot of pile.lots ?? [])
    byStation.set(lot.dest, (byStation.get(lot.dest) ?? 0) + lot.amount);
  for (const [id, n] of Object.entries(pile.bound ?? {}))
    byStation.set(Number(id), (byStation.get(Number(id)) ?? 0) + n);
  const bound = [...byStation]
    .filter(([, n]) => n >= 0.5)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const assigned = bound.reduce((sum, [, n]) => sum + n, 0);
  const anyone = Math.max(0, pile.amount - assigned);
  const rows: WaitingRow[] = bound
    .slice(0, SHOWN)
    .map(([id, n]) => ({ label: nameOf(id), n: Math.round(n) }));
  const rest = bound.slice(SHOWN).reduce((sum, [, n]) => sum + n, 0) + anyone;
  if (rest >= 0.5) rows.push({ label: strings.station.waitingElsewhere, n: Math.round(rest) });
  return bound.length > 0 ? rows : undefined;
}
