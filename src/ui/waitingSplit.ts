/** Phase 43: where the people waiting at a station are going, in one short line ("Milan 40 · Trieste 540"). Pure read
 * of the passenger pile's `bound` buckets; people with no assigned destination board any train and are listed last. */
import type { GameState } from "../sim/state";
import { strings } from "./strings";

const SHOWN = 3;

export function waitingSplitLine(state: GameState, stationId: number): string | undefined {
  const pile = state.stationCargo.get(stationId)?.passengers;
  if (!pile || pile.amount < 1) return undefined;
  const nameOf = (id: number): string => state.stations.find((s) => s.id === id)?.name ?? "?";
  const bound = Object.entries(pile.bound ?? {})
    .map(([id, n]) => [Number(id), n] as const)
    .filter(([, n]) => n >= 0.5)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const assigned = bound.reduce((sum, [, n]) => sum + n, 0);
  const anyone = Math.max(0, pile.amount - assigned);
  const parts = bound.slice(0, SHOWN).map(([id, n]) => `${nameOf(id)} ${Math.round(n)}`);
  const rest = bound.slice(SHOWN).reduce((sum, [, n]) => sum + n, 0) + anyone;
  if (rest >= 0.5) parts.push(strings.station.waitingElsewhere(Math.round(rest)));
  return parts.length > 1 || bound.length > 0 ? parts.join(" · ") : undefined;
}
