/** Phase 41: the jam toast knows where a passing loop would go and what it costs. */
import { describe, expect, it } from "vitest";
import {
  buildPassingLoop,
  buildStation,
  buildTrack,
  buyTrain,
  setOrders,
} from "../../../src/sim/commands";
import { suggestPassingLoop } from "../../../src/sim/loopSuggest";
import { advanceOneHour } from "../../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { pushNews } from "../../../src/sim/news";

function line() {
  const map = makeTestMap(["pppppppppppp"]);
  const state = makeTestState(map, { startYear: 1860, cash: 1e9 });
  const path = Array.from({ length: 12 }, (_, x) => tileAt(map, x, 0));
  buildTrack(state, path);
  buildStation(state, path[0]!, "station");
  buildStation(state, path[11]!, "station");
  return { state, path };
}

describe("suggestPassingLoop", () => {
  it("offers the nearest legal tile to the jam, priced, and never a station tile", () => {
    const { state, path } = line();
    const found = suggestPassingLoop(state, path[0]!); // a station: not a legal loop spot
    expect(found).toBeUndefined();
    const mid = suggestPassingLoop(state, path[5]!)!;
    expect(mid.tile).toBe(path[5]);
    expect(mid.cost).toBeGreaterThan(0);
  });

  it("looks along the route of a train caught in the jam", () => {
    const { state, path } = line();
    const [a, b] = state.stations;
    const bought = buyTrain(state, a!.id, "american-4-4-0", ["passengers"]);
    expect(bought.ok).toBe(true);
    setOrders(state, state.trains[0]!.id, [
      { stationId: a!.id, rule: "auto" },
      { stationId: b!.id, rule: "auto" },
    ]);
    for (let i = 0; i < 24; i++) advanceOneHour(state);
    const found = suggestPassingLoop(state, path[0]!)!;
    expect(path).toContain(found.tile);
    expect(buildPassingLoop(state, found.tile)).toMatchObject({ ok: true });
    expect(suggestPassingLoop(state, found.tile)?.tile).not.toBe(found.tile);
  });

  it("a jam near the same place is one news item, whichever stop the trains were heading for", () => {
    const { state, path } = line();
    pushNews(state, { kind: "trafficJam", tile: path[5]!, toStationId: 0 });
    pushNews(state, { kind: "trafficJam", tile: path[5]!, toStationId: 1 });
    expect(state.news.filter((n) => n.kind === "trafficJam")).toHaveLength(1);
  });
});
