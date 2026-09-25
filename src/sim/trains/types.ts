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
  "loading" | "moving" | "waitingForBlock" | "waitingForStation" | "noRoute" | "stuck" | "broken";

export interface TrainCar {
  /** Fixed at purchase — a car only ever carries this one cargo type (a simplification: SPEC
   * §7.1's shared car types, e.g. a Boxcar hauling goods/food/lumber/steel, are modeled here as
   * separate cargo-dedicated purchases instead, matching how the Buy Train dialog already works). */
  cargoType: CargoType;
  /** Whether this car currently holds a carload (SPEC §7.1: 1 car = 1 carload, full or empty). */
  loaded: boolean;
  /** Tile the current load was picked up at, and the sim tick it happened — used to compute
   * distance/time for the revenue formula (SPEC §8.1) on delivery. Undefined when `!loaded`. */
  loadedTile?: number;
  loadedTick?: number;
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
  /** The node the train arrived at its current/last station from, or -1 if unknown (never moved
   * yet). Used only to seed the next departure's `route` with one tile of real history behind the
   * station (SPEC/PLAN Phase 6 review carry-over: without it, cars have nowhere to lay out along
   * on the approach track and bunch up at the head right after leaving a station) — purely a
   * rendering aid, movement math only ever reads `route[routeIndex..]` onward. */
  lastApproachNode: number;
  heldBlocks: HeldBlock[];
  /** Extra cost penalty applied to specific blocks the next time this train re-routes (SPEC §7.5
   * deadlock handling) — cleared once a route is found that avoids needing it. */
  blockPenalties: Map<number, number>;
  /** Ticks left in the current loading/unloading stop (SPEC §7.2, §6.1's overlength penalty).
   * -1 means "not yet computed for this stop" — src/sim/trains/loading.ts fills it in on first
   * use and resets it to -1 whenever the train arrives at a new stop. */
  loadTicksLeft: number;
  /** Extra whole days waited beyond the initial load pass for a "Wait for full load" stop (SPEC
   * §7.2) — reset to 0 on arrival. */
  loadExtraWaitDays: number;
  /** Total price paid for this train (locomotive + cars) and the tick it was bought — SPEC §9.3's
   * depreciating rolling-stock value, and the age input for breakdown chance/obsolescence (§7.6). */
  purchasePrice: number;
  purchaseTick: number;
  /** Ticks left in the current breakdown (SPEC §7.6: "train stops for 2-5 days"), 0 = not broken
   * down. While > 0, `stepTrain` freezes the train in place (status `"broken"`) and skips its
   * normal loading/routing/movement for the tick. */
  breakdownTicksLeft: number;
  /** `state.ticks` this train last stopped at a station with an Engine Shed, or undefined if never
   * — breakdown chance is halved within `BREAKDOWN_ENGINE_SHED_WINDOW_DAYS` of this (SPEC §6.2). */
  lastServicedTick?: number;
  /** Tiles traveled (steam locomotives only) since the last stop at a station with a Water Tower —
   * SPEC §6.2: beyond `WATER_TOWER_RANGE_TILES` the train loses `WATER_TOWER_SPEED_PENALTY` speed
   * until its next refill. Diesel/electric never accumulate this (stays 0). */
  tilesSinceWaterTower: number;
  /** Cached fractional (tile-space) position at the start and end of the most recent tick, for the
   * renderer to lerp between with the frame's accumulator alpha. */
  renderFromX: number;
  renderFromY: number;
  renderToX: number;
  renderToY: number;
}
