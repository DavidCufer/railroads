import { describe, expect, it } from "vitest";
import { isTrainStuck, nextStuck, STUCK_WAIT_DAYS } from "../../src/ui/stuckTrains";
import type { Train } from "../../src/sim/trains/types";

const train = (id: number, status: string, waitTicks = 0): Train =>
  ({ id, status, waitTicks, orders: [{}, {}] }) as unknown as Train;

describe("stuck trains (Phase 28B)", () => {
  it("flags noRoute, stuck and broken, and long waits only", () => {
    expect(isTrainStuck(train(1, "noRoute"))).toBe(true);
    expect(isTrainStuck(train(1, "broken"))).toBe(true);
    expect(isTrainStuck(train(1, "waitingForBlock", (STUCK_WAIT_DAYS + 1) * 24))).toBe(true);
    expect(isTrainStuck(train(1, "waitingForBlock", 24))).toBe(false);
    expect(isTrainStuck(train(1, "moving"))).toBe(false);
  });
  it("ignores unknown statuses", () => {
    expect(isTrainStuck(train(1, "inYard"))).toBe(false);
  });
  it("flags a train left with fewer than two stops (a demolished station, Phase 29 B)", () => {
    expect(isTrainStuck({ ...train(1, "moving"), orders: [{}] } as unknown as Train)).toBe(true);
  });
  it("cycles", () => {
    const list = [train(1, "noRoute"), train(2, "noRoute"), train(3, "noRoute")];
    expect(nextStuck(list, null)?.id).toBe(2 - 1);
    expect(nextStuck(list, 1)?.id).toBe(2);
    expect(nextStuck(list, 3)?.id).toBe(1);
    expect(nextStuck([], 1)).toBeNull();
  });
});
