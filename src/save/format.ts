/**
 * On-disk save shape (SPEC §13). `GameState` isn't JSON-safe as-is — typed arrays, `Map`s, a
 * `Set` and the `TrackGraph` class all need a plain-JSON substitute — so this defines exactly
 * what that substitute looks like, version by version. src/save/serialize.ts converts between
 * `GameState` and `SerializedGameStateV2` (the current version); src/save/migrate.ts upgrades an
 * older `version` to the current one before serialize.ts ever sees it.
 */
import type { RngState } from "../sim/rng";
import type { Difficulty } from "../data/finance";
import type { LedgerPeriod } from "../data/finance";
import type { CargoType } from "../data/cargo";
import type { City, CityGrowthState, Industry, IndustryEconomyState } from "../sim/economy/types";
import type { Station } from "../sim/stations/types";
import type { Train } from "../sim/trains/types";
import type { NewsItem } from "../sim/news";
import type { Goal } from "../sim/goals/types";
import type { RegionId } from "../sim/regions";
import type { PendingCityFounding } from "../sim/regions";
import type { TrackEdge } from "../sim/track/types";
import type { DeliveryEvent, StationCargoPile } from "../sim/state";

export const CURRENT_SAVE_VERSION = 2;

/** `GameMap`'s typed arrays, each base64-packed (src/save/typedArray.ts) — exact byte round trip,
 * no precision loss (unlike the region-JSON codec's fixed-point elevationRaw). Unchanged since v1. */
export interface SerializedGameMapV1 {
  width: number;
  height: number;
  terrainB64: string;
  elevationB64: string;
  elevationRawB64: string;
  riverFlowB64: string;
  riverNextB64: string;
  cityIdB64: string;
  industryIdB64: string;
}

/** The pre-Phase-15 `Train`/`HeldBlock` shape (SPEC §7.5's old per-block-at-a-time reservation) —
 * frozen here, independent of the live `Train` type, purely so `migrate.ts`'s v1→v2 step has
 * something concrete to convert *from*. Never constructed by current code. */
export interface SerializedHeldBlockV1 {
  blockId: number;
  direction: number;
  distanceInto: number;
}
export type SerializedTrainV1 = Omit<
  Train,
  "blockPenalties" | "heldBlocks" | "distanceTraveled"
> & {
  blockPenalties: Array<[number, number]>;
  heldBlocks: SerializedHeldBlockV1[];
};

/** The current (SPEC §7.5, rewritten after play-testing) `Train` shape — station-to-station
 * section reservation, `distanceTraveled`, and the Phase 15 consist-edit queue. */
export type SerializedTrainV2 = Omit<Train, "blockPenalties"> & {
  blockPenalties: Array<[number, number]>;
};

export interface SerializedFinanceStateV1 {
  loans: number;
  capitalInvested: number;
  thisMonth: LedgerPeriod;
  thisYear: LedgerPeriod;
  lastYear: LedgerPeriod;
  netWorthHistory: Array<{ tick: number; cash: number; netWorth: number }>;
  negativeCashMonths: number;
  bankrupt: boolean;
}

/** The full `GameState`, minus `stationEconomy` (a pure cache of map+cities+industries+stations,
 * recomputed on load by src/sim/commands.ts's `refreshStationEconomy` rather than persisted).
 * Generic over the train shape so v1 and v2 can share every other field 1:1. */
interface SerializedGameStateBase<TTrain> {
  seed: number;
  rng: RngState;
  map: SerializedGameMapV1;
  cities: City[];
  industries: Industry[];
  startYear: number;
  ticks: number;
  difficulty: Difficulty;
  cash: number;
  trackEdges: TrackEdge[];
  stations: Station[];
  nextStationId: number;
  trains: TTrain[];
  nextTrainId: number;
  trackVersion: number;
  stationCargo: Array<[number, Partial<Record<CargoType, StationCargoPile>>]>;
  industryEconomy: Array<[number, IndustryEconomyState]>;
  finance: SerializedFinanceStateV1;
  pendingDeliveries: DeliveryEvent[];
  news: NewsItem[];
  nextNewsId: number;
  pendingNews: NewsItem[];
  newsReadUpTo: number;
  cityGrowth: Array<[number, CityGrowthState]>;
  mapContentVersion: number;
  regionId?: RegionId;
  pendingCityFoundings: PendingCityFounding[];
  goals: Goal[];
  goalsCompleted: string[];
  pendingGoalCelebrations: Goal[];
  cargoDeliveredThisYear: Partial<Record<CargoType, number>>;
  cargoDeliveredBestYear: Partial<Record<CargoType, number>>;
}

export type SerializedGameStateV1 = SerializedGameStateBase<SerializedTrainV1>;
export type SerializedGameStateV2 = SerializedGameStateBase<SerializedTrainV2>;

/** Slot-listing metadata (SPEC §13: "Load menu shows slot name, company date, cash, map") — kept
 * alongside `state` so the Load screen can render a slot's card without deserializing/decoding
 * every typed array in every slot just to draw a list. */
export interface SaveMeta {
  /** Manual-slot display name; undefined for autosaves (the slot id/label is used instead). */
  name?: string;
  savedAt: number;
  year: number;
  month: number;
  day: number;
  cash: number;
  mapLabel: string;
}

export interface SaveFileV1 {
  version: 1;
  meta: SaveMeta;
  state: SerializedGameStateV1;
}

export interface SaveFileV2 {
  version: 2;
  meta: SaveMeta;
  state: SerializedGameStateV2;
}

export type AnySaveFile = SaveFileV1 | SaveFileV2;
