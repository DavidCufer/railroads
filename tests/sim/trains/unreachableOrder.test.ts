/** PLAN Phase 18 B: an unreachable next stop is reported once and skipped, not waited on forever. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { advanceOneHour } from "../../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

describe("unreachable order", () => {
  it("skips to the next reachable stop and reports the dead one once", () => {
    const map = makeTestMap(Array.from({ length: 8 }, () => "p".repeat(14)));
    const state = makeTestState(map, { startYear: 1900, cash: 1e12 });
    const row = (y: number) => Array.from({ length: 14 }, (_, x) => tileAt(map, x, y));
    expect(buildTrack(state, row(0)).ok).toBe(true);
    expect(buildTrack(state, row(6)).ok).toBe(true); // a separate, disconnected line
    expect(buildStation(state, tileAt(map, 1, 0), "station").ok).toBe(true);
    expect(buildStation(state, tileAt(map, 12, 0), "station").ok).toBe(true);
    expect(buildStation(state, tileAt(map, 6, 6), "station").ok).toBe(true);
    const [a, c, d] = state.stations;
    expect(buyTrain(state, a!.id, "american-4-4-0", ["coal"]).ok).toBe(true);
    const train = state.trains[0]!;
    setOrders(state, train.id, [
      { stationId: a!.id, rule: "auto" },
      { stationId: d!.id, rule: "auto" },
      { stationId: c!.id, rule: "auto" },
    ]);
    let reachedC = false;
    for (let i = 0; i < 24 * 40 && !reachedC; i++) {
      advanceOneHour(state);
      if (train.status === "loading" && train.route[0] === c!.tile) reachedC = true;
    }
    expect(reachedC).toBe(true);
    expect(train.status).not.toBe("noRoute");
    expect(state.news.filter((n) => n.kind === "noRoute")).toHaveLength(1);
  });

  it("parks in noRoute (and says so) when no order is reachable", () => {
    const map = makeTestMap(Array.from({ length: 8 }, () => "p".repeat(14)));
    const state = makeTestState(map, { startYear: 1900, cash: 1e12 });
    const row = (y: number) => Array.from({ length: 14 }, (_, x) => tileAt(map, x, y));
    buildTrack(state, row(0));
    buildTrack(state, row(6));
    buildStation(state, tileAt(map, 1, 0), "station");
    buildStation(state, tileAt(map, 6, 6), "station");
    buyTrain(state, state.stations[0]!.id, "american-4-4-0", ["coal"]);
    const train = state.trains[0]!;
    setOrders(state, train.id, [
      { stationId: state.stations[0]!.id, rule: "auto" },
      { stationId: state.stations[1]!.id, rule: "auto" },
    ]);
    for (let i = 0; i < 24 * 5; i++) advanceOneHour(state);
    expect(train.status).toBe("noRoute");
    expect(state.news.filter((n) => n.kind === "noRoute")).toHaveLength(1);
  });
});
