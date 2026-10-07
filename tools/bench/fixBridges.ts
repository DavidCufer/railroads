/** A heavy engine parked behind a wooden bridge: rebuild that bridge in stone, as a player would from the train panel
 * (Phase 41, PLAYTEST-4 B1). Shared by the bench bots; a no-op on builds without the command. */
import * as commands from "../../src/sim/commands";
import { locomotiveById } from "../../src/data/trains";
import type { GameState } from "../../src/sim/state";
import { trainWeightBridgeBlock } from "../../src/sim/trains/bridgeBlock";

const upgrade = (commands as unknown as Record<string, unknown>)["upgradeBridge"] as
  ((s: GameState, a: number, b: number) => unknown) | undefined;

export function fixWeightBridges(state: GameState): void {
  if (!upgrade) return;
  for (const train of state.trains) {
    if (train.status !== "noRoute") continue;
    const loco = locomotiveById(train.locoModelId);
    if (!loco) continue;
    const edge = trainWeightBridgeBlock(state, train, loco.weightClass, false);
    if (edge) upgrade(state, edge.a, edge.b);
  }
}
