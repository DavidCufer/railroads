/**
 * Contracts (Phase 45, docs/SPEC.md §11b): a town or company offers a deal. Balance numbers only — generation lives in
 * src/sim/contracts/generate.ts, progress in progress.ts.
 *
 * Reward formula (see `rewardFor` in generate.ts): reward = effort × (1 + margin) × difficulty, where
 *   effort = TRACK_SHARE × missing-track cost + STOCK_SHARE × rolling stock needed + OP_SHARE × operating cost over the period,
 * margin is drawn from `MARGIN_RANGE`, and the result is capped at `REWARD_CAP_NET_WORTH` of net worth. The haul's
 * own freight revenue is on top of that and pays most of the running cost, so the shares are well below 1.
 */
import type { Difficulty } from "./finance";
import { WORLD_SCALE } from "./scale";

export type ContractKind = "delivery" | "connection" | "service" | "rescue";

export const CONTRACT_KINDS: readonly ContractKind[] = [
  "delivery",
  "connection",
  "service",
  "rescue",
];

/** Relative chance of each kind when several have a candidate. */
export const KIND_WEIGHT: Record<ContractKind, number> = {
  delivery: 4,
  connection: 3,
  service: 3,
  rescue: 2,
};

/** Months of play, and stations (not passing loops), before the first offer: there must be a network to deal with. */
export const MIN_MONTHS_BEFORE_OFFERS = 12;
export const MIN_STATIONS = 2;

/** A new offer every `OFFER_GAP_MONTHS[0]`..`[1]` months; an offer lapses after `OFFER_LIFE_MONTHS`. */
export const OFFER_GAP_MONTHS: readonly [number, number] = [4, 8];
export const OFFER_LIFE_MONTHS = 3;
export const MAX_OFFERS = 3;
export const MAX_ACTIVE = 2;

/** Failing (deadline or abandoning) costs this share of the reward, and the towns are wary for a while. */
export const PENALTY_SHARE = 0.1;
export const WARY_MONTHS = 8;

/** Extra reward on top of the effort estimate, drawn uniformly. */
export const MARGIN_RANGE: readonly [number, number] = [0.3, 0.6];
/** The share of the rolling stock's price and of the operating cost that a contract's reward covers. */
/** Track stays an asset (half its cost counts in net worth), so the reward covers only half of the missing link. */
export const TRACK_SHARE = 0.5;
export const STOCK_SHARE = 0.3;
export const OP_SHARE = 0.3;
/** A reward is never more than this share of net worth, so late contracts do not print money. */
export const REWARD_CAP_NET_WORTH = 0.25;
/** The smallest reward worth an offer, at 1830 prices (× the price level of the year). */
export const MIN_REWARD_1830 = 8_000;

export const DIFFICULTY_REWARD_MULT: Record<Difficulty, number> = {
  easy: 1.25,
  normal: 1,
  hard: 0.8,
};
/** Longer deadlines on Easy, shorter on Hard. */
export const DIFFICULTY_DEADLINE_MULT: Record<Difficulty, number> = {
  easy: 1.25,
  normal: 1,
  hard: 0.85,
};

/** Offers concern places within `REACH_FACTOR` × the average line length of the network (never less than `MIN_REACH_TILES`). */
export const REACH_FACTOR = 1.5;
export const MIN_REACH_TILES = 14 * WORLD_SCALE;
export const DEFAULT_LINE_TILES = 12 * WORLD_SCALE;
/** A freight haul must be at least this far (the revenue minimum is 6 tiles) so every delivery pays and counts. */
export const MIN_HAUL_TILES = 8 * WORLD_SCALE;

/** The quantity asked for is at most this share of what the source can make in the time. */
export const SUPPLY_SHARE = 0.6;
/** Passengers between two towns: the share of a town's riders that go to one particular town. */
export const PAIR_PASSENGER_SHARE = 0.5;
/** Quantities are rounded to a multiple of this many full cars. */
export const ROUND_TO_CARS = 2;

/** Effective average speed of a train over a route, as a share of the engine's top speed (stops, grades, curves). */
export const EFFECTIVE_SPEED_SHARE = 0.5;
/** Deadline = set-up time + this many times the round-trip time per trip needed, within the kind's month range. */
export const SETUP_DAYS = 90;
export const TRIP_SLACK = 2.5;
export const TRIP_LOAD_DAYS = 10;

export const DEADLINE_MONTHS: Record<ContractKind, readonly [number, number]> = {
  delivery: [6, 18],
  connection: [24, 36],
  service: [12, 12],
  rescue: [18, 18],
};

export const CONNECTION = {
  /** The town pays this share of the qualifying track cost. */
  subsidyShare: 0.5,
  /** The cap is the estimated route cost × this, since the player's route may be dearer than the estimate. */
  capSlack: 1.25,
  /** Track within the ellipse (distance to the anchor + to the town ≤ this × their separation, plus a margin) qualifies. */
  corridorFactor: 1.3,
  corridorMarginTiles: 4,
  minTiles: 8 * WORLD_SCALE,
};

export const RESCUE = {
  /** A mine counts as unserved when trains carry less than this share of its output. */
  maxCarriedShare: 0.05,
  /** The share of its output over the deadline the rescuer must haul. */
  haulShare: 0.4,
  /** Success lifts the producer's output multiplier by this factor, failure cuts it (within its usual bounds). */
  successGrowth: 1.2,
  failureDecline: 0.8,
};
