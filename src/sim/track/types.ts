/** Track graph data model (SPEC §5.1). */
import type { BridgeType } from "../../data/track";

export interface TrackEdge {
  /** Tile index (`y * map.width + x`) of each endpoint. `a < b` always (canonical order). */
  a: number;
  b: number;
  /** Index into DIRS8 (sim/map/grid.ts) for the direction from `a` to `b`. For a bridge this is
   * the compass direction of the straight span, not necessarily a single grid step. */
  direction: number;
  double: boolean;
  electrified: boolean;
  bridge: BridgeType | null;
  /** Tile indices the bridge structure passes over (empty for a non-bridge edge). */
  bridgeSpan: readonly number[];
  /** Cost paid to build this edge as it currently stands (single, pre-upgrade) — used for the
   * bulldoze refund and to compute the upgrade-to-double delta. */
  cost: number;
}
