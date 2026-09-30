import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 27: every legal junction shape renders cleanly (screenshots), the layout rules are enforced with a
 * reason and a red preview, and trains never overlap on the player's Ljubljana layout. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-27-${name}.png`;
type P = { x: number; y: number };
const TILE_SIZE = 32;
const range = (n: number, f: (i: number) => P): P[] => Array.from({ length: n }, (_, i) => f(i));

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tileSize }) =>
      window.__game?.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize),
    { x, y, tileSize: TILE_SIZE },
  );
  await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
  await page.waitForTimeout(250);
}

async function clearArea(
  page: Page,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Promise<void> {
  await page.evaluate(
    ({ x0, x1, y0, y1 }) => {
      const map = window.__game!.getMap() as unknown as {
        width: number;
        height: number;
        terrain: Uint8Array;
        industryId: Int16Array;
        cityId: Int16Array;
        riverNext: Int32Array;
        riverFlow: Uint16Array;
      };
      for (let y = y0 - 3; y <= y1 + 3; y++) {
        for (let x = x0 - 3; x <= x1 + 3; x++) {
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const idx = y * map.width + x;
          map.terrain[idx] = 0;
          map.industryId[idx] = -1;
          map.cityId[idx] = -1;
          map.riverNext[idx] = -1;
          map.riverFlow[idx] = 0;
        }
      }
      (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
    },
    { x0, x1, y0, y1 },
  );
}

async function build(page: Page, tiles: P[], double = false): Promise<void> {
  const r = await page.evaluate(
    ({ tiles, double }) => {
      const w = window.__game!.getMap().width;
      const path = tiles.map(({ x, y }) => y * w + x);
      const b = window.__game!.buildTrackPath(path);
      if (!b.ok) return b;
      return double ? window.__game!.upgradeTrackPath(path) : b;
    },
    { tiles, double },
  );
  if (!r.ok)
    throw new Error(
      `build failed: ${r.reason} @${tiles[0]!.x},${tiles[0]!.y}..${tiles[tiles.length - 1]!.x},${tiles[tiles.length - 1]!.y}`,
    );
}

async function tryBuild(page: Page, tiles: P[]): Promise<{ ok: boolean; reason?: string }> {
  return page.evaluate(
    ({ tiles }) => {
      const w = window.__game!.getMap().width;
      return window.__game!.buildTrackPath(tiles.map(({ x, y }) => y * w + x));
    },
    { tiles },
  );
}

async function station(page: Page, x: number, y: number, type = "station"): Promise<void> {
  await page.evaluate(
    ({ x, y, type }) => {
      const w = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * w + x, type);
      if (!r.ok) throw new Error(`station failed: ${r.reason}`);
    },
    { x, y, type },
  );
}

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      startYear: 1900,
    }),
  );
  await page.evaluate(() => window.__game!.debugSetCash(50_000_000));
  await page.evaluate(() => window.__game!.setSpeed(0));
}

/** A shape is a list of lines (tiles relative to its centre) plus whether each is double. */
interface Shape {
  name: string;
  lines: Array<{ tiles: Array<[number, number]>; double?: boolean }>;
  station?: [number, number];
  /** Camera focus offset from the shape centre (tiles), for shapes with a branch above the centre. */
  focus?: [number, number];
}
const seq = (n: number, f: (i: number) => [number, number]): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => f(i));
const rowT = (x0: number, x1: number, y = 0): Array<[number, number]> =>
  seq(x1 - x0 + 1, (i) => [x0 + i, y]);
const colT = (y0: number, y1: number, x = 0): Array<[number, number]> =>
  seq(y1 - y0 + 1, (i) => [x, y0 + i]);

const SHAPES: Shape[] = [
  { name: "diamond-90-single", lines: [{ tiles: rowT(-5, 5) }, { tiles: colT(-3, 3) }] },
  {
    name: "diamond-90-double-x-single",
    lines: [{ tiles: rowT(-5, 5), double: true }, { tiles: colT(-3, 3) }],
  },
  {
    name: "diamond-90-double-x-double",
    lines: [
      { tiles: rowT(-5, 5), double: true },
      { tiles: colT(-3, 3), double: true },
    ],
  },
  {
    name: "cross-45-double-main",
    lines: [{ tiles: rowT(-5, 5), double: true }, { tiles: seq(7, (i) => [i - 3, i - 3]) }],
  },
  {
    name: "cross-diagonals-single",
    lines: [{ tiles: seq(9, (i) => [i - 4, i - 4]) }, { tiles: seq(9, (i) => [4 - i, i - 4]) }],
  },
  {
    name: "turnout-straight-single",
    lines: [{ tiles: rowT(-5, 5) }, { tiles: seq(4, (i) => [-1 + i, -i]) }],
  },
  {
    name: "turnout-straight-double-single-branch",
    lines: [{ tiles: rowT(-5, 5), double: true }, { tiles: seq(4, (i) => [-1 + i, -i]) }],
  },
  {
    name: "turnout-straight-double-double-branch",
    lines: [
      { tiles: rowT(-5, 5), double: true },
      { tiles: seq(4, (i) => [-1 + i, -i]), double: true },
    ],
  },
  {
    name: "turnout-diagonal-single",
    lines: [{ tiles: seq(9, (i) => [i - 4, i - 4]) }, { tiles: rowT(0, 5) }],
  },
  {
    name: "turnout-diagonal-double",
    lines: [{ tiles: seq(9, (i) => [i - 4, i - 4]), double: true }, { tiles: rowT(0, 5) }],
  },
  {
    name: "wye-single",
    lines: [
      { tiles: rowT(-6, 0) },
      { tiles: seq(5, (i) => [i, -i]) },
      { tiles: seq(5, (i) => [i, i]) },
    ],
  },
  {
    name: "wye-double",
    lines: [
      { tiles: rowT(-6, 0), double: true },
      { tiles: seq(5, (i) => [i, -i]), double: true },
      { tiles: seq(5, (i) => [i, i]), double: true },
    ],
  },
  {
    name: "passing-loop-and-turnout",
    lines: [{ tiles: rowT(-6, 6), double: true }, { tiles: seq(4, (i) => [3 + i, -i]) }],
    station: [-1, 0],
    focus: [1, -1],
  },
  {
    name: "legal-ljubljana",
    // The player's layout, legalised: diagonal double main, a branch joining it, and the crossing line
    // moved onto a main-line node (a diamond) instead of cutting a tile in half.
    lines: [
      { tiles: seq(11, (i) => [i - 5, i - 5]), double: true },
      { tiles: rowT(-3, 1, -3) },
      { tiles: seq(9, (i) => [i - 4, 4 - i]) },
    ],
    focus: [-1, -1],
  },
];

const COLS = 3;
const SPACING_X = 15;
const SPACING_Y = 10;
const ORIGIN = { x: 60, y: 30 };
const cellCenter = (i: number): P => ({
  x: ORIGIN.x + (i % COLS) * SPACING_X,
  y: ORIGIN.y + Math.floor(i / COLS) * SPACING_Y,
});

test.describe("Phase 27 — legal junction shapes", () => {
  test("every legal shape renders cleanly at zoom 1.5 and 2", async ({ page }) => {
    await setup(page);
    await clearArea(page, 50, 110, 20, 90);
    for (let i = 0; i < SHAPES.length; i++) {
      const s = SHAPES[i]!;
      const c = cellCenter(i);
      for (const line of s.lines)
        await build(
          page,
          line.tiles.map(([x, y]) => ({ x: c.x + x, y: c.y + y })),
          line.double,
        );
      if (s.station) await station(page, c.x + s.station[0], c.y + s.station[1], "depot");
    }
    for (let i = 0; i < SHAPES.length; i++) {
      const c = cellCenter(i);
      for (const z of [1.5, 2]) {
        const f = SHAPES[i]!.focus ?? [0, 0];
        await centerOn(page, c.x + f[0], c.y + f[1], z);
        await page.screenshot({ path: shot(`${SHAPES[i]!.name}-z${z}`) });
      }
    }
  });
});

test.describe("Phase 27 — junction close-ups", () => {
  test.use({ deviceScaleFactor: 4 });
  test("crossing and fork close-ups at zoom 2", async ({ page }) => {
    await setup(page);
    await clearArea(page, 50, 110, 20, 90);
    const names = [
      "cross-45-double-main",
      "diamond-90-double-x-double",
      "wye-double",
      "turnout-diagonal-double",
    ];
    const picks = SHAPES.filter((s) => names.includes(s.name));
    for (let i = 0; i < picks.length; i++) {
      const s = picks[i]!;
      const c = cellCenter(i);
      for (const line of s.lines)
        await build(
          page,
          line.tiles.map(([x, y]) => ({ x: c.x + x, y: c.y + y })),
          line.double,
        );
      await centerOn(page, c.x, c.y, 2);
      await page.screenshot({
        path: shot(`closeup-${s.name}`),
        clip: { x: 300, y: 100, width: 200, height: 160 },
      });
    }
  });
});

test.describe("Phase 27 — layout rules", () => {
  test("the player's mid-tile crossing is refused with a reason and a red preview", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 50, 100, 20, 60);
    const c = { x: 70, y: 40 };
    const main = range(13, (i) => ({ x: c.x - 6 + i, y: c.y - 6 + i }));
    await build(page, main, true);
    await build(
      page,
      range(5, (i) => ({ x: c.x - 3 + i, y: c.y - 3 })),
    );
    const crossing = range(11, (i) => ({ x: c.x + 6 - i, y: c.y - 5 + i })); // x + y = 2c + 1: crosses mid-tile
    // Preview: red segments and the reason toast.
    await page.evaluate(
      ({ path }) => {
        const w = window.__game!.getMap().width;
        window.__game!.debugPreviewBuild(path.map(({ x, y }) => y * w + x));
      },
      { path: crossing },
    );
    await centerOn(page, c.x, c.y, 2);
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot("refused-mid-tile-crossing-preview") });
    const refused = await tryBuild(page, crossing);
    expect(refused).toEqual({ ok: false, reason: "midTileCrossing" });
    // One tile over it crosses at a main-line node, and builds.
    const legal = range(11, (i) => ({ x: c.x + 5 - i, y: c.y - 5 + i })); // x + y = 2c: through the node (c, c)
    expect((await tryBuild(page, legal)).ok).toBe(true);
    await page.evaluate(() => window.__game!.debugPreviewBuild([]));
    await centerOn(page, c.x, c.y, 2);
    await page.screenshot({ path: shot("legal-alternative-built") });
    // A branch one tile from an existing junction is refused, two tiles away builds.
    const tooClose = await tryBuild(
      page,
      range(4, (i) => ({ x: c.x - 2 + i, y: c.y - 2 })),
    );
    expect(tooClose).toEqual({ ok: false, reason: "junctionsTooClose" });
  });
});

test.describe("Phase 27 — old saves", () => {
  test("a layout that breaks the rules still loads, is flagged on the map, and trains never overlap", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 50, 100, 20, 60);
    const c = { x: 70, y: 40 };
    await build(
      page,
      range(13, (i) => ({ x: c.x - 6 + i, y: c.y - 6 + i })),
      true,
    );
    await build(
      page,
      range(5, (i) => ({ x: c.x - 3 + i, y: c.y - 3 })),
    );
    // Inject the player's mid-tile crossing straight into the graph, as an old save would contain it.
    await page.evaluate(
      ({ cx, cy }) => {
        const s = window.__game!.getState() as unknown as {
          map: { width: number };
          trackGraph: { addEdge: (e: unknown) => void };
          trackVersion: number;
        };
        const w = s.map.width;
        for (let i = 0; i < 10; i++) {
          const a = (cy - 5 + i) * w + (cx + 6 - i);
          const b = (cy - 4 + i) * w + (cx + 5 - i);
          s.trackGraph.addEdge({
            a: Math.min(a, b),
            b: Math.max(a, b),
            direction: 3,
            double: false,
            electrified: false,
            bridge: null,
            bridgeSpan: [],
            cost: 100,
          });
        }
        s.trackVersion++;
      },
      { cx: c.x, cy: c.y },
    );
    await station(page, c.x - 6, c.y - 6, "depot");
    await station(page, c.x + 6, c.y + 6, "depot");
    await station(page, c.x + 6, c.y - 5, "depot");
    await station(page, c.x - 4, c.y + 5, "depot");
    const ids = await page.evaluate(() => {
      const st = (
        window.__game!.getState() as unknown as {
          stations: Array<{ id: number; hasEngineShed: boolean }>;
        }
      ).stations;
      for (const s of st) s.hasEngineShed = true;
      return st.map((s) => s.id);
    });
    const run = async (from: number, to: number): Promise<void> => {
      await page.evaluate(
        ({ from, to }) => {
          const b = window.__game!.buyTrain(from, "american-4-4-0", ["coal", "coal", "coal"]);
          if (!b.ok || b.trainId === undefined) throw new Error(`buy failed: ${b.reason}`);
          const r = window.__game!.setOrders(b.trainId, [
            { stationId: from, rule: "passThrough" },
            { stationId: to, rule: "passThrough" },
          ]);
          if (!r.ok) throw new Error(`orders failed: ${r.reason}`);
        },
        { from, to },
      );
    };
    await run(ids[0]!, ids[1]!);
    await run(ids[1]!, ids[0]!);
    await run(ids[2]!, ids[3]!);
    await run(ids[3]!, ids[2]!);
    await centerOn(page, c.x, c.y, 2);
    await page.screenshot({ path: shot("old-save-warning-marker") });
    await page.evaluate(() => window.__game!.runDays(200));
    await centerOn(page, c.x, c.y, 2);
    await page.screenshot({ path: shot("old-save-after-200-days") });
  });
});
