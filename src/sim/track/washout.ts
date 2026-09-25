/**
 * Wooden bridge washouts (SPEC §5.3): "a 1%/year per bridge chance of washout in a flood event
 * (bridge destroyed, news message, trains reroute or wait)". Called once per year from
 * src/sim/tick.ts. Stone/steel bridges never wash out.
 */
import { WOODEN_BRIDGE_WASHOUT_CHANCE_PER_YEAR } from "../../data/track";
import { pushNews } from "../news";
import { nextFloat } from "../rng";
import type { GameState } from "../state";

export function yearlyWashoutStep(state: GameState): void {
  const woodenBridges = state.trackGraph.allEdges().filter((e) => e.bridge === "wood");
  for (const edge of woodenBridges) {
    if (nextFloat(state.rng) >= WOODEN_BRIDGE_WASHOUT_CHANCE_PER_YEAR) continue;
    state.trackGraph.removeEdge(edge.a, edge.b);
    state.finance.capitalInvested -= edge.cost;
    state.trackVersion++;
    pushNews(state, { kind: "washout", tile: edge.a });
  }
}
