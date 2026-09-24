/** GameState: the map plus the game's single seeded RNG stream (SPEC §1, §12). */
import { createRng, type RngState } from "./rng";
import { generateMap, type MapGenOptions } from "./map/generate";
import type { GameMap } from "./map/types";

export interface GameState {
  seed: number;
  rng: RngState;
  map: GameMap;
}

export interface NewGameOptions extends MapGenOptions {
  seed: number;
}

/**
 * Creates a fresh game state. Map generation consumes from the same RNG stream stored in the
 * returned state, so later phases (city naming, industry dynamics, ...) continue it deterministically.
 */
export function createGameState(options: NewGameOptions): GameState {
  const rng = createRng(options.seed);
  const map = generateMap(rng, options);
  return { seed: options.seed, rng, map };
}
