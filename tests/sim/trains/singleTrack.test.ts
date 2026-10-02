/**
 * Phase 30A (PLAYTEST-2 Bug 3 / Top 10 #6): single-track capacity. A passing loop lets opposing trains meet mid-line
 * instead of at the far terminal, and `TrainOrder.minGapDays` spaces departures so trains stop running in convoys.
 */
import { describe, expect, it } from "vitest";
import { buildPassingLoop, buyTrain, setOrders } from "../../../src/sim/commands";
import { ledgerRevenue } from "../../../src/data/finance";
import { buildRoute, tickDays } from "../balanceRoutes";
import { tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";

const LOCO = "atlantic-4-4-2";

interface Setup {
  trains: number;
  loops?: number;
  gap?: number;
  km?: number;
  pop?: number;
  /** Odd trains start at the far station (opposing traffic from day one). */
  split?: boolean;
}

function build(s: Setup): GameState {
  const { state } = buildRoute({
    cargo: "passengers",
    km: s.km ?? 100,
    year: 1900,
    loco: LOCO,
    population: s.pop ?? 400_000,
    tier: "metropolis",
    cars: 6,
    stationType: "station",
  });
  const [a, b] = [state.stations[0]!, state.stations[1]!];
  b.hasEngineShed = true;
  const tiles = state.map.width - 3;
  const loops = s.loops ?? 0;
  for (let i = 1; i <= loops; i++) {
    state.cash = 1e12;
    const x = 1 + Math.round((tiles * i) / (loops + 1));
    expect(buildPassingLoop(state, tileAt(state.map, x, 2)).ok).toBe(true);
  }
  const orders = (forward: boolean) =>
    (forward ? [a, b] : [b, a]).map((st) => ({
      stationId: st.id,
      rule: "auto" as const,
      ...(s.gap ? { minGapDays: s.gap } : {}),
    }));
  expect(setOrders(state, state.trains[0]!.id, orders(true)).ok).toBe(true);
  for (let i = 1; i < s.trains; i++) {
    state.cash = 1e12;
    const from = s.split && i % 2 === 1 ? b : a;
    expect(buyTrain(state, from.id, LOCO, Array(6).fill("passengers") as never).ok).toBe(true);
    const t = state.trains[state.trains.length - 1]!;
    expect(setOrders(state, t.id, orders(s.split ? from === a : true)).ok).toBe(true);
  }
  return state;
}

function yearlyRevenue(s: Setup, years = 3): number {
  const state = build(s);
  for (let y = 0; y < years; y++) tickDays(state, 360);
  return ledgerRevenue(state.finance.lastYear);
}

describe("passing loops", () => {
  it("a loop is cheap, only goes on plain single track, and is not a stop", () => {
    const { state } = buildRoute({ cargo: "passengers", km: 100, year: 1900, loco: LOCO });
    state.cash = 1e12;
    const tile = tileAt(state.map, 10, 2);
    const cash = state.cash;
    expect(buildPassingLoop(state, tile).ok).toBe(true);
    expect(cash - state.cash).toBeLessThan(40_000);
    expect(buildPassingLoop(state, tile).ok).toBe(false); // occupied
    expect(buildPassingLoop(state, tileAt(state.map, 0, 0)).ok).toBe(false); // no track
    const loop = state.stations.find((s) => s.passingLoop)!;
    expect(state.stationEconomy.get(loop.id)?.accepts).toEqual([]);
    expect(
      setOrders(state, state.trains[0]!.id, [
        { stationId: state.stations[0]!.id, rule: "auto" },
        { stationId: loop.id, rule: "auto" },
      ]).ok,
    ).toBe(false);
  });

  it("opposing trains meet in the loop instead of the far terminal", () => {
    // 300 km single line, one train leaving each end at the same time: without a loop the second waits ~10 days.
    const plain = build({ trains: 2, split: true, km: 300 });
    const looped = build({ trains: 2, split: true, loops: 1, km: 300 });
    tickDays(plain, 6);
    tickDays(looped, 6);
    const far = (s: GameState): number => s.trains[1]!.distanceTraveled;
    expect(far(plain)).toBe(0); // still held at the terminal for the line
    expect(far(looped)).toBeGreaterThan(20); // already well out, will cross at the loop
  });
});

describe("departure spacing", () => {
  it("six trains in a convoy on one single line earn >10 % more when departures are spaced a day apart", () => {
    const convoy = yearlyRevenue({ trains: 6 });
    const spaced = yearlyRevenue({ trains: 6, gap: 1 });
    expect(spaced).toBeGreaterThan(convoy * 1.1);
  });

  it("four spaced trains with passing loops earn more than two trains (without, four earn less than they could)", () => {
    const two = yearlyRevenue({ trains: 2 });
    const four = yearlyRevenue({ trains: 4, loops: 2, gap: 1 });
    expect(four).toBeGreaterThan(two * 1.1);
  });

  it("the headway hold unloads on arrival and only loads at departure", () => {
    const state = build({ trains: 3, gap: 3 });
    tickDays(state, 4);
    const held = state.trains.filter((t) => t.headwayHold);
    for (const t of held) expect(t.cars.every((c) => c.loadedUnits === 0)).toBe(true);
    expect(held.length).toBeGreaterThan(0);
  });
});
