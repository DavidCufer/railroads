import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 19 (STYLE §9): rolling-stock art. Gallery screenshots of every locomotive and car, plus the
 * refined top-down map sprites with smoke at zoom 2.
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

async function openGallery(page: Page, query = ""): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/?debug=1&gallery=1&h=96${query}`);
  await page.waitForSelector("#gallery");
  expect(errors).toEqual([]);
}

test.describe("Phase 19 — rolling-stock art", () => {
  test("gallery: steam locomotives", async ({ page }) => {
    await openGallery(page);
    expect(await page.locator("#gallery-steam canvas").count()).toBe(24);
    await page
      .locator("#gallery-steam")
      .screenshot({ path: "docs/screenshots/phase-19-gallery-steam.png" });
  });

  test("gallery: diesel and electric locomotives", async ({ page }) => {
    await openGallery(page);
    expect(await page.locator("#gallery-modern canvas").count()).toBe(20);
    await page
      .locator("#gallery-modern")
      .screenshot({ path: "docs/screenshots/phase-19-gallery-modern.png" });
  });

  test("gallery: every car type in three eras, empty and full", async ({ page }) => {
    await openGallery(page, "&h=64");
    expect(await page.locator("#gallery-cars canvas").count()).toBe(13 * 3 * 6);
    await page
      .locator("#gallery-cars")
      .screenshot({ path: "docs/screenshots/phase-19-gallery-cars.png" });
  });

  test("gallery: consists", async ({ page }) => {
    await openGallery(page);
    await page
      .locator("#gallery-consists")
      .screenshot({ path: "docs/screenshots/phase-19-gallery-consists.png" });
  });

  test("steam train with smoke on the map at zoom 2", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearArea(page, 60, 100, 0, 10);
    await buildPath(
      page,
      Array.from({ length: 21 }, (_, i) => ({ x: 70 + i, y: 5 })),
    );
    const a = await buildDepot(page, 70, 5);
    const b = await buildDepot(page, 90, 5);
    const trainId = await buyAndRun(page, a, b, "pacific-4-6-2", ["passengers", "mail", "coal"]);
    await runUntilNear(page, trainId, 80);
    // Let the smoke trail build up over real time while the camera follows the train's head.
    await page.evaluate(() => window.__game!.camera.setZoom(2));
    for (let i = 0; i < 12; i++) {
      await page.evaluate((id) => {
        const t = window.__game!.getTrains().find((tt) => tt.id === id)!;
        window.__game!.camera.setCenter((t.x - 1.2) * 32, (t.y + 0.5) * 32);
      }, trainId);
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: "docs/screenshots/phase-19-map-steam-smoke-zoom2.png" });
  });

  test("diesel train on the map at zoom 2", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1960,
    });
    await clearArea(page, 60, 100, 0, 10);
    await buildPath(
      page,
      Array.from({ length: 21 }, (_, i) => ({ x: 70 + i, y: 5 })),
    );
    const a = await buildDepot(page, 70, 5);
    const b = await buildDepot(page, 90, 5);
    const trainId = await buyAndRun(page, a, b, "road-switcher-diesel", [
      "coal",
      "oil",
      "goods",
      "passengers",
    ]);
    await runUntilNear(page, trainId, 80);
    await page.evaluate(() => window.__game!.setSpeed(0));
    await centerOn(page, 78.6, 5, 2);
    await page.waitForTimeout(400);
    await page.screenshot({ path: "docs/screenshots/phase-19-map-diesel-zoom2.png" });
  });
});
