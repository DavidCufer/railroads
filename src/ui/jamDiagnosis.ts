/** Diagnosis for a traffic jam (Playtest 2, Bug 3): instead of the bare "Traffic jam", say how many trains use the
 * stretch and whether it is single track, so the fix (passing loop, double track) is named. Read-only. */
import type { GameState } from "../sim/state";

export interface JamDiagnosis {
  /** Trains whose current route runs through the jam tile (the stalled one included). */
  trains: number;
  /** True when every track leg at the tile is single. */
  singleTrack: boolean;
}

export function diagnoseJam(state: GameState, tile: number): JamDiagnosis {
  const trains = state.trains.filter((t) => t.route.includes(tile)).length;
  const edges = state.trackGraph.edgesAt(tile);
  return { trains, singleTrack: edges.length > 0 && edges.every((e) => !e.double) };
}
