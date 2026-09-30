/** PLAN Phase 27 D: news text never shows a bare "?" — a failed place/train/station lookup falls back to words. */
import { describe, expect, it } from "vitest";
import { formatNewsItem } from "../../src/ui/newsPanel";
import { makeTestMap, makeTestState } from "../sim/track/helpers";
import type { NewsItem } from "../../src/sim/news";

describe("news text fallbacks", () => {
  it("never contains '?' when every lookup fails (empty map, sold train, bulldozed station)", () => {
    const state = makeTestState(makeTestMap(["ppp", "ppp", "ppp"]));
    const items: NewsItem[] = [
      { id: 1, tick: 0, kind: "newLocomotive", locoId: "no-such-loco" },
      { id: 2, tick: 0, kind: "breakdown", trainId: 99 },
      { id: 3, tick: 0, kind: "washout", tile: 4 },
      { id: 4, tick: 0, kind: "trafficJam", tile: 4 },
      { id: 5, tick: 0, kind: "noRoute", trainId: 99, stationId: 99 },
      { id: 6, tick: 0, kind: "undeliverable", trainId: 99, cars: 2, cargo: "coal" },
      { id: 7, tick: 0, kind: "cityGrowth", cityId: 42, tier: "town" },
      { id: 8, tick: 0, kind: "civicInvestment", cityId: 42 },
      { id: 9, tick: 0, kind: "cityFounded", cityId: 42 },
      { id: 10, tick: 0, kind: "discovery", industryId: 42 },
      { id: 11, tick: 0, kind: "goalCompleted", goalId: "missing", tier: "gold" },
    ];
    for (const item of items) {
      const text = formatNewsItem(state, item);
      expect(text, JSON.stringify(item)).not.toContain("?");
      expect(text.length).toBeGreaterThan(5);
    }
  });
});
