/** GameState: the map plus the game's single seeded RNG stream (SPEC §1, §12). */
import { createRng, type RngState } from "./rng";
import { generateMap, type MapGenOptions } from "./map/generate";
import type { GameMap } from "./map/types";
import type { City, Industry } from "./economy/types";
import { DEFAULT_START_YEAR } from "../data/mapGen";
import { DEFAULT_DIFFICULTY, DIFFICULTY, type Difficulty } from "../data/finance";
import { TrackGraph } from "./track/graph";
import type { Station } from "./stations/types";
import type { StationEconomy } from "./stations/economy";

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
  };
}
