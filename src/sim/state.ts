/** GameState: the map plus the game's single seeded RNG stream (SPEC §1, §12). */
import { createRng, type RngState } from "./rng";
import { generateMap, type MapGenOptions } from "./map/generate";
import type { GameMap } from "./map/types";
import type { City, Industry, IndustryEconomyState } from "./economy/types";
import { initIndustryEconomy } from "./economy/processing";
import { DEFAULT_START_YEAR } from "../data/mapGen";
import { DEFAULT_DIFFICULTY, DIFFICULTY, type Difficulty } from "../data/finance";
import type { CargoType } from "../data/cargo";
import { TrackGraph } from "./track/graph";
import type { Station } from "./stations/types";
import type { StationEconomy } from "./stations/economy";
import type { Train } from "./trains/types";
import { createFinanceState, type FinanceState } from "./finance/types";
import type { NewsItem } from "./news";

/** A station's waiting pile for one cargo type (SPEC §6.3). */
export interface StationCargoPile {
  amount: number;
  /** Consecutive in-game days this pile has gone without any of it being picked up — the decay
   * clock proxy for "cargo older than N days" (there's no per-unit FIFO aging; resets to 0 the
   * moment a train loads any amount, in src/sim/trains/loading.ts). */
  waitingDays: number;
}

/** A delivery just paid out (SPEC §8.1's floating `+$` label) — pushed by
 * src/sim/trains/loading.ts, drained once per rendered frame by the UI so the label's own
 * animation timing (real time, not sim ticks) stays out of src/sim. */
export interface DeliveryEvent {
  stationId: number;
  cargoType: CargoType;
  revenue: number;
}

export interface GameState {
  seed: number;
  rng: RngState;
  map: GameMap;
  cities: City[];
  industries: Industry[];
  /** Scenario start year (SPEC §3: 1830–1950). Fixed for now — Phase 10 adds a new-game picker. */
  startYear: number;
  /** Elapsed sim ticks (1 tick = 1 in-game hour) since `startYear` began. */
  ticks: number;
  difficulty: Difficulty;
  /** Running cash balance (SPEC §9.1). A full ledger by category (§9.2) is Phase 7's job — this
   * phase only needs a single deducted/credited balance for build costs and refunds. */
  cash: number;
  trackGraph: TrackGraph;
  stations: Station[];
  /** Monotonic counter for `Station.id` — not `stations.length`, so ids stay stable if a station
   * is ever removed in a later phase. */
  nextStationId: number;
  /** Per-station supply/acceptance (SPEC §6.3), cached and refreshed by src/sim/commands.ts
   * whenever a station is built or upgraded (see `refreshStationEconomy`). */
  stationEconomy: Map<number, StationEconomy>;
  trains: Train[];
  /** Monotonic counter for `Train.id`. */
  nextTrainId: number;
  /** Bumped by every track command (build/upgrade/bulldoze) — src/sim/trains reroutes and
   * recomputes blocks whenever it sees this change (SPEC §7.3/§7.5's "simplest correct approach"). */
  trackVersion: number;
  /** Per-station waiting cargo (SPEC §6.3), accrued daily by src/sim/economy/cargoFlow.ts and
   * drained by src/sim/trains/loading.ts. */
  stationCargo: Map<number, Partial<Record<CargoType, StationCargoPile>>>;
  /** Per-industry processing state (SPEC §8.2), keyed by `Industry.id`. */
  industryEconomy: Map<number, IndustryEconomyState>;
  /** Ledger, loans, net worth history (SPEC §9). */
  finance: FinanceState;
  /** Deliveries paid out since the last frame drained this — see `DeliveryEvent`. */
  pendingDeliveries: DeliveryEvent[];
  /** News history (SPEC §10.1), capped at `NEWS_HISTORY_MAX` — see src/sim/news.ts. */
  news: NewsItem[];
  /** Monotonic counter for `NewsItem.id`. */
  nextNewsId: number;
  /** News items pushed since the last frame drained this — see `DeliveryEvent`'s same pattern. */
  pendingNews: NewsItem[];
  /** Highest `NewsItem.id` the player has seen (News panel opened) — items with a higher id are
   * "unread" (SPEC §10.1's unread badge). */
  newsReadUpTo: number;
}

export interface NewGameOptions extends MapGenOptions {
  seed: number;
  startYear?: number;
  difficulty?: Difficulty;
}

/**
 * Creates a fresh game state. Map generation consumes from the same RNG stream stored in the
 * returned state, so later phases (industry dynamics, ...) continue it deterministically.
 */
export function createGameState(options: NewGameOptions): GameState {
  const rng = createRng(options.seed);
  const startYear = options.startYear ?? DEFAULT_START_YEAR;
  const { map, cities, industries } = generateMap(rng, options, startYear);
  const difficulty = options.difficulty ?? DEFAULT_DIFFICULTY;
  return {
    seed: options.seed,
    rng,
    map,
    cities,
    industries,
    startYear,
    ticks: 0,
    difficulty,
    cash: DIFFICULTY[difficulty].startingCash,
    trackGraph: new TrackGraph(),
    stations: [],
    nextStationId: 0,
    stationEconomy: new Map(),
    trains: [],
    nextTrainId: 0,
    trackVersion: 0,
    stationCargo: new Map(),
    industryEconomy: initIndustryEconomy(industries),
    finance: createFinanceState(),
    pendingDeliveries: [],
    news: [],
    nextNewsId: 0,
    pendingNews: [],
    newsReadUpTo: -1,
  };
}
