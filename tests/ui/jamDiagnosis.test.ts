import { describe, expect, it } from "vitest";
import { diagnoseJam } from "../../src/ui/jamDiagnosis";
import { formatNewsItem } from "../../src/ui/newsPanel";
import { makeTestMap, makeTestState } from "../sim/track/helpers";
import type { GameState } from "../../src/sim/state";
import type { Train } from "../../src/sim/trains/types";

function jamState(double: boolean, trains: number): GameState {
  const state = makeTestState(makeTestMap(["ppp", "ppp", "ppp"]));
  state.trackGraph.addEdge({ a: 3, b: 4, double } as never);
  state.trackGraph.addEdge({ a: 4, b: 5, double } as never);
  state.trains = Array.from(
    { length: trains },
    (_, i) => ({ id: i, route: [3, 4, 5] }) as unknown as Train,
  );
  return state;
}

describe("jam diagnosis (Phase 30B)", () => {
  it("counts the trains on the stretch and reads the track type", () => {
    expect(diagnoseJam(jamState(false, 3), 4)).toEqual({ trains: 3, singleTrack: true });
    expect(diagnoseJam(jamState(true, 2), 4)).toEqual({ trains: 2, singleTrack: false });
  });
  it("names the fix in the news text", () => {
    const item = { id: 1, tick: 0, kind: "trafficJam", tile: 4 } as const;
    expect(formatNewsItem(jamState(false, 3), item)).toContain("3 trains share a single line near");
    expect(formatNewsItem(jamState(false, 3), item)).toContain("passing loop or double track");
    expect(formatNewsItem(jamState(true, 3), item)).toContain("3 trains queue near");
    expect(formatNewsItem(jamState(false, 1), item)).toContain("Traffic jam near");
  });
});
