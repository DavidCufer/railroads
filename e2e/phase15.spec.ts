import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 15 (play-test fixes) screenshots: two trains passing at a middle station; a waiting train
 * with its reason in the panel; steam/diesel/electric trains at zoom 1 (straight + curve, showing
 * the ~20% size bump reads cleanly at the zoom most of the game is played at — zoom 2 versions
 * already exist from Phase 13). The consist editor and bottom-right buttons screenshots were
 * already captured by trains.spec.ts/upgrades.spec.ts earlier in this phase.
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
          (map as unknown as { terrain: Uint8Array }).terrain[idx] = 0;
          (map as unknown as { industryId: Int16Array }).industryId[idx] = -1;
          (map as unknown as { cityId: Int16Array }).cityId[idx] = -1;
          (map as unknown as { riverNext: Int32Array }).riverNext[idx] = -1;
          (map as unknown as { riverFlow: Uint16Array }).riverFlow[idx] = 0;
        }
      }
      (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
    },
    { x0, x1, y0, y1 },
  );
}

async function buildPath(page: Page, tiles: Array<{ x: number; y: number }>): Promise<void> {
  const result = await page.evaluate((tiles) => {
    const width = window.__game!.getMap().width;
    const path = tiles.map(({ x, y }) => y * width + x);
    return window.__game!.buildTrackPath(path);
  }, tiles);
  if (!result.ok) throw new Error(`track build failed: ${result.reason}`);
}

async function buildDepot(page: Page, x: number, y: number, type = "depot"): Promise<number> {
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

async function buyAndOrder(
  page: Page,
  atStationId: number,
  orderStationIds: number[],
  loco: string,
  cars: string[],
): Promise<number> {
  return page.evaluate(
    ({ atStationId, orderStationIds, loco, cars }) => {
      const bought = window.__game!.buyTrain(atStationId, loco, cars);
      if (!bought.ok || bought.trainId === undefined) {
        throw new Error(`buy failed: ${bought.reason}`);
      }
      const orders = window.__game!.setOrders(
        bought.trainId,
        orderStationIds.map((stationId) => ({ stationId, rule: "passThrough" })),
      );
      if (!orders.ok) throw new Error(`orders failed: ${orders.reason}`);
      return bought.trainId;
    },
    { atStationId, orderStationIds, loco, cars },
  );
}

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

test.describe("Phase 15 — play-test fixes screenshots", () => {
  test("steam loco at zoom 1: straight run into a 45° bend", async ({ page }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1940 });
    await clearArea(page, 55, 105, 0, 12);
    const tiles = [
      ...Array.from({ length: 16 }, (_, i) => ({ x: 60 + i, y: 5 })),
      { x: 76, y: 6 },
      ...Array.from({ length: 14 }, (_, i) => ({ x: 77 + i, y: 6 })),
    ];
    await buildPath(page, tiles);
    const a = await buildDepot(page, 60, 5);
    const b = await buildDepot(page, 90, 6);
    const trainId = await buyAndOrder(page, a, [a, b], LOCO_STEAM, MIXED_CARS);
    await runUntilNear(page, trainId, 76);
    await centerOn(page, 76, 5.5, 1);
    await page.screenshot({ path: "docs/screenshots/phase-15-steam-zoom1.png" });
  });

  test("diesel loco at zoom 1: straight run into a 45° bend", async ({ page }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1940 });
    await clearArea(page, 55, 105, 15, 27);
    const tiles = [
      ...Array.from({ length: 16 }, (_, i) => ({ x: 60 + i, y: 20 })),
      { x: 76, y: 21 },
      ...Array.from({ length: 14 }, (_, i) => ({ x: 77 + i, y: 21 })),
    ];
    await buildPath(page, tiles);
    const a = await buildDepot(page, 60, 20);
    const b = await buildDepot(page, 90, 21);
    const trainId = await buyAndOrder(page, a, [a, b], LOCO_DIESEL, ["passengers", "passengers"]);
    await runUntilNear(page, trainId, 76);
    await centerOn(page, 76, 20.5, 1);
    await page.screenshot({ path: "docs/screenshots/phase-15-diesel-zoom1.png" });
  });

  test("electric loco at zoom 1: straight run into a 45° bend, catenary follows", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1940 });
    await clearArea(page, 55, 105, 30, 42);
    const tiles = [
      ...Array.from({ length: 16 }, (_, i) => ({ x: 60 + i, y: 35 })),
      { x: 76, y: 36 },
      ...Array.from({ length: 14 }, (_, i) => ({ x: 77 + i, y: 36 })),
    ];
    await buildPath(page, tiles);
    await page.evaluate((tiles) => {
      const width = window.__game!.getMap().width;
      const path = tiles.map(({ x, y }: { x: number; y: number }) => y * width + x);
      const r = window.__game!.electrifyTrackPath(path);
      if (!r.ok) throw new Error(`electrify failed: ${r.reason}`);
    }, tiles);
    const a = await buildDepot(page, 60, 35);
    const b = await buildDepot(page, 90, 36);
    const trainId = await buyAndOrder(page, a, [a, b], LOCO_ELECTRIC, ["goods", "goods"]);
    await runUntilNear(page, trainId, 76);
    await centerOn(page, 76, 35.5, 1);
    await page.screenshot({ path: "docs/screenshots/phase-15-electric-zoom1.png" });
  });

  test("two trains pass each other at a middle station on a single-track line", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await clearArea(page, 55, 105, 0, 10);
    const y = 5;
    const tiles = Array.from({ length: 31 }, (_, i) => ({ x: 60 + i, y }));
    await buildPath(page, tiles);
    const depotA = await buildDepot(page, 60, y);
    const middle = await buildDepot(page, 75, y);
    const depotB = await buildDepot(page, 90, y);

    // west train: already returning from B to A (buy at the shed station, drive it out and back
    // partway) — a fresh east-bound train departing now is genuinely opposite-direction traffic
    // on the same single track, exactly like the deadlock report this phase fixes.
    const westId = await buyAndOrder(page, depotA, [depotA, depotB], LOCO_STEAM, ["coal"]);
    await runUntilNear(page, westId, 90);
    await page.evaluate(() => window.__game!.runDays(0.2)); // let it start heading back
    const eastId = await buyAndOrder(page, depotA, [depotA, depotB], LOCO_STEAM, ["grain"]);
    void middle;

    // Run until both trains are near the middle station at once.
    let met = false;
    for (let i = 0; i < 2000 && !met; i++) {
      await page.evaluate(() => window.__game!.runDays(1 / 24));
      const trains = await page.evaluate(() => window.__game!.getTrains());
      const west = trains.find((t) => t.id === westId);
      const east = trains.find((t) => t.id === eastId);
      if (west && east && Math.abs(west.x - 75) < 6 && Math.abs(east.x - 75) < 6) met = true;
    }
    expect(met).toBe(true);
    await centerOn(page, 75, y, 1.5);
    await page.screenshot({ path: "docs/screenshots/phase-15-trains-passing-middle-station.png" });

    const trains = await page.evaluate(() => window.__game!.getTrains());
    expect(trains.some((t) => t.status === "stuck")).toBe(false);
  });

  test("a waiting train's panel names what it's waiting for", async ({ page }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await clearArea(page, 55, 105, 0, 10);
    const y = 5;
    const tiles = Array.from({ length: 21 }, (_, i) => ({ x: 60 + i, y }));
    await buildPath(page, tiles);
    const depotA = await buildDepot(page, 60, y);
    const depotB = await buildDepot(page, 80, y);

    // Two trains shuttling the same line in opposite phases — one will eventually be denied
    // departure by the other's opposing reservation and show a waiting reason.
    const t1 = await buyAndOrder(page, depotA, [depotA, depotB], LOCO_STEAM, []);
    await runUntilNear(page, t1, 80);
    await page.evaluate(() => window.__game!.runDays(0.2));
    await buyAndOrder(page, depotA, [depotA, depotB], LOCO_STEAM, []);

    let waitingId: number | undefined;
    for (let i = 0; i < 3000 && waitingId === undefined; i++) {
      await page.evaluate(() => window.__game!.runDays(1 / 24));
      const trains = await page.evaluate(() => window.__game!.getTrains());
      const waiting = trains.find(
        (t) => t.status === "waitingForBlock" || t.status === "waitingForStation",
      );
      if (waiting) waitingId = waiting.id;
    }
    expect(waitingId).toBeDefined();

    // No direct "open panel for id" debug hook — open it via the map instead: a waiting train is
    // (by SPEC §7.5) always sitting exactly at the station tile it's blocked at, so centering on
    // its tile and tapping there with the Info tool reaches its own panel directly.
    const waiting = (await page.evaluate(() => window.__game!.getTrains())).find(
      (t) => t.id === waitingId,
    )!;
    await page.getByRole("button", { name: "Info", exact: true }).click();
    await centerOn(page, waiting.x, waiting.y, 1.5);
    const p = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), {
      x: waiting.x,
      y: waiting.y,
    });
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    await expect(page.locator(".train-waiting")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-15-waiting-reason.png" });
  });
});
