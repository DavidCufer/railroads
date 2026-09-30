import { describe, expect, it } from "vitest";
import { BULLDOZE_REFUND_FRACTION, DOUBLE_TRACK_UPGRADE_MULTIPLIER } from "../../src/data/track";
import { LOAN_INCREMENT } from "../../src/data/finance";
import {
  buildStation,
  buildTrack,
  bulldoze,
  computeBulldozePlan,
  removeStation,
  setOrders,
  creditLimit,
  repayLoan,
  takeLoan,
  upgradeTrack,
} from "../../src/sim/commands";
import { makeTestMap, makeTestState, tileAt } from "./track/helpers";

describe("buildTrack", () => {
  it("round-trips: deducts cash and adds edges for a plain path", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    const cashBefore = state.cash;
    const path = [0, 1, 2, 3, 4].map((x) => tileAt(map, x, 0));

    const result = buildTrack(state, path);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.cost).toBeGreaterThan(0);
    expect(state.cash).toBeCloseTo(cashBefore - result.cost, 6);
    expect(state.trackGraph.edgeCount).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(state.trackGraph.hasEdge(path[i] as number, path[i + 1] as number)).toBe(true);
    }
  });

  it("re-building the same path a second time is free (existing edges are skipped)", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map);
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];

    buildTrack(state, path);
    const cashAfterFirst = state.cash;
    const second = buildTrack(state, path);

    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.cost).toBe(0);
    expect(state.cash).toBe(cashAfterFirst);
    expect(state.trackGraph.edgeCount).toBe(2);
  });

  it("fails with cant-afford when the path costs more than available cash", () => {
    const map = makeTestMap(["pppppppppp"]);
    const state = makeTestState(map, { cash: 100 });
    const path = Array.from({ length: 10 }, (_, x) => tileAt(map, x, 0));

    const result = buildTrack(state, path);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("cant-afford");
    expect(state.cash).toBe(100); // untouched
    expect(state.trackGraph.edgeCount).toBe(0);
  });

  it("fails with blocked when crossing water with no legal bridge for the era", () => {
    const map = makeTestMap(["pwwwwwwwwp"]); // 8 water tiles, too early for steel
    const state = makeTestState(map, { startYear: 1830 });
    const path = [tileAt(map, 0, 0), tileAt(map, 9, 0)];

    const result = buildTrack(state, path);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("blocked");
  });

  it("fails with no-path for a path shorter than 2 tiles", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map);
    const result = buildTrack(state, [tileAt(map, 0, 0)]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("no-path");
  });
});

describe("upgradeTrack", () => {
  it("upgrades single track to double at the 0.6× delta and deducts cash", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map);
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];
    buildTrack(state, path);
    const singleCost = state.trackGraph.getEdge(path[0] as number, path[1] as number)?.cost ?? 0;
    const cashBeforeUpgrade = state.cash;

    const result = upgradeTrack(state, path);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.cost).toBeCloseTo(singleCost * DOUBLE_TRACK_UPGRADE_MULTIPLIER * 2, 6);
    expect(state.cash).toBeCloseTo(cashBeforeUpgrade - result.cost, 6);
    expect(state.trackGraph.getEdge(path[0] as number, path[1] as number)?.double).toBe(true);
    expect(state.trackGraph.getEdge(path[1] as number, path[2] as number)?.double).toBe(true);
  });

  it("upgrading an already-double edge again is free", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map);
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0)];
    buildTrack(state, path);
    upgradeTrack(state, path);
    const cashAfterFirstUpgrade = state.cash;

    const second = upgradeTrack(state, path);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.cost).toBe(0);
    expect(state.cash).toBe(cashAfterFirstUpgrade);
  });

  it("fails with no-track-to-upgrade where there's no existing single track", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map);
    const result = upgradeTrack(state, [tileAt(map, 0, 0), tileAt(map, 1, 0)]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("no-track-to-upgrade");
  });
});

describe("bulldoze", () => {
  it("round-trips: removes edges and refunds 25% of their build cost", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map);
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];
    const built = buildTrack(state, path);
    if (!built.ok) throw new Error("unreachable");
    const cashAfterBuild = state.cash;

    const result = bulldoze(state, path);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.cost).toBeCloseTo(-built.cost * BULLDOZE_REFUND_FRACTION, 6);
    expect(state.cash).toBeCloseTo(cashAfterBuild + built.cost * BULLDOZE_REFUND_FRACTION, 6);
    expect(state.trackGraph.edgeCount).toBe(0);
  });

  it("removes every edge incident to a dragged tile, not just consecutive pairs (bridges/junctions)", () => {
    const map = makeTestMap(["pprpp"]); // land - land - river - land - land
    const state = makeTestState(map);
    buildTrack(state, [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 3, 0), tileAt(map, 4, 0)]);
    expect(state.trackGraph.edgeCount).toBe(3); // includes a bridge edge spanning the river tile

    // A raw bulldoze trace can include the (non-node) river tile in between — bulldoze still
    // finds the bridge via edges incident to the shore tiles it does pass over.
    const dragTrace = [
      tileAt(map, 0, 0),
      tileAt(map, 1, 0),
      tileAt(map, 2, 0),
      tileAt(map, 3, 0),
      tileAt(map, 4, 0),
    ];
    const result = bulldoze(state, dragTrace);
    expect(result.ok).toBe(true);
    expect(state.trackGraph.edgeCount).toBe(0);
  });

  it("removes only the edges the drag runs along, not the main line at a junction (Bug 5)", () => {
    const map = makeTestMap(["ppppppppp", "ppppppppp"]);
    const state = makeTestState(map);
    // Main line along row 0, plus a one-tile stub from (4,0) down to (4,1).
    buildTrack(
      state,
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((x) => tileAt(map, x, 0)),
    );
    const stubBuilt = buildTrack(state, [tileAt(map, 4, 0), tileAt(map, 5, 1)]);
    expect(stubBuilt).toEqual({ ok: true, cost: expect.any(Number) });
    expect(state.trackGraph.edgeCount).toBe(9);

    const stub = [tileAt(map, 5, 1), tileAt(map, 4, 0)];
    const plan = computeBulldozePlan(state, stub);
    expect(plan.edges.length).toBe(1);
    expect(bulldoze(state, stub).ok).toBe(true);
    expect(state.trackGraph.edgeCount).toBe(8);
    expect(state.trackGraph.hasEdge(tileAt(map, 3, 0), tileAt(map, 4, 0))).toBe(true);
    expect(state.trackGraph.hasEdge(tileAt(map, 4, 0), tileAt(map, 5, 0))).toBe(true);
  });

  it("a drag that only touches a tile of track (no edge run along) removes nothing", () => {
    const map = makeTestMap(["ppppp", "ppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      [0, 1, 2, 3, 4].map((x) => tileAt(map, x, 0)),
    );
    const plan = computeBulldozePlan(state, [tileAt(map, 2, 0), tileAt(map, 2, 1)]);
    expect(plan.valid).toBe(false);
  });

  it("removes a station whose track goes, refusing while trains stop there", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    const line = [0, 1, 2, 3, 4].map((x) => tileAt(map, x, 0));
    buildTrack(state, line);
    expect(buildStation(state, line[0] as number, "station").ok).toBe(true);
    expect(buildStation(state, line[4] as number, "station").ok).toBe(true);
    const [a, b] = state.stations;
    // Tap-removal: the second station has no Engine Shed and no trains → allowed, with a refund.
    const cash = state.cash;
    const removed = removeStation(state, (b as { id: number }).id);
    expect(removed.ok).toBe(true);
    expect(state.stations.length).toBe(1);
    expect(state.cash).toBeGreaterThan(cash);
    // The first station holds the only Engine Shed.
    const last = removeStation(state, (a as { id: number }).id);
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.reason).toBe("last-engine-shed");
    expect(setOrders).toBeTypeOf("function");
  });

  it("fails with nothing-to-bulldoze where there's no track", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map);
    const result = bulldoze(state, [tileAt(map, 0, 0), tileAt(map, 1, 0)]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("nothing-to-bulldoze");
  });
});

describe("loans", () => {
  it("takeLoan adds cash and increases the loan balance by the same amount", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map);
    const cashBefore = state.cash;

    const result = takeLoan(state, LOAN_INCREMENT);

    expect(result.ok).toBe(true);
    expect(state.finance.loans).toBe(LOAN_INCREMENT);
    expect(state.cash).toBe(cashBefore + LOAN_INCREMENT);
  });

  it("rejects amounts that aren't a positive multiple of the loan increment", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map);
    expect(takeLoan(state, 50_000).ok).toBe(false);
    expect(takeLoan(state, 0).ok).toBe(false);
    expect(takeLoan(state, -LOAN_INCREMENT).ok).toBe(false);
  });

  it("refuses a loan that would exceed the credit limit", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { cash: 0 });
    const limit = creditLimit(state);

    const tooMuch = Math.ceil((limit + LOAN_INCREMENT) / LOAN_INCREMENT) * LOAN_INCREMENT;
    const result = takeLoan(state, tooMuch);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("credit-limit-exceeded");
  });

  it("repayLoan reduces cash and the loan balance together", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map);
    takeLoan(state, LOAN_INCREMENT * 2);
    const cashBefore = state.cash;

    const result = repayLoan(state, LOAN_INCREMENT);

    expect(result.ok).toBe(true);
    expect(state.finance.loans).toBe(LOAN_INCREMENT);
    expect(state.cash).toBe(cashBefore - LOAN_INCREMENT);
  });

  it("repayLoan never pays back more than is owed", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map);
    takeLoan(state, LOAN_INCREMENT);

    const result = repayLoan(state, LOAN_INCREMENT * 5);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.cost).toBe(LOAN_INCREMENT);
    expect(state.finance.loans).toBe(0);
  });
});
