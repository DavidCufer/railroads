import { describe, expect, it } from "vitest";
import { clearAllNews } from "../../src/sim/commands";
import { pushNews } from "../../src/sim/news";
import { makeTestMap, makeTestState } from "./track/helpers";

const DAY = 24;

function setup() {
  return makeTestState(makeTestMap(["ppppp"]));
}

describe("news collapsing", () => {
  it("folds repeats of the same kind and place within 60 days into one counted item", () => {
    const state = setup();
    pushNews(state, { kind: "breakdown", trainId: 1 });
    state.ticks += 20 * DAY;
    pushNews(state, { kind: "breakdown", trainId: 1 });
    state.ticks += 20 * DAY;
    pushNews(state, { kind: "breakdown", trainId: 1 });
    expect(state.news).toHaveLength(1);
    expect(state.news[0]?.count).toBe(3);
    expect(state.pendingNews).toHaveLength(1);
    pushNews(state, { kind: "breakdown", trainId: 2 });
    expect(state.news).toHaveLength(2);
  });

  it("starts a new item after 60 quiet days", () => {
    const state = setup();
    pushNews(state, { kind: "breakdown", trainId: 1 });
    state.ticks += 61 * DAY;
    pushNews(state, { kind: "breakdown", trainId: 1 });
    expect(state.news).toHaveLength(2);
  });

  it("reports a traffic jam at most once per 30 days per place", () => {
    const state = setup();
    pushNews(state, { kind: "trafficJam", tile: 1 });
    state.ticks += 10 * DAY;
    pushNews(state, { kind: "trafficJam", tile: 1 });
    expect(state.news[0]?.count).toBeUndefined();
    state.ticks += 25 * DAY;
    pushNews(state, { kind: "trafficJam", tile: 1 });
    expect(state.news).toHaveLength(1);
    expect(state.news[0]?.count).toBe(2);
  });

  it("clearAllNews empties the list and keeps it read", () => {
    const state = setup();
    pushNews(state, { kind: "breakdown", trainId: 1 });
    expect(clearAllNews(state).ok).toBe(true);
    expect(state.news).toHaveLength(0);
    pushNews(state, { kind: "breakdown", trainId: 1 });
    expect(state.news).toHaveLength(1);
  });
});
