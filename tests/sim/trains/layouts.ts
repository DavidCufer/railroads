/** Legal junction layouts (PLAN Phase 27) shared by the geometry stress test and the Phase 27 e2e/screenshots. */
import { buildTrack, upgradeTrack } from "../../../src/sim/commands";
import type { GameState } from "../../../src/sim/state";
import { tileAt } from "../track/helpers";

export type Pt = [number, number];
export const N = 25;
export const MID = 12;

export const row = (y: number, x0 = 0, x1 = N - 1): Pt[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]);
export const col = (x: number, y0 = 0, y1 = N - 1): Pt[] =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i]);
/** From (x0,y0) heading down-right (`sx` = 1) or down-left (`sx` = -1), `n` tiles. */
export const diag = (x0: number, y0: number, n: number, sx = 1): Pt[] =>
  Array.from({ length: n }, (_, i) => [x0 + sx * i, y0 + i]);

export function track(s: GameState, pts: Pt[], double = false): void {
  const tiles = pts.map(([x, y]) => tileAt(s.map, x, y));
  const r = buildTrack(s, tiles);
  if (!r.ok) throw new Error(`layout: build refused (${r.reason}) at ${JSON.stringify(pts[0])}…`);
  if (double && !upgradeTrack(s, tiles).ok) throw new Error("layout: upgrade refused");
}

export interface JunctionLayout {
  name: string;
  build: (s: GameState) => Pt[];
  /** Station index pairs a train may shuttle between (trains cannot turn sharply at a junction). */
  groups: number[][];
}

export const JUNCTION_LAYOUTS: JunctionLayout[] = [
  {
    name: "90° diamond over a double main",
    build: (s) => {
      track(s, row(MID), true);
      track(s, col(MID));
      return [
        [0, MID],
        [N - 1, MID],
        [MID, 0],
        [MID, N - 1],
      ];
    },
    groups: [
      [0, 1],
      [2, 3],
    ],
  },
  {
    name: "45° crossing over a double main",
    build: (s) => {
      track(s, row(MID), true);
      track(s, diag(4, 4, 17));
      return [
        [0, MID],
        [N - 1, MID],
        [4, 4],
        [20, 20],
      ];
    },
    groups: [
      [0, 1],
      [2, 3],
    ],
  },
  {
    name: "diagonal double main with a branch off each side",
    build: (s) => {
      track(s, diag(2, 2, 21), true);
      track(s, row(8, 8, 18));
      track(s, col(14, 14, 20));
      return [
        [2, 2],
        [22, 22],
        [18, 8],
        [14, 20],
      ];
    },
    groups: [
      [0, 1],
      [2, 0],
      [3, 0],
    ],
  },
  {
    name: "wye off a single stem",
    build: (s) => {
      track(s, row(MID, 1, 10));
      track(
        s,
        Array.from({ length: 11 }, (_, i) => [10 + i, MID - i] as Pt),
      );
      track(
        s,
        Array.from({ length: 11 }, (_, i) => [10 + i, MID + i] as Pt),
      );
      return [
        [1, MID],
        [20, 2],
        [20, 22],
      ];
    },
    groups: [
      [0, 1],
      [0, 2],
    ],
  },
  {
    name: "single branch joining a double main two tiles from a diamond",
    build: (s) => {
      track(s, row(MID), true);
      track(s, col(MID));
      track(s, diag(20, 6, 7, -1)); // joins the main at (14,12), two tiles from the diamond
      return [
        [0, MID],
        [N - 1, MID],
        [MID, 0],
        [MID, N - 1],
        [20, 6],
      ];
    },
    groups: [
      [0, 1],
      [2, 3],
      [4, 0],
    ],
  },
];
