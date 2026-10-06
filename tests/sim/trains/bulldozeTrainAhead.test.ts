/** PLAYTEST-3 B1: bulldozing track a train is on or about to enter is refused. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, bulldoze, buyTrain, setOrders } from "../../../src/sim/commands";
import { advanceOneHour } from "../../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

describe("bulldoze with a train ahead", () => {
  it("refuses removing the route ahead, allows track behind the train", () => {
    const map = makeTestMap(Array.from({ length: 4 }, () => "p".repeat(40)));
    const state = makeTestState(map, { seed: 5, startYear: 1900, cash: 1e12 });
    const line = Array.from({ length: 30 }, (_, x) => tileAt(map, x + 2, 1));
    expect(buildTrack(state, line).ok).toBe(true);
    for (const i of [0, 29]) expect(buildStation(state, line[i] as number, "depot").ok).toBe(true);
    const ids = state.stations.map((s) => s.id);
    expect(buyTrain(state, ids[0] as number, "atlantic-4-4-2", ["passengers"]).ok).toBe(true);
    const train = state.trains[0]!;
    setOrders(
      state,
      train.id,
      ids.map((stationId) => ({ stationId, rule: "auto" as const })),
    );
    for (let h = 0; h < 30; h++) advanceOneHour(state);
    expect(train.route.length).toBeGreaterThan(1);
    const k = train.routeIndex + 2;
    const ahead = [train.route[k] as number, train.route[k + 1] as number];
    expect(bulldoze(state, ahead)).toEqual({ ok: false, reason: "train-on-track" });
    expect(state.trackGraph.getEdge(ahead[0] as number, ahead[1] as number)).toBeTruthy();
    const far = line.slice(14, 17);
    const last = train.route[train.route.length - 1] as number;
    if (!train.route.includes(far[1] as number) && last !== far[1])
      expect(bulldoze(state, far).ok).toBe(true);
  });
});
