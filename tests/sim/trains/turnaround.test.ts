/** Phase 53C: a train that reverses at a stop spends the locomotive's turnaround there. */
import { describe, expect, it } from "vitest";
import {
  DOUBLE_ENDED_TURNAROUND_HOURS,
  GAME_DAYS_PER_REAL_HOUR,
  TURNAROUND_HOURS,
  locomotiveById,
  turnaroundTicks,
} from "../../../src/data/trains";
import { buyTrain, setOrders } from "../../../src/sim/commands";
import { advanceOneHour } from "../../../src/sim/tick";
import { reversesHere } from "../../../src/sim/trains/loading";
import type { Train } from "../../../src/sim/trains/types";
import { lineWithStops } from "./middleStop.test";

const orders = (ids: number[]) => ids.map((stationId) => ({ stationId, rule: "auto" as const }));

describe("turnaround time", () => {
  it("a real hour of running is three game days, as in every journey", () => {
    expect(GAME_DAYS_PER_REAL_HOUR).toBe(3);
  });

  it("steam turns in about an hour, diesel and electric in half, a double-ended set in a quarter", () => {
    const steam = locomotiveById("norris-4-2-0")!;
    expect(turnaroundTicks(steam)).toBe(TURNAROUND_HOURS.steam * 72);
    const electric = locomotiveById("high-speed-trainset")!;
    expect(electric.doubleEnded).toBe(true);
    expect(turnaroundTicks(electric)).toBe(DOUBLE_ENDED_TURNAROUND_HOURS * 72);
    expect(turnaroundTicks(electric)).toBeLessThan(turnaroundTicks(steam));
  });
});

describe("where a train reverses", () => {
  const train = (ids: number[], at: number): Train =>
    ({ orders: orders(ids), currentOrderIndex: at }) as unknown as Train;

  it("every stop of a shuttle", () => {
    expect(reversesHere(train([1, 2], 0))).toBe(true);
    expect(reversesHere(train([1, 2], 1))).toBe(true);
  });

  it("the ends of a there-and-back line, not the middle", () => {
    const line = [1, 2, 3, 2];
    expect(reversesHere(train(line, 0))).toBe(true);
    expect(reversesHere(train(line, 1))).toBe(false);
    expect(reversesHere(train(line, 2))).toBe(true);
    expect(reversesHere(train(line, 3))).toBe(false);
  });

  it("not a loop, and not a single stop", () => {
    expect(reversesHere(train([1, 2, 3], 1))).toBe(false);
    expect(reversesHere(train([1], 0))).toBe(false);
  });
});

describe("a shuttle at its terminus", () => {
  it("is Turning, and stays the turnaround longer than at a stop it does not reverse at", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1860);
    for (const s of state.stations) s.hasEngineShed = true;
    const [a, b, c] = stationIds;
    expect(buyTrain(state, a!, "american-4-4-0", ["passengers"]).ok).toBe(true);
    const t = state.trains[state.trains.length - 1] as Train;
    expect(setOrders(state, t.id, orders([a!, b!, c!, b!])).ok).toBe(true);
    const loco = locomotiveById(t.locoModelId)!;
    const dwell = new Map<number, { turning: boolean; ticks: number }>();
    let last = -1;
    let ticks = 0;
    for (let i = 0; i < 24 * 200 && !(t.currentOrderIndex === 3 && t.status === "moving"); i++) {
      advanceOneHour(state);
      if (t.status === "loading") {
        if (t.currentOrderIndex !== last) {
          last = t.currentOrderIndex;
          ticks = 0;
        }
        ticks++;
        dwell.set(t.currentOrderIndex, { turning: !!t.turning, ticks });
      }
    }
    expect(dwell.get(1)?.turning).toBe(false); // b on the way out: normal dwell
    expect(dwell.get(2)?.turning).toBe(true); // c: the end of the run
    expect(dwell.get(2)!.ticks).toBeGreaterThanOrEqual(turnaroundTicks(loco));
    expect(dwell.get(1)!.ticks).toBeLessThan(turnaroundTicks(loco));
  });
});
