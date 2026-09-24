/** Player-built station instances (SPEC §6.1). Placement data lives on the tile; game-balance
 * numbers per type are in src/data/stations.ts. */
import type { StationType } from "../../data/stations";

export interface Station {
  id: number;
  /** Tile index (`y * map.width + x`) the station sits on — always an existing track tile. */
  tile: number;
  type: StationType;
  name: string;
  /** First station built in the game gets a free Engine Shed (SPEC §6.2) — flag only for now;
   * Phase 6 reads this to gate where trains can be bought. */
  hasEngineShed: boolean;
}
