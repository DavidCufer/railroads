import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 24B render polish screenshots (double-track branches, delivery labels, chunk seams, terrain borders). Each scenario is a situation from the
 * play-tests (double track curving into a station whose other side is single, S-curves, a
 * transition landing on a curve, a junction off double track, a double-track bridge) at zoom 1.5
 * and 2. Rendered at 2x device scale so individual rails/ties are legible when inspected.
 */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;
type P = { x: number; y: number };

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      startYear: 1848,
    }),
  );
  await page.evaluate(() => window.__game!.debugSetCash(5_000_000));
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tileSize }) => {
      window.__game?.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize);
    },
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

async function setWater(page: Page, tiles: P[]): Promise<void> {
  await page.evaluate((tiles) => {
    const map = window.__game!.getMap() as unknown as { width: number; terrain: Uint8Array };
    for (const { x, y } of tiles) map.terrain[y * map.width + x] = 6;
    (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
  }, tiles);
}

async function build(page: Page, tiles: P[], double?: P[]): Promise<void> {
  const r = await page.evaluate(
    ({ tiles, double }) => {
      const w = window.__game!.getMap().width;
      const b = window.__game!.buildTrackPath(tiles.map(({ x, y }) => y * w + x));
      if (!b.ok) return b;
      if (double) return window.__game!.upgradeTrackPath(double.map(({ x, y }) => y * w + x));
      return b;
    },
    { tiles, double },
  );
  if (!r.ok) throw new Error(`build failed: ${r.reason}`);
}

async function station(page: Page, x: number, y: number, type = "depot"): Promise<number> {
  return page.evaluate(
    ({ x, y, type }) => {
      const w = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * w + x, type);
      if (!r.ok) throw new Error(`station failed: ${r.reason}`);
      return window.__game!.getStations().find((s) => s.x === x && s.y === y)!.id;
    },
    { x, y, type },
  );
}

async function train(page: Page, at: number, orders: number[], cars: string[]): Promise<number> {
  return page.evaluate(
    ({ at, orders, cars }) => {
      const b = window.__game!.buyTrain(at, "american-4-4-0", cars);
      if (!b.ok || b.trainId === undefined) throw new Error(`buy failed: ${b.reason}`);
      const r = window.__game!.setOrders(
        b.trainId,
        orders.map((stationId) => ({ stationId, rule: "auto" })),
      );
      if (!r.ok) throw new Error(`orders failed: ${r.reason}`);
      return b.trainId;
    },
    { at, orders, cars },
  );
}

const range = (n: number, f: (i: number) => P): P[] => Array.from({ length: n }, (_, i) => f(i));
const SHOT = process.env["SHOT_PREFIX"] ?? "phase-24b";

test.describe("Phase 24B — branch off double track", () => {
  test("branches off diagonal, straight and both sides", async ({ page }) => {
    await setup(page);
    await clearArea(page, 55, 100, 20, 80);
    // 1. Diagonal double main (SE) with a single branch leaving east (the player's case).
    const diag = range(14, (i) => ({ x: 60 + i, y: 22 + i }));
    await build(page, diag, diag);
    const br1 = [{ x: 66, y: 28 }, ...range(6, (i) => ({ x: 67 + i, y: 28 }))];
    await build(page, br1);
    // 2. Diagonal double main with a *double* branch leaving south.
    const diag2 = range(14, (i) => ({ x: 60 + i, y: 42 + i }));
    await build(page, diag2, diag2);
    const br2 = [{ x: 66, y: 48 }, ...range(6, (i) => ({ x: 66, y: 49 + i }))];
    await build(page, br2, br2);
    // 3. Straight double with a diagonal single branch on the north side, and one on the south.
    const st = range(22, (i) => ({ x: 60 + i, y: 66 }));
    await build(page, st, st);
    await build(page, [{ x: 66, y: 66 }, ...range(5, (i) => ({ x: 67 + i, y: 65 - i }))]);
    await build(page, [{ x: 74, y: 66 }, ...range(5, (i) => ({ x: 75 + i, y: 67 + i }))]);
    for (const z of [2, 1.5]) {
      await centerOn(page, 68, 29, z);
      await page.screenshot({ path: `docs/screenshots/${SHOT}-branch-diagonal-z${z}.png` });
      await centerOn(page, 67, 49, z);
      await page.screenshot({ path: `docs/screenshots/${SHOT}-branch-diag-double-z${z}.png` });
      await centerOn(page, 70, 66, z);
      await page.screenshot({ path: `docs/screenshots/${SHOT}-branch-straight-z${z}.png` });
    }
  });
});
