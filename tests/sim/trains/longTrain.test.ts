/** Phase 58 item 2: a train of 40-60 cars (the Articulated's real-length freight) must draw correctly and must not break
 * signalling, following, junction claims or passing places. */
import { describe, expect, it } from "vitest";
import {
  buildPassingLoop,
  buildStation,
  buildTrack,
  buyTrain,
  setOrders,
} from "../../../src/sim/commands";
import { stepTrains } from "../../../src/sim/trains";
import type { GameState } from "../../../src/sim/state";
import { layoutConsist, consistLengthTiles } from "../../../src/render/trains";
import {
  CAR_LENGTH_TILES,
  DEADLOCK_STUCK_DAYS,
  LOCO_LENGTH_TILES,
  STATION_YARD_TILES,
  locomotiveById,
} from "../../../src/data/trains";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { describeOverlap, geomEnv, rectsOverlap } from "./geometryHelpers";
import { STATION_TYPE_DEFS } from "../../../src/data/stations";
import { JUNCTION_LAYOUTS, N } from "./layouts";
import { createRng, nextInt } from "../../../src/sim/rng";
import { advanceOneHour } from "../../../src/sim/tick";
import { setCrossingForcedReporter } from "../../../src/sim/trains";

const BIG = "articulated-4-8-8-4";

function straight(length: number): GameState {
  const map = makeTestMap([Array.from({ length }, () => "p").join("")]);
  const state = makeTestState(map, { startYear: 1945, cash: 1e12 });
  expect(
    buildTrack(
      state,
      Array.from({ length }, (_, x) => tileAt(map, x, 0)),
    ).ok,
  ).toBe(true);
  return state;
}

function station(state: GameState, x: number, type: "depot" | "terminal" = "depot"): number {
  expect(buildStation(state, tileAt(state.map, x, 0), type).ok).toBe(true);
  const s = state.stations[state.stations.length - 1]!;
  s.hasEngineShed = true;
  return s.id;
}

function launch(
  state: GameState,
  loco: string,
  from: number,
  stops: number[],
  cars: number,
  rule: "auto" | "passThrough" = "auto",
): number {
  const bought = buyTrain(
    state,
    from,
    loco,
    Array.from({ length: cars }, () => "coal" as const),
  );
  expect(bought).toMatchObject({ ok: true });
  const id = state.trains[state.trains.length - 1]!.id;
  expect(
    setOrders(
      state,
      id,
      stops.map((stationId) => ({ stationId, rule })),
    ),
  ).toMatchObject({
    ok: true,
  });
  return id;
}

function step(state: GameState, ticks: number, watch: (i: number) => void): void {
  for (let i = 0; i < ticks; i++) {
    stepTrains(state);
    state.ticks++;
    watch(i);
  }
}

/** `vehicleOverlapsNow` with the station rule widened to a station's grounds. A station holds several trains at once
 * (platform tracks, loop and yard, SPEC 7.5), so two trains that are both within a station's grounds may be drawn over
 * each other: grounds are the platform track plus the yard throat (`STATION_YARD_TILES`), 22.5 tiles at a Terminal, not
 * the 3.5 tiles that fit a short train. Everything else (the open line, junctions, a train sticking out of a station
 * that is too short for it) keeps the strict check. */
function overlapsOutsideStations(state: GameState): string[] {
  const env = geomEnv(state);
  const w = state.map.width;
  const grounds = state.stations.map(
    (st) =>
      LOCO_LENGTH_TILES +
      STATION_TYPE_DEFS[st.type].maxTrainLength * CAR_LENGTH_TILES +
      STATION_YARD_TILES,
  );
  const stationXY = state.stations.map((st) => [
    (st.tile % w) + 0.5,
    Math.floor(st.tile / w) + 0.5,
  ]);
  const laid = state.trains.map((t) => {
    const v = layoutConsist(env, t, 1);
    const inStations = new Set<number>();
    stationXY.forEach(([x, y], i) => {
      if (v.some((p) => Math.hypot(p.x - x!, p.y - y!) < grounds[i]!)) inStations.add(i);
    });
    const folded =
      t.route[t.routeIndex - 1] !== undefined &&
      t.route[t.routeIndex - 1] === t.route[t.routeIndex + 1];
    return { id: t.id, v, inStations, folded };
  });
  const out: string[] = [];
  for (let i = 0; i < laid.length; i++)
    for (let j = i + 1; j < laid.length; j++) {
      const A = laid[i]!;
      const B = laid[j]!;
      if (A.folded || B.folded) continue;
      if ([...A.inStations].some((k) => B.inStations.has(k))) continue;
      if (A.v.some((va) => B.v.some((vb) => rectsOverlap(va, vb))))
        out.push(`trains ${A.id}&${B.id}`);
    }
  return out;
}

describe("a long train (Phase 58)", () => {
  it("the longest train in the roster is longer than the junction lines of the old tests", () => {
    expect(locomotiveById(BIG)!.maxCars).toBeGreaterThanOrEqual(60);
    expect(consistLengthTiles(60)).toBeGreaterThan(18);
  });

  it("draws its 61 vehicles end to end along a curved track, none on top of another", () => {
    const map = makeTestMap(Array.from({ length: 40 }, () => "p".repeat(40)));
    const state = makeTestState(map, { startYear: 1945, cash: 1e12 });
    // east, a 45-degree bend south-east, a 45-degree bend back to east, then a diagonal and east again
    const pts: Array<[number, number]> = [];
    for (let x = 2; x <= 14; x++) pts.push([x, 5]);
    for (let i = 1; i <= 8; i++) pts.push([14 + i, 5 + i]);
    for (let x = 23; x <= 38; x++) pts.push([x, 13]);
    expect(
      buildTrack(
        state,
        pts.map(([x, y]) => tileAt(map, x, y)),
      ).ok,
    ).toBe(true);
    const a = tileAt(map, 2, 5);
    const b = tileAt(map, 38, 13);
    expect(buildStation(state, a, "depot").ok).toBe(true);
    expect(buildStation(state, b, "depot").ok).toBe(true);
    const [sa, sb] = state.stations;
    const id = launch(state, BIG, sa!.id, [sa!.id, sb!.id], 60, "passThrough");
    const train = state.trains.find((t) => t.id === id)!;
    const env = geomEnv(state);
    let worst = Infinity;
    let checked = 0;
    step(state, 4000, () => {
      if (train.route.length === 0) return;
      const v = layoutConsist(env, train, 1);
      expect(v.length).toBe(61);
      // consecutive vehicles sit along the rails one car apart: the chord never exceeds the arc and never collapses
      for (let i = 1; i < v.length; i++) {
        const d = Math.hypot(v[i]!.x - v[i - 1]!.x, v[i]!.y - v[i - 1]!.y);
        worst = Math.min(worst, d);
        expect(d).toBeLessThan(0.7);
      }
      checked++;
    });
    expect(checked).toBeGreaterThan(100);
    expect(worst).toBeGreaterThan(0.2);
  });

  it("a short train follows a 60-car one on a single line without touching it", () => {
    const state = straight(90);
    const a = station(state, 0);
    const b = station(state, 89, "terminal");
    const long = launch(state, BIG, a, [a, b], 60);
    const short = launch(state, "american-4-4-0", a, [a, b], 3);
    const overlaps: string[] = [];
    let longAtB = false;
    let shortAtB = false;
    const bTile = tileAt(state.map, 89, 0);
    step(state, 6000, (i) => {
      for (const o of overlapsOutsideStations(state))
        overlaps.push(`tick ${i}: ${o} ${describeOverlap(state, o)}`);
      for (const t of state.trains) {
        if (t.route[t.routeIndex] === bTile && t.status === "loading") {
          if (t.id === long) longAtB = true;
          if (t.id === short) shortAtB = true;
        }
      }
    });
    expect(
      overlaps.slice(0, 3).map((o) => o + " " + describeOverlap(state, o.split(": ")[1]!)),
    ).toEqual([]);
    expect(longAtB).toBe(true);
    expect(shortAtB).toBe(true);
  });

  it("two 45-car trains meet at a terminal on a single line: one waits in the loop, the other passes, no overlap", () => {
    const state = straight(120);
    const a = station(state, 0, "terminal");
    station(state, 60, "terminal");
    const b = station(state, 119, "terminal");
    buildPassingLoop(state, tileAt(state.map, 30, 0));
    buildPassingLoop(state, tileAt(state.map, 90, 0));
    const one = launch(state, BIG, a, [a, b], 45);
    const two = launch(state, BIG, b, [b, a], 45);
    const overlaps: string[] = [];
    const reached = new Set<string>();
    step(state, 3500, (i) => {
      for (const o of overlapsOutsideStations(state))
        overlaps.push(`tick ${i}: ${o} ${describeOverlap(state, o)}`);
      for (const t of state.trains) {
        const here = state.stations.find((s) => s.tile === t.route[t.routeIndex]);
        if (here && t.status === "loading") reached.add(`${t.id}@${here.id}`);
      }
    });
    expect(overlaps.slice(0, 3)).toEqual([]);
    expect(reached.has(`${one}@${b}`)).toBe(true);
    expect(reached.has(`${two}@${a}`)).toBe(true);
    expect(state.trains.some((t) => t.status === "stuck")).toBe(false);
  });

  it("at a depot too short for either 45-car train neither runs through the other: both report stuck", () => {
    // A depot's grounds (platform track and yard throat) hold 6 cars + 3.5 tiles, so the waiting train's tail lies on the
    // line and keeps the blocks it is in: the other cannot pass, and a deadlock reroute does not move the tail either.
    const state = straight(120);
    const a = station(state, 0, "terminal");
    station(state, 60, "depot");
    const b = station(state, 119, "terminal");
    launch(state, BIG, a, [a, b], 45);
    launch(state, BIG, b, [b, a], 45);
    const overlaps: string[] = [];
    step(state, (DEADLOCK_STUCK_DAYS + 5) * 24 + 1000, (i) => {
      for (const o of overlapsOutsideStations(state))
        overlaps.push(`tick ${i}: ${o} ${describeOverlap(state, o)}`);
    });
    expect(overlaps.slice(0, 3)).toEqual([]);
    expect(state.trains.map((t) => t.status)).toEqual(["stuck", "stuck"]);
  });
});

/** The legal junction layouts of Phase 27 with a long freight among the traffic: every second train is a 40-car
 * Articulated; vehicles never overlap, no crossing wait outlasts the threshold, the deadlock net never fires and every
 *
 * train, long or short, keeps arriving. A crossing wait stays under the junction patience (`CROSSING_PATIENCE_TICKS`), so the
 * deadlock net is never needed. */
describe("long trains through junction layouts (Phase 58)", () => {
  const DAYS = 250;
  const WAIT_LIMIT_HOURS = 60 * 24;
  for (const layout of JUNCTION_LAYOUTS) {
    it(`${layout.name}: a 40-car train among shorter ones`, () => {
      const map = makeTestMap(Array.from({ length: N }, () => "p".repeat(N)));
      const s = makeTestState(map, { seed: 3, startYear: 1945, cash: 1e12 });
      const pts = layout.build(s);
      const ids: number[] = [];
      for (const [x, y] of pts) {
        expect(buildStation(s, tileAt(s.map, x, y), "terminal").ok).toBe(true);
        const st = s.stations[s.stations.length - 1]!;
        st.hasEngineShed = true;
        ids.push(st.id);
      }
      const rng = createRng(977);
      for (let i = 0; i < 6; i++) {
        const group = layout.groups[nextInt(rng, 0, layout.groups.length - 1)]!;
        const a = ids[group[i % 2]!]!;
        const b = ids[group[(i + 1) % 2]!]!;
        const long = i % 2 === 0;
        const cars = Array.from({ length: long ? 40 : 3 }, () => "coal" as const);
        expect(buyTrain(s, a, long ? BIG : "american-4-4-0", cars)).toMatchObject({ ok: true });
        setOrders(s, s.trains[s.trains.length - 1]!.id, [
          { stationId: a, rule: "auto" },
          { stationId: b, rule: "auto" },
        ]);
      }
      const log: string[] = [];
      setCrossingForcedReporter((m) => log.push(`safety net @tick ${s.ticks}: ${m}`));
      const arrivals = new Map<number, number>();
      const wasLoading = new Map<number, boolean>();
      const crossWait = new Map<number, number>();
      for (let h = 0; h < DAYS * 24 && log.length === 0; h++) {
        advanceOneHour(s);
        for (const o of overlapsOutsideStations(s))
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
});
