import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 21.1 (STYLE §10, PLAN 21.1): map polish second pass screenshots and checks.
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

async function buildStationAt(page: Page, x: number, y: number, type: string): Promise<number> {
  return page.evaluate(
    ({ x, y, type }) => {
      const width = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * width + x, type);
      if (!r.ok) throw new Error(`station build failed: ${r.reason}`);
      return window.__game!.getStations().find((s) => s.x === x && s.y === y)!.id;
    },
    { x, y, type },
  );
}

async function setupFlat(page: Page, cx: number, cy: number, half: number): Promise<void> {
  await setup(page, {
    seed: 12345,
    size: "medium",
    waterLevel: "normal",
    roughness: "normal",
    startYear: 1940,
  });
  await clearArea(page, cx - half, cx + half, cy - half, cy + half);
}

async function buyTrainAt(page: Page, a: number, b: number): Promise<void> {
  await page.evaluate(
    ({ a, b }) => {
      const bought = window.__game!.buyTrain(a, "pacific-4-6-2", ["passengers", "mail"]);
      if (!bought.ok || bought.trainId === undefined)
        throw new Error(`buy failed: ${bought.reason}`);
      window.__game!.setOrders(bought.trainId, [
        { stationId: a, rule: "passThrough" },
        { stationId: b, rule: "passThrough" },
      ]);
    },
    { a, b },
  );
}

test.describe("Phase 21.1 — map polish", () => {
  for (const type of ["depot", "station", "terminal"]) {
    test(`station ${type} zoom 2`, async ({ page }) => {
      const cx = 60;
      const cy = 60;
      await setupFlat(page, cx, cy, 8);
      const row = Array.from({ length: 15 }, (_, i) => ({ x: cx - 7 + i, y: cy }));
      await buildPath(page, row);
      const id = await buildStationAt(page, cx, cy, type);
      const other = await buildStationAt(page, cx + 7, cy, "depot");
      await buyTrainAt(page, id, other);
      await centerOn(page, cx, cy, 2);
      await page.screenshot({
        path: `docs/screenshots/phase-21-1-station-${type}-zoom2.png`,
        clip: { x: 160, y: 40, width: 480, height: 280 },
      });
    });
  }

  test("station with all improvements", async ({ page }) => {
    const cx = 60;
    const cy = 60;
    await setupFlat(page, cx, cy, 8);
    await buildPath(
      page,
      Array.from({ length: 15 }, (_, i) => ({ x: cx - 7 + i, y: cy })),
    );
    const id = await buildStationAt(page, cx, cy, "station");
    await page.evaluate((id) => {
      for (const t of [
        "hotel",
        "warehouse",
        "postOffice",
        "coldStorage",
        "freightYard",
        "livestockPens",
      ]) {
        window.__game!.buildImprovement(id, t as never);
      }
      const st = (
        window.__game!.getState() as unknown as {
          stations: Array<{ id: number; hasEngineShed: boolean; hasWaterTower: boolean }>;
        }
      ).stations.find((s) => s.id === id)!;
      st.hasEngineShed = true;
      st.hasWaterTower = true;
    }, id);
    await centerOn(page, cx, cy + 0.3, 1.5);
    await page.screenshot({
      path: "docs/screenshots/phase-21-1-station-improvements-zoom1.5.png",
      clip: { x: 60, y: 30, width: 680, height: 320 },
    });
  });

  test("station diagonal", async ({ page }) => {
    const cx = 60;
    const cy = 60;
    await setupFlat(page, cx, cy, 8);
    await buildPath(
      page,
      Array.from({ length: 11 }, (_, i) => ({ x: cx - 5 + i, y: cy - 5 + i })),
    );
    const id = await buildStationAt(page, cx, cy, "station");
    await page.evaluate((id) => {
      for (const t of ["hotel", "warehouse"]) window.__game!.buildImprovement(id, t as never);
    }, id);
    await centerOn(page, cx, cy, 2);
    await page.screenshot({
      path: "docs/screenshots/phase-21-1-station-diagonal.png",
      clip: { x: 160, y: 30, width: 480, height: 320 },
    });
  });
});
