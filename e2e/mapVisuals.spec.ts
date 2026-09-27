import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 13 (STYLE §7): top-down trains following curved track. Screenshots per the PLAN brief —
 * each loco type + a mixed freight consist on a straight and on a curve at zoom 2; an S-curve; a
 * junction; a double-track curve; a bridge on a curve.
 */
const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;

interface RegenOptions {
  seed: number;
  size?: string;
  waterLevel?: string;
  roughness?: string;
  startYear?: number;
}

async function setup(page: Page, options: RegenOptions): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate((opts) => window.__game?.regenerate(opts), options);
  // Enough for every locomotive/car this file buys, but well under any random-map goal's net
  // worth threshold (a scaled multiple of starting cash) — avoids a "Goal reached!" celebration
  // dialog popping up and covering the screenshot.
  await page.evaluate(() => window.__game!.debugSetCash(2_000_000));
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tileSize }) => {
      window.__game?.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize);
    },
    { x, y, tileSize: TILE_SIZE },
  );
  await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
  await page.waitForTimeout(300);
}

/** Same rationale as other phases' e2e specs: guarantees a flat, empty patch regardless of what
 * the seed's map generator placed nearby — including rivers, which (unlike cities/industries)
 * aren't just a `terrain` id: the renderer draws them by walking `riverNext`/`riverFlow`
 * independently of the tile's own terrain, so those need clearing too, with a small margin so a
 * river approaching from just outside the rectangle doesn't still poke a segment in. */
async function clearArea(
  page: Page,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Promise<void> {
  await page.evaluate(
    ({ x0, x1, y0, y1 }) => {
      const map = window.__game!.getMap();
      const margin = 3;
      for (let y = y0 - margin; y <= y1 + margin; y++) {
        for (let x = x0 - margin; x <= x1 + margin; x++) {
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const idx = y * map.width + x;
          (map as unknown as { terrain: Uint8Array }).terrain[idx] = 0; // plain
          (map as unknown as { industryId: Int16Array }).industryId[idx] = -1;
          (map as unknown as { cityId: Int16Array }).cityId[idx] = -1;
          (map as unknown as { riverNext: Int32Array }).riverNext[idx] = -1;
          (map as unknown as { riverFlow: Uint16Array }).riverFlow[idx] = 0;
        }
      }
      // Bumps the same version counter city growth/new industries use (src/main.ts) to bust the
      // terrain chunk cache next frame — otherwise a chunk already baked (e.g. by the mini-map)
      // from the pre-mutation terrain would keep showing stale water/rivers.
      (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
    },
    { x0, x1, y0, y1 },
  );
}

async function setWater(page: Page, tiles: Array<{ x: number; y: number }>): Promise<void> {
  await page.evaluate((tiles) => {
    const map = window.__game!.getMap();
    for (const { x, y } of tiles) {
      (map as unknown as { terrain: Uint8Array }).terrain[y * map.width + x] = 6; // water
    }
    (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
  }, tiles);
}

async function buildPath(page: Page, tiles: Array<{ x: number; y: number }>): Promise<void> {
  const result = await page.evaluate((tiles) => {
    const width = window.__game!.getMap().width;
    const path = tiles.map(({ x, y }) => y * width + x);
    return window.__game!.buildTrackPath(path);
  }, tiles);
  if (!result.ok) throw new Error(`track build failed: ${result.reason}`);
}

async function buildDepot(page: Page, x: number, y: number): Promise<number> {
  return page.evaluate(
    ({ x, y }) => {
      const width = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * width + x, "depot");
      if (!r.ok) throw new Error(`station build failed: ${r.reason}`);
      return window.__game!.getStations().find((s) => s.x === x && s.y === y)!.id;
    },
    { x, y },
  );
}

async function buyAndRun(
  page: Page,
  stationAId: number,
  stationBId: number,
  loco: string,
  cars: string[],
): Promise<number> {
  return page.evaluate(
    ({ stationAId, stationBId, loco, cars }) => {
      const bought = window.__game!.buyTrain(stationAId, loco, cars);
      if (!bought.ok || bought.trainId === undefined) {
        throw new Error(`buy failed: ${bought.reason}`);
      }
      const orders = window.__game!.setOrders(bought.trainId, [
        { stationId: stationAId, rule: "passThrough" },
        { stationId: stationBId, rule: "passThrough" },
      ]);
      if (!orders.ok) throw new Error(`orders failed: ${orders.reason}`);
      return bought.trainId;
    },
    { stationAId, stationBId, loco, cars },
  );
}

/** Ticks the sim (an in-game hour at a time, up to `maxTicks`) until the given train's head is
 * within half a tile of `targetX` — used to catch a train exactly on a curve/bend for a
 * screenshot instead of guessing a fixed `runDays` amount. */
async function runUntilNear(
  page: Page,
  trainId: number,
  targetX: number,
  maxTicks = 400,
): Promise<void> {
  await page.evaluate(
    ({ trainId, targetX, maxTicks }) => {
      const g = window.__game!;
      for (let i = 0; i < maxTicks; i++) {
        const t = g.getTrains().find((tt) => tt.id === trainId);
        if (t && Math.abs(t.x - targetX) < 0.5) return;
        g.runDays(1 / 24);
      }
    },
    { trainId, targetX, maxTicks },
  );
}

const LOCO_STEAM = "american-4-4-0";
const LOCO_DIESEL = "streamliner-diesel";
const LOCO_ELECTRIC = "early-electric";
const MIXED_CARS = ["coal", "oil", "wood", "food"];

test.describe("Phase 13 — map visuals: curved track and top-down trains", () => {
  test("steam loco with a mixed freight consist on a straight track at zoom 2", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearArea(page, 60, 100, 0, 10);
    const tiles = Array.from({ length: 21 }, (_, i) => ({ x: 70 + i, y: 5 }));
    await buildPath(page, tiles);
    const a = await buildDepot(page, 70, 5);
    const b = await buildDepot(page, 90, 5);
    const trainId = await buyAndRun(page, a, b, LOCO_STEAM, MIXED_CARS);
    await runUntilNear(page, trainId, 80);
    await centerOn(page, 80, 5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-13-steam-mixed-straight.png" });
  });

  test("steam loco with a mixed freight consist on a curve at zoom 2", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearArea(page, 60, 100, 10, 20);
    const tiles = [
      ...Array.from({ length: 11 }, (_, i) => ({ x: 70 + i, y: 15 })), // straight to (80,15)
      { x: 81, y: 16 }, // 45° bend
      ...Array.from({ length: 9 }, (_, i) => ({ x: 82 + i, y: 16 })), // straight to (90,16)
    ];
    await buildPath(page, tiles);
    const a = await buildDepot(page, 70, 15);
    const b = await buildDepot(page, 90, 16);
    const trainId = await buyAndRun(page, a, b, LOCO_STEAM, MIXED_CARS);
    await runUntilNear(page, trainId, 81);
    await centerOn(page, 81, 15.5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-13-steam-mixed-curve.png" });
  });

  test("diesel loco on a curve at zoom 2", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearArea(page, 60, 100, 20, 30);
    const tiles = [
      ...Array.from({ length: 11 }, (_, i) => ({ x: 70 + i, y: 25 })),
      { x: 81, y: 26 },
      ...Array.from({ length: 9 }, (_, i) => ({ x: 82 + i, y: 26 })),
    ];
    await buildPath(page, tiles);
    const a = await buildDepot(page, 70, 25);
    const b = await buildDepot(page, 90, 26);
    const trainId = await buyAndRun(page, a, b, LOCO_DIESEL, ["passengers", "passengers"]);
    await runUntilNear(page, trainId, 81);
    await centerOn(page, 81, 25.5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-13-diesel-curve.png" });
  });

  test("electric loco on a curve at zoom 2 (catenary follows the curve)", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearArea(page, 60, 100, 30, 40);
    const tiles = [
      ...Array.from({ length: 11 }, (_, i) => ({ x: 70 + i, y: 35 })),
      { x: 81, y: 36 },
      ...Array.from({ length: 9 }, (_, i) => ({ x: 82 + i, y: 36 })),
    ];
    await buildPath(page, tiles);
    await page.evaluate((tiles) => {
      const width = window.__game!.getMap().width;
      const path = tiles.map(({ x, y }: { x: number; y: number }) => y * width + x);
      const r = window.__game!.electrifyTrackPath(path);
      if (!r.ok) throw new Error(`electrify failed: ${r.reason}`);
    }, tiles);
    const a = await buildDepot(page, 70, 35);
    const b = await buildDepot(page, 90, 36);
    const trainId = await buyAndRun(page, a, b, LOCO_ELECTRIC, ["goods", "goods"]);
    await runUntilNear(page, trainId, 81);
    await centerOn(page, 81, 35.5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-13-electric-curve.png" });
  });

  test("an S-curve reads as one continuous flowing line, no hard corners", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearArea(page, 60, 100, 40, 55);
    // Straight -> bend down (SE) -> straight -> bend back up (NE) -> straight: a flowing "S".
    const tiles = [
      ...Array.from({ length: 6 }, (_, i) => ({ x: 70 + i, y: 45 })), // (70..75,45)
      { x: 76, y: 46 }, // bend down
      ...Array.from({ length: 4 }, (_, i) => ({ x: 77 + i, y: 46 })), // (77..80,46)
      { x: 81, y: 45 }, // bend back up
      ...Array.from({ length: 6 }, (_, i) => ({ x: 82 + i, y: 45 })), // (82..87,45)
    ];
    await buildPath(page, tiles);
    const a = await buildDepot(page, 70, 45);
    const b = await buildDepot(page, 87, 45);
    const trainId = await buyAndRun(page, a, b, LOCO_STEAM, ["goods", "goods"]);
    await runUntilNear(page, trainId, 78);
    await centerOn(page, 78.5, 45.5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-13-s-curve.png" });
  });

  test("a junction: mainline stays straight, the branch fillets away from it", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearArea(page, 60, 100, 55, 65);
    const mainline = Array.from({ length: 21 }, (_, i) => ({ x: 70 + i, y: 58 }));
    await buildPath(page, mainline);
    const branch = [
      { x: 80, y: 58 },
      ...Array.from({ length: 5 }, (_, i) => ({ x: 81 + i, y: 59 + i })),
    ];
    await buildPath(page, branch);
    await centerOn(page, 80, 59, 2);
    await page.screenshot({ path: "docs/screenshots/phase-13-junction.png" });
    const edges = await page.evaluate(() => window.__game!.getTrackEdges());
    expect(edges.length).toBeGreaterThan(20);
  });

  test("a double-track curve: two parallel offset arcs", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearArea(page, 60, 100, 65, 75);
    const tiles = [
      ...Array.from({ length: 11 }, (_, i) => ({ x: 70 + i, y: 68 })),
      { x: 81, y: 69 },
      ...Array.from({ length: 9 }, (_, i) => ({ x: 82 + i, y: 69 })),
    ];
    await buildPath(page, tiles);
    await page.evaluate(
      ({ width, tiles }) => {
        const g = window.__game!;
        const state = g.getState() as unknown as {
          trackGraph: { getEdge: (a: number, b: number) => { double: boolean } | undefined };
        };
        for (let i = 1; i < tiles.length; i++) {
          const prev = tiles[i - 1]!;
          const cur = tiles[i]!;
          const a = prev.y * width + prev.x;
          const b = cur.y * width + cur.x;
          const edge = state.trackGraph.getEdge(a, b);
          if (edge) edge.double = true;
        }
      },
      { width: await page.evaluate(() => window.__game!.getMap().width), tiles },
    );
    await centerOn(page, 81, 68.5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-13-double-track-curve.png" });
    const edges = await page.evaluate(() => window.__game!.getTrackEdges());
    expect(edges.some((e) => e.double)).toBe(true);
  });

  test("a bridge on a curve: the approach curves, the deck itself stays straight", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearArea(page, 60, 100, 75, 85);
    await setWater(page, [
      { x: 78, y: 76 },
      { x: 79, y: 76 },
    ]);
    const tiles = [
      ...Array.from({ length: 6 }, (_, i) => ({ x: 70 + i, y: 75 })), // (70..75,75)
      { x: 76, y: 76 }, // bend into the bridge's approach row
      { x: 77, y: 76 }, // shore tile
      { x: 80, y: 76 }, // far shore — bridges the 2 water tiles
      ...Array.from({ length: 5 }, (_, i) => ({ x: 81 + i, y: 76 })), // (81..85,76)
    ];
    await buildPath(page, tiles);
    const edges = await page.evaluate(() => window.__game!.getTrackEdges());
    expect(edges.some((e) => e.bridge !== null)).toBe(true);
    await centerOn(page, 78, 75.5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-13-bridge-curve.png" });
  });
});
