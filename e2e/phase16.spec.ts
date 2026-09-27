import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 16 (Play-test 2, Part A) screenshots: double track drawn as a realistic-spacing pair with
 * a proper turnout at each single<->double transition (not two full-size tracks splaying apart),
 * and opposing trains riding separate lanes instead of passing through each other on the shared
 * centerline. See docs/PLAN.md's Phase 16 entry for the play-test report this fixes.
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

async function upgradeToDouble(page: Page, tiles: Array<{ x: number; y: number }>): Promise<void> {
  const result = await page.evaluate((tiles) => {
    const width = window.__game!.getMap().width;
    const path = tiles.map(({ x, y }) => y * width + x);
    return window.__game!.upgradeTrackPath(path);
  }, tiles);
  if (!result.ok) throw new Error(`double-track upgrade failed: ${result.reason}`);
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

/** Straight run + one 45° bend, matching Phase 15's own screenshot layout (SPEC §5.1: sharper
 * bends aren't traversable, so this is the only kind of curve a route can actually have). Depots
 * at each end; the middle span (covering the bend) is upgraded to double, leaving single track at
 * both approaches — two single<->double turnouts either side of a double-track curve. */
function trackTiles(): Array<{ x: number; y: number }> {
  return [
    ...Array.from({ length: 16 }, (_, i) => ({ x: 60 + i, y: 5 })), // x60..75, y5
    { x: 76, y: 6 }, // the 45° bend
    ...Array.from({ length: 14 }, (_, i) => ({ x: 77 + i, y: 6 })), // x77..90, y6
  ];
}

function doubleSpanTiles(): Array<{ x: number; y: number }> {
  return [
    ...Array.from({ length: 5 }, (_, i) => ({ x: 71 + i, y: 5 })), // x71..75, y5
    { x: 76, y: 6 },
    ...Array.from({ length: 5 }, (_, i) => ({ x: 77 + i, y: 6 })), // x77..81, y6
  ];
}

async function buildDoubleTrackLine(page: Page): Promise<{ depotA: number; depotB: number }> {
  await clearArea(page, 55, 95, 0, 12);
  await buildPath(page, trackTiles());
  await upgradeToDouble(page, doubleSpanTiles());
  const depotA = await buildDepot(page, 60, 5);
  const depotB = await buildDepot(page, 90, 6);
  const edges = await page.evaluate(() => window.__game!.getTrackEdges());
  expect(edges.some((e) => e.double)).toBe(true);
  expect(edges.some((e) => !e.double)).toBe(true);
  return { depotA, depotB };
}

test.describe("Phase 16 — double track rendering (play-test 2)", () => {
  test("double track (straight + curve + turnout) with two trains passing at zoom 2", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    const { depotA, depotB } = await buildDoubleTrackLine(page);

    // westId: already turned around and heading back from B to A (bought, driven out, partway
    // back) — genuinely opposite-direction traffic from a freshly departing eastbound train, same
    // pattern Phase 15's signaling screenshot uses.
    const westId = await buyAndOrder(page, depotA, [depotA, depotB], LOCO_STEAM, ["coal"]);
    await runUntilNear(page, westId, 90);
    await page.evaluate(() => window.__game!.runDays(0.3)); // let it start heading back west
    const eastId = await buyAndOrder(page, depotA, [depotA, depotB], LOCO_STEAM, ["grain"]);

    // Run until both trains are within the double-track span around the curve at once.
    let met = false;
    for (let i = 0; i < 3000 && !met; i++) {
      await page.evaluate(() => window.__game!.runDays(1 / 24));
      const trains = await page.evaluate(() => window.__game!.getTrains());
      const west = trains.find((t) => t.id === westId);
      const east = trains.find((t) => t.id === eastId);
      if (west && east && Math.abs(west.x - 76) < 5 && Math.abs(east.x - 76) < 5) met = true;
    }
    expect(met).toBe(true);

    await centerOn(page, 76, 5.5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-16-double-track-turnout.png" });

    // The core play-test bug: opposing trains must not be riding the same centerline.
    const trains = await page.evaluate(() => window.__game!.getTrains());
    const west = trains.find((t) => t.id === westId)!;
    const east = trains.find((t) => t.id === eastId)!;
    expect(Math.hypot(west.renderX - east.renderX, west.renderY - east.renderY)).toBeGreaterThan(
      0.15,
    );
  });

  test("single <-> double transition close-up", async ({ page }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await buildDoubleTrackLine(page);

    // The west turnout sits at x=71 (doubleSpanTiles' first tile) — close in on it at zoom 2.
    await centerOn(page, 71, 5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-16-single-double-transition.png" });
  });
});
