/**
 * Phase 25A: crossing / junction layouts under load. X crossing, junction off a single main line,
 * junction off a double main line, and two crossings one tile apart (a cluster), each with several
 * trains of mixed length running for a game year: no two trains ever overlap on a junction node,
 * no crossing wait outlasts the stress threshold, the deadlock safety net never has to fire and
 * every train keeps arriving at stations.
 */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  setOrders,
  upgradeTrack,
} from "../../../src/sim/commands";
import { createRng, nextInt } from "../../../src/sim/rng";
import { advanceOneHour } from "../../../src/sim/tick";
import { setCrossingForcedReporter } from "../../../src/sim/trains";
import type { CargoType } from "../../../src/data/cargo";
import type { GameState } from "../../../src/sim/state";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { makeCrossingWatch } from "./crossingHelpers";

const N = 21;
const MID = 10;
const DAYS = 400;
const WAIT_LIMIT_HOURS = 100 * 24;

type Pt = [number, number];
const row = (y: number, x0 = 0, x1 = N - 1): Pt[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]);
const col = (x: number, y0 = 0, y1 = N - 1): Pt[] =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i]);

interface Layout {
  name: string;
  build: (s: GameState) => Pt[]; // returns station tiles (each a terminal or mid station)
}

/** Station indices a train may be sent between (trains cannot turn 90° at a crossing). */
const GROUPS: Record<string, number[][]> = {
  "X crossing": [
    [0, 1, 4],
    [2, 3, 5],
  ],
  "X crossing with a station one tile from the crossing": [
    [0, 1, 4],
    [2, 3, 5],
  ],
  "junction off a single main line": [
    [0, 1, 2, 4],
    [0, 1, 3, 4],
  ],
  "junction off a double main line": [
    [0, 1, 2, 4],
    [0, 1, 3, 4],
  ],
  "two crossings one tile apart": [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
};

function track(s: GameState, pts: Pt[], double = false): void {
  const tiles = pts.map(([x, y]) => tileAt(s.map, x, y));
  expect(buildTrack(s, tiles)).toMatchObject({ ok: true });
  if (double) expect(upgradeTrack(s, tiles)).toMatchObject({ ok: true });
}

const LAYOUTS: Layout[] = [
  {
    name: "X crossing",
    build: (s) => {
      track(s, row(MID));
      track(s, col(MID));
      return [
        [0, MID],
        [N - 1, MID],
        [MID, 0],
        [MID, N - 1],
        [5, MID],
        [MID, 15],
      ];
    },
  },
  {
    name: "X crossing with a station one tile from the crossing",
    build: (s) => {
      track(s, row(MID));
      track(s, col(MID));
      return [
        [0, MID],
        [N - 1, MID],
        [MID, 0],
        [MID, N - 1],
        [MID - 1, MID],
        [MID, MID + 1],
      ];
    },
  },
  {
    name: "junction off a single main line",
    build: (s) => {
      track(s, row(MID));
      track(s, [
        [4, 4],
        [5, 5],
        [6, 6],
        [7, 7],
        [8, 8],
        [9, 9],
        [MID, MID],
      ]);
      track(s, [
        [4, 16],
        [5, 15],
        [6, 14],
        [7, 13],
        [8, 12],
        [9, 11],
        [MID, MID],
      ]);
      return [
        [0, MID],
        [N - 1, MID],
        [4, 4],
        [4, 16],
        [15, MID],
      ];
    },
  },
  {
    name: "junction off a double main line",
    build: (s) => {
      track(s, row(MID), true);
      track(s, [
        [4, 4],
        [5, 5],
        [6, 6],
        [7, 7],
        [8, 8],
        [9, 9],
        [MID, MID],
      ]);
      track(
        s,
        [
          [4, 16],
          [5, 15],
          [6, 14],
          [7, 13],
          [8, 12],
          [9, 11],
          [MID, MID],
        ],
        true,
      );
      return [
        [0, MID],
        [N - 1, MID],
        [4, 4],
        [4, 16],
        [15, MID],
      ];
    },
  },
  {
    name: "two crossings one tile apart",
    build: (s) => {
      track(s, row(MID));
      track(s, col(9));
      track(s, col(11));
      return [
        [0, MID],
        [N - 1, MID],
        [9, 0],
        [9, N - 1],
        [11, 0],
        [11, N - 1],
      ];
    },
  },
];

function scenario(layout: Layout, seed: number): GameState {
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
  const rng = createRng(seed * 101 + 7);
  const count = nextInt(rng, 4, 6);
  for (let i = 0; i < count; i++) {
    const groups = GROUPS[layout.name]!;
    const group = groups[nextInt(rng, 0, groups.length - 1)]!;
    const a = ids[group[nextInt(rng, 0, group.length - 1)]!]!;
    let b = ids[group[nextInt(rng, 0, group.length - 1)]!]!;
    if (b === a) b = ids[group[(group.indexOf(ids.indexOf(a)) + 1) % group.length]!]!;
    const cars: CargoType[] = i % 3 === 0 ? ["coal", "coal", "coal"] : ["coal", "coal"];
    expect(buyTrain(s, a, i % 2 ? "american-4-4-0" : "grasshopper-0-4-0", cars)).toMatchObject({
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

describe("crossing layouts under load", () => {
  for (const layout of LAYOUTS) {
    for (const seed of [1, 2, 3]) {
      it(`${layout.name}, seed ${seed}: no overlap, no deadlock`, () => {
        const s = scenario(layout, seed);
        const log: string[] = [];
        setCrossingForcedReporter((m) => log.push(`safety net @tick ${s.ticks}: ${m}`));
        const watch = makeCrossingWatch();
        const arrivals = new Map<number, number>();
        const wasLoading = new Map<number, boolean>();
        const crossWait = new Map<number, number>();
        for (let h = 0; h < DAYS * 24 && log.length === 0; h++) {
          advanceOneHour(s);
          watch(s, log);
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
        expect(log.slice(0, 8)).toEqual([]);
        if (process.env.DBG)
          console.log(
            JSON.stringify(
              s.trains.map((t) => [
                t.id,
                arrivals.get(t.id),
                t.status,
                t.speed.toFixed(0),
                t.route[t.routeIndex],
                t.crossingWait,
                JSON.stringify(t.waitingOn),
                t.orders.map((o) => o.stationId),
              ]),
            ),
          );
        for (const t of s.trains) expect(arrivals.get(t.id) ?? 0).toBeGreaterThanOrEqual(2);
      }, 60_000);
    }
  }
});
