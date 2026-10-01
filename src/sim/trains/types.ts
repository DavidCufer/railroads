/** Train state (SPEC §7): pure, serializable data living in `GameState.trains`. Logic that reads
 * and mutates it lives in this directory (route.ts, blocks.ts, movement.ts); renderers and UI only
 * read it. */
import type { RepairCrew } from "./repairCrew";
import type { CargoType } from "../../data/cargo";

/** Per-stop loading rule (SPEC §7.2). Real load/unload behavior is Phase 7 — this phase only
 * stores the choice. */
export type LoadingRule = "auto" | "fullLoad" | "unloadOnly" | "passThrough" | "transfer";

export interface TrainOrder {
  stationId: number;
  rule: LoadingRule;
  /** Only meaningful for `fullLoad` (SPEC §7.2: "optional max wait days"). */
  maxWaitDays?: number;
  /** Departure spacing (Phase 30A, PLAYTEST-2 #6): the train leaves this stop no sooner than this many days after
   * the last train left this station, so trains on a single line run spaced out instead of in a convoy (real
   * railways ran timetables with headways). Unset = leave as soon as loaded. */
  minGapDays?: number;
}

export type TrainStatus =
  "loading" | "moving" | "waitingForBlock" | "waitingForStation" | "noRoute" | "stuck" | "broken";

export interface TrainCar {
  /** Fixed at purchase — a car only ever carries this one cargo type (a simplification: SPEC
   * §7.1's shared car types, e.g. a Boxcar hauling goods/food/lumber/steel, are modeled here as
   * separate cargo-dedicated purchases instead, matching how the Buy Train dialog already works). */
  cargoType: CargoType;
  /** Real units of `cargoType` currently aboard (PLAN Phase 16: partial loading), 0..`CARGO[
   * cargoType].capacity`. A car only ever loads once per stop (see src/sim/trains/loading.ts's
   * `planLoadUnload`) — it doesn't top up again until fully unloaded — except under the "Wait for
   * full load" rule, which keeps retrying the same stop until full or `maxWaitDays` elapses. */
  loadedUnits: number;
  /** Tile the current load was first picked up at, and the sim tick it happened — used to compute
   * distance/time for the revenue formula (SPEC §8.1) on delivery. Undefined when `loadedUnits`
   * is 0. Set once on the first load into an empty car; unaffected by a later top-up. */
  loadedTile?: number;
  loadedTick?: number;
}

/** A block reserved as part of the train's current station-to-station section reservation (SPEC
 * §7.5, rewritten after play-testing), oldest-entered first. Departing a station reserves *every*
 * block up to the next station on the route in one atomic batch (see
 * `src/sim/trains/movement.ts`'s `tryEnterSection`); entries are dropped from the front as the
 * train's *tail* clears each one (see `releaseTrailingBlocks`), not just its head. */
export interface HeldBlock {
  blockId: number;
  /** DIRS8 index the train was moving in when it entered this block — used for same-direction
   * spacing (opposing-direction trains never conflict, so it's irrelevant then). */
  direction: number;
  /** `train.distanceTraveled` value at the moment this block started being entered — a fixed
   * (monotonic, never-reset) mark, not a live counter. Combined with `lengthTiles`, this is enough
   * to derive both this train's live "distance into this block" (for the spacing check) and the
   * tail-clear release point, without recomputing path geometry every tick. */
  enteredAtDistance: number;
  /** This block's length in tiles (`Block.lengthTiles`), cached at reservation time. */
  lengthTiles: number;
}

/** A junction/crossing node a train has claimed (PLAN Phase 25A, src/sim/trains/crossing.ts). */
export interface NodeClaim {
  /** A junction node's tile index, or a mid-tile crossing's point id (`mapSize + cell`, see
   * `src/sim/track/conflicts.ts`). */
  node: number;
  /** `train.distanceTraveled` value at which the head reaches the node. */
  atDistance: number;
  /** Route neighbours the train enters from / leaves to (-1 unknown). */
  inNode: number;
  outNode: number;
  /** Tiles the claim is held before the head / after the tail (per-junction geometry, Phase 27 B);
   * absent in older saves = `CROSSING_CLEARANCE_TILES`. */
  clearance?: number;
}

/** What is currently keeping a train from departing (SPEC §7.5 wait-for graph, PLAN Phase 18 B).
 * Recorded by every failed departure check and cleared the moment one succeeds; purely derived
 * (re-set every tick a train is still waiting), so it is not saved. */
export interface WaitingOn {
  kind: "line" | "platform";
  /** The station the train is trying to reach. */
  stationId: number;
  /** The block whose opposing traffic denies the departure (`kind === "line"`). */
  blockId?: number;
  /** DIRS8 index the waiting train would enter `blockId` in (fairness: opposite-way trains yield). */
  direction?: number;
  /** Trains that hold the resource: opposing holders of the block, or trains counted against the
   * station's slots. Empty means no live blocker — a bug (stale reservation) the sim clears. */
  trainIds: number[];
}

/** Money a train earned and spent over some period (PLAN Phase 24A). */
export interface TrainBooks {
  revenue: number;
  /** The locomotive's fuel, oil and servicing. */
  running: number;
  /** Crew wages (Economic model v2); absent in older saves. */
  wages?: number;
  /** Track wear this train caused (Economic model v2); absent in older saves. */
  wear?: number;
  /** Breakdown repairs. */
  repairs: number;
}

export interface TrainProfit {
  thisYear: TrainBooks;
  lastYear: TrainBooks;
  lifetime: TrainBooks;
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
  /** Monotonic tiles traveled since the train was bought — never reset (including across station
   * stops or a fresh section reservation), so `HeldBlock.enteredAtDistance` marks stay meaningful
   * forever. Only ever read relative to itself (`distanceTraveled - enteredAtDistance`). */
  distanceTraveled: number;
  /** The station this train's *current, successfully reserved* section ends at — set the moment a
   * departure (from a real stop or a through-station) is committed, cleared on arrival. This is
   * what `stationOccupancy` in movement.ts counts as "reserved toward" a station's slot. */
  sectionTargetStationId?: number;
  /** The station this train is trying (and, while `status` is `waitingForBlock`/
   * `waitingForStation`, currently failing) to reach next — set on every reservation attempt
   * whether it succeeds or not, cleared on arrival. Purely descriptive: the train panel's "waiting
   * for line clear to X" / "waiting for platform at X" text (SPEC §7.5) reads this; nothing in the
   * sim itself depends on it. */
  waitingForStationId?: number;
  /** Extra cost penalty applied to specific blocks the next time this train re-routes (SPEC §7.5
   * deadlock handling) — cleared once a route is found that avoids needing it. */
  blockPenalties: Map<number, number>;
  /** The unreachable station last reported in a "No route" news item, so it is announced once. */
  noRouteReportedStationId?: number;
  /** Sorted cargo list last announced by the "can't be delivered" news item, so it fires once. */
  undeliverableReported?: string;
  /** Junction/crossing nodes this train currently holds or has claimed ahead (runtime only). */
  nodeClaims?: NodeClaim[];
  /** Set while the train is halted just short of a junction/crossing held by other trains. */
  crossingWait?: { node: number; trainIds: number[]; since: number };
  /** The station whose yard this train waits in for a free platform (PLAN Phase 28A); its `status` is
   * `waitingForStation`. Platforms limit simultaneous loading, never entry. */
  inYardOf?: number;
  /** `state.ticks` the train joined the yard queue — platforms are given out oldest first. */
  yardSince?: number;
  /** Why the train is waiting, while `status` is `waitingForBlock`/`waitingForStation`. */
  waitingOn?: WaitingOn;
  /** Ticks left in the current loading/unloading stop (SPEC §7.2, §6.1's overlength penalty).
   * -1 means "not yet computed for this stop" — src/sim/trains/loading.ts fills it in on first
   * use and resets it to -1 whenever the train arrives at a new stop. */
  loadTicksLeft: number;
  /** Extra whole days waited beyond the initial load pass for a "Wait for full load" stop (SPEC
   * §7.2) — reset to 0 on arrival. */
  loadExtraWaitDays: number;
  /** Set while a train that has unloaded at this stop waits for its departure headway (`TrainOrder.minGapDays`). */
  headwayHold?: boolean;
  /** Ticks spent waiting for the headway at this stop (capped so a queue cannot wait for ever). */
  headwayWaitTicks?: number;
  /** Total price paid for this train (locomotive + cars) and the tick it was bought — SPEC §9.3's
   * depreciating rolling-stock value, and the age input for breakdown chance/obsolescence (§7.6). */
  purchasePrice: number;
  purchaseTick: number;
  /** Phase 30A: years of mechanical age taken off by overhauls (see src/sim/trains/ageing.ts). Absent = 0. */
  ageCreditYears?: number;
  /** Phase 30A: the end-of-life news for this locomotive has been shown. */
  wornOutNoticed?: boolean;
  /** Phase 30A: set while `breakdownTicksLeft` counts down a general overhaul in the shed rather than a repair. */
  inOverhaul?: boolean;
  /** Ticks left in the current breakdown (SPEC §7.6: "train stops for 2-5 days"), 0 = not broken
   * down. While > 0, `stepTrain` freezes the train in place (status `"broken"`) and skips its
   * normal loading/routing/movement for the tick. */
  breakdownTicksLeft: number;
  /** The crew fixing the current breakdown (Phase 26A); cleared when the train is back on the line. Absent in older saves. */
  repairCrew?: RepairCrew;
  /** `state.ticks` this train last stopped at a station with an Engine Shed, or undefined if never
   * — breakdown chance is halved within `BREAKDOWN_ENGINE_SHED_WINDOW_DAYS` of this (SPEC §6.2). */
  lastServicedTick?: number;
  /** Tiles traveled (steam locomotives only) since the last stop at a station with a Water Tower —
   * SPEC §6.2: beyond `WATER_TOWER_RANGE_TILES` the train loses `WATER_TOWER_SPEED_PENALTY` speed
   * until its next refill. Diesel/electric never accumulate this (stays 0). */
  tilesSinceWaterTower: number;
  /** Cumulative revenue this train has ever earned (SPEC §10.2's "lifetime revenue", Phase 9's
   * train-profit-colors overlay) — never reset, including across a locomotive replacement. */
  lifetimeRevenue: number;
  /** Wear units this train has inflicted on the track since the month began (Economic model v2); the monthly
   * step turns them into money and resets it. Absent in older saves. */
  wearUnits?: number;
  /** Per-train revenue and running costs (PLAN Phase 24A). */
  profit: TrainProfit;
  /** Cached fractional (tile-space) position at the start and end of the most recent tick, for the
   * renderer to lerp between with the frame's accumulator alpha. */
  renderFromX: number;
  renderFromY: number;
  renderToX: number;
  renderToY: number;
  /** A consist change queued by the "Edit cars" action (PLAN Phase 15) while the train isn't at a
   * station — cash already changed hands when the command ran (`editConsist` in commands.ts), but
   * the actual car swap (and dropping cargo from `removedLoaded`) waits for the train's next stop
   * anywhere (`applyPendingConsist` in loading.ts). `undefined` when nothing is queued. Applied
   * immediately instead (never queued) when the train already *is* at a station when the command
   * runs. */
  pendingConsist?: { cars: TrainCar[]; removedLoaded: TrainCar[] };
}
