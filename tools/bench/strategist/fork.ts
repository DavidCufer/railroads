/**
 * Phase 82: fork a game together with the bot that plays it. The game state goes through the save format (the same
 * path a save/load takes); the bot's memory is plain data (`exportMemory`) and is looked up again by id in the new state.
 */
import { deserializeGameState, serializeGameState } from "../../../src/save/serialize";
import type { GameState } from "../../../src/sim/state";
import { createStrongBot, type StrongBot } from "../strongBot";

export function forkState(state: GameState): GameState {
  return deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
}

export function forkBot(bot: StrongBot): StrongBot {
  const state = forkState(bot.state);
  return createStrongBot(state, bot.exportMemory());
}
