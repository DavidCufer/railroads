/** GameState: the map plus the game's single seeded RNG stream (SPEC §1, §12). */
import { createRng, type RngState } from "./rng";
import { generateMap, type MapGenOptions } from "./map/generate";
import type { GameMap } from "./map/types";
import type { City, Industry } from "./economy/types";
import { DEFAULT_START_YEAR } from "../data/mapGen";

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
}

export interface NewGameOptions extends MapGenOptions {
  seed: number;
  startYear?: number;
}

/**
 * Creates a fresh game state. Map generation consumes from the same RNG stream stored in the
 * returned state, so later phases (industry dynamics, ...) continue it deterministically.
 */
export function createGameState(options: NewGameOptions): GameState {
  const rng = createRng(options.seed);
  const startYear = options.startYear ?? DEFAULT_START_YEAR;
  const { map, cities, industries } = generateMap(rng, options, startYear);
  return { seed: options.seed, rng, map, cities, industries, startYear, ticks: 0 };
}
