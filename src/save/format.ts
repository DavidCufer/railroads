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
import type { DeliveryEvent, StationCargoPile, TransferLot } from "../sim/state";
import type { StationFlow } from "../sim/stations/flow";
import type { Washout } from "../sim/track/washout";

/** v4 (Phase 23A): the world went from 10 km to 5 km per tile. The state *shape* is unchanged from v3
 * but every coordinate, distance and track edge in a v1–v3 save is on the old grid, so those saves
 * are refused with `OldMapScaleError` (src/save/migrate.ts) rather than migrated. */
export const CURRENT_SAVE_VERSION = 4;

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
  "blockPenalties" | "heldBlocks" | "distanceTraveled" | "cars" | "pendingConsist"
> & {
  blockPenalties: Array<[number, number]>;
  heldBlocks: SerializedHeldBlockV1[];
  // v1 predates Phase 16's real per-cargo capacities (see `SerializedTrainCarV2` below) just as
  // much as it predates Phase 15's `pendingConsist` (which didn't exist yet at v1 either).
  cars: SerializedTrainCarV2[];
  pendingConsist?: { cars: SerializedTrainCarV2[]; removedLoaded: SerializedTrainCarV2[] };
};

/** The pre-Phase-16 `TrainCar` shape (SPEC §7.1's old "1 car = 1 carload, full or empty" model) —
 * frozen here, independent of the live `TrainCar` type, for `migrate.ts`'s v2→v3 step. */
export interface SerializedTrainCarV2 {
  cargoType: CargoType;
  loaded: boolean;
  loadedTile?: number;
  loadedTick?: number;
}

/** The v2 (SPEC §7.5, rewritten after play-testing) `Train` shape — station-to-station section
 * reservation, `distanceTraveled`, and the Phase 15 consist-edit queue — frozen with the old
 * boolean-`loaded` car shape above, since Phase 16 changed `TrainCar` itself. */
export type SerializedTrainV2 = Omit<Train, "blockPenalties" | "cars" | "pendingConsist"> & {
  blockPenalties: Array<[number, number]>;
  cars: SerializedTrainCarV2[];
  pendingConsist?: { cars: SerializedTrainCarV2[]; removedLoaded: SerializedTrainCarV2[] };
};

/** The current (PLAN Phase 16: real per-cargo car capacities, `loadedUnits` replacing the old
 * boolean `loaded`) `Train` shape. */
export type SerializedTrainV3 = Omit<Train, "blockPenalties"> & {
  blockPenalties: Array<[number, number]>;
};

export interface SerializedFinanceStateV1 {
  loans: number;
  capitalInvested: number;
  thisMonth: LedgerPeriod;
  thisYear: LedgerPeriod;
  lastYear: LedgerPeriod;
  /** Absent in saves written before Phase 24A. */
  monthHistory?: LedgerPeriod[];
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
  /** Phase 29: explicit node routes (neighbour-tile pairs). Absent in older saves: junction routes are derived on load. */
  nodeRoutes?: Array<[number, string[]]>;
  stations: Station[];
  nextStationId: number;
  trains: TTrain[];
  nextTrainId: number;
  trackVersion: number;
  stationCargo: Array<[number, Partial<Record<CargoType, StationCargoPile>>]>;
  /** Added in Phase 18 without a version bump: absent in older saves, read as empty. */
  stationTransfer?: Array<[number, TransferLot[]]>;
  /** Added in Phase 30A without a version bump: absent in older saves, read as empty. */
  stationFlow?: Array<[number, StationFlow]>;
  /** Added in Phase 30A without a version bump: bridges washed out and not yet rebuilt. */
  washouts?: Washout[];
  nextWashoutId?: number;
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
export type SerializedGameStateV3 = SerializedGameStateBase<SerializedTrainV3>;

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

export interface SaveFileV3 {
  version: 3;
  meta: SaveMeta;
  state: SerializedGameStateV3;
}

export interface SaveFileV4 {
  version: 4;
  meta: SaveMeta;
  state: SerializedGameStateV3;
}

export type AnySaveFile = SaveFileV1 | SaveFileV2 | SaveFileV3 | SaveFileV4;
