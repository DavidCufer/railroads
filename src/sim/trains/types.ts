/** Train state (SPEC §7): pure, serializable data living in `GameState.trains`. Logic that reads
 * and mutates it lives in this directory (route.ts, blocks.ts, movement.ts); renderers and UI only
 * read it. */
import type { CargoType } from "../../data/cargo";

/** Per-stop loading rule (SPEC §7.2). Real load/unload behavior is Phase 7 — this phase only
 * stores the choice. */
export type LoadingRule = "auto" | "fullLoad" | "unloadOnly" | "passThrough";

export interface TrainOrder {
  stationId: number;
  rule: LoadingRule;
  /** Only meaningful for `fullLoad` (SPEC §7.2: "optional max wait days"). */
  maxWaitDays?: number;
}

export type TrainStatus =
  "loading" | "moving" | "waitingForBlock" | "waitingForStation" | "noRoute" | "stuck";

export interface TrainCar {
  cargoType: CargoType;
}

/** A block this train currently holds a reservation on (SPEC §7.5), newest last. At most 2 at a
 * time: the block its head is in, and the one behind it kept reserved for one extra tick after the
 * head leaves (the "one-block lag" release rule — approximates the train's tail/cars still
 * physically occupying the tail end of the previous block). */
export interface HeldBlock {
  blockId: number;
  /** DIRS8 index the train was moving in when it entered this block — used for double-track
   * same-direction spacing (opposing-direction trains never conflict, so it's irrelevant then). */
  direction: number;
  /** Tiles traveled into this block since entering it — the spacing check compares this against
   * `MIN_SPACING_TILES_DOUBLE_TRACK` for a following same-direction train. */
  distanceInto: number;
}

export interface Train {
  id: number;
  name: string;
  locoModelId: string;
  cars: TrainCar[];
  orders: TrainOrder[];
  currentOrderIndex: number;
  status: TrainStatus;
  /** Tile-index node list from the node the train is currently at (or departed from) to the
   * current order's target station, inclusive of both ends. Empty while `status` is `noRoute`. */
  route: number[];
  /** Index into `route`: the current edge runs from `route[routeIndex]` to `route[routeIndex+1]`. */
  routeIndex: number;
  /** 0..1 fractional progress along the current edge. */
  edgeProgress: number;
  /** Current speed, km/h. */
  speed: number;
  /** DIRS8 index of the current direction of travel, or -1 if stationary/undetermined. */
  direction: number;
  /** Ticks spent continuously in the current `status` — drives the placeholder loading dwell and
   * the deadlock reroute/stuck timeouts. Reset to 0 on every status change. */
  waitTicks: number;
  /** `state.trackVersion` when `route` was last computed — a mismatch with the live
   * `GameState.trackVersion` is what triggers a reroute at the next node boundary (SPEC §7.3),
   * rather than a separate dirty flag. */
  routeTrackVersion: number;
  heldBlocks: HeldBlock[];
  /** Extra cost penalty applied to specific blocks the next time this train re-routes (SPEC §7.5
   * deadlock handling) — cleared once a route is found that avoids needing it. */
  blockPenalties: Map<number, number>;
  /** Cached fractional (tile-space) position at the start and end of the most recent tick, for the
   * renderer to lerp between with the frame's accumulator alpha. */
  renderFromX: number;
  renderFromY: number;
  renderToX: number;
  renderToY: number;
}
