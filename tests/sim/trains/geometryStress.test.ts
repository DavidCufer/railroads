/** PLAN Phase 27 B: legal junction layouts under load — diamonds over double track, branches off a diagonal
 * double main, a wye — with the render-geometry check on every tick: no two trains' vehicle rectangles ever
 * overlap anywhere on the map, and no crossing wait outlasts the stress threshold. */
import { describe, expect, it } from "vitest";
import { buildStation, buyTrain, setOrders } from "../../../src/sim/commands";
import { createRng, nextInt } from "../../../src/sim/rng";
import { advanceOneHour } from "../../../src/sim/tick";
import { setCrossingForcedReporter } from "../../../src/sim/trains";
import type { CargoType } from "../../../src/data/cargo";
import type { GameState } from "../../../src/sim/state";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { describeOverlap, vehicleOverlapsNow } from "./geometryHelpers";
import { JUNCTION_LAYOUTS, N, type JunctionLayout } from "./layouts";

const DAYS = 250;
const WAIT_LIMIT_HOURS = 60 * 24;

export function scenario(layout: JunctionLayout, seed: number): GameState {
  const map = makeTestMap(Array.from({ length: N }, () => "p".repeat(N)));
  const s = makeTestState(map, { seed, startYear: 1900, cash: 1e12 });
  const pts = layout.build(s);
  const ids: number[] = [];
  for (const [x, y] of pts) {
    expect(buildStation(s, tileAt(s.map, x, y), "terminal").ok).toBe(true);
    const st = s.stations[s.stations.length - 1]!;
    st.hasEngineShed = true;
    ids.push(st.id);
  }
  const rng = createRng(seed * 977 + 13);
  const count = nextInt(rng, 5, 7);
  for (let i = 0; i < count; i++) {
    const group = layout.groups[nextInt(rng, 0, layout.groups.length - 1)]!;
    const flip = nextInt(rng, 0, 1) === 1;
    const a = ids[group[flip ? 1 : 0]!]!;
    const b = ids[group[flip ? 0 : 1]!]!;
    const big = i % 2 === 1;
    const cars: CargoType[] =
      big && i % 3 === 0 ? ["coal", "coal", "coal", "coal"] : ["coal", "coal"];
    expect(buyTrain(s, a, big ? "american-4-4-0" : "grasshopper-0-4-0", cars)).toMatchObject({
      ok: true,
    });
    const t = s.trains[s.trains.length - 1]!;
    setOrders(s, t.id, [
      { stationId: a, rule: "auto" },
      { stationId: b, rule: "auto" },
    ]);
  }
  return s;
}

describe("legal junction layouts under load (render geometry)", () => {
  for (const layout of JUNCTION_LAYOUTS) {
    for (const seed of [1, 2]) {
      it(`${layout.name}, seed ${seed}: vehicles never overlap, nobody starves`, () => {
        const s = scenario(layout, seed);
        const log: string[] = [];
        setCrossingForcedReporter((m) => log.push(`safety net @tick ${s.ticks}: ${m}`));
        const arrivals = new Map<number, number>();
        const wasLoading = new Map<number, boolean>();
        const crossWait = new Map<number, number>();
        for (let h = 0; h < DAYS * 24 && log.length === 0; h++) {
          advanceOneHour(s);
          for (const o of vehicleOverlapsNow(s))
            log.push(`tick ${s.ticks}: ${o} ${describeOverlap(s, o)}`);
          for (const t of s.trains) {
            const loading = t.status === "loading";
            if (loading && !wasLoading.get(t.id)) arrivals.set(t.id, (arrivals.get(t.id) ?? 0) + 1);
            wasLoading.set(t.id, loading);
            crossWait.set(t.id, t.crossingWait ? (crossWait.get(t.id) ?? 0) + 1 : 0);
            if ((crossWait.get(t.id) ?? 0) > WAIT_LIMIT_HOURS)
              log.push(`train ${t.id} waited ${crossWait.get(t.id)} h at a crossing`);
          }
        }
        setCrossingForcedReporter(undefined);
        expect(log.slice(0, 6)).toEqual([]);
        for (const t of s.trains) expect(arrivals.get(t.id) ?? 0).toBeGreaterThanOrEqual(2);
      }, 120_000);
    }
  }
});
