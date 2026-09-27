import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 16.1 (play-test 3) screenshots: where double track meets a station, the two tracks used to
 * pinch to a point right at the station tile (a "kink"), with crossing ties, and a fillet arc could
 * curve straight through a station's own tile. See docs/PLAN.md's Phase 16.1 entry for the
 * play-test report this fixes — stations touching double track are now drawn as passing loops (two
 * parallel platform tracks, full spacing right up to the tile), the displaced single<->double
 * turnout moves onto the single-track side (>= 1.5 tiles, up from 1), and no fillet is ever drawn
 * through a station tile.
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

async function buildStationAt(
  page: Page,
  x: number,
  y: number,
  type: "depot" | "station" | "terminal" = "depot",
): Promise<number> {
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
  orders: Array<{ stationId: number; rule: string }>,
  loco: string,
  cars: string[],
): Promise<number> {
  return page.evaluate(
    ({ atStationId, orders, loco, cars }) => {
      const bought = window.__game!.buyTrain(atStationId, loco, cars);
      if (!bought.ok || bought.trainId === undefined) {
        throw new Error(`buy failed: ${bought.reason}`);
      }
      const result = window.__game!.setOrders(bought.trainId, orders);
      if (!result.ok) throw new Error(`orders failed: ${result.reason}`);
      return bought.trainId;
    },
    { atStationId, orders, loco, cars },
  );
}

const LOCO_STEAM = "american-4-4-0";

test.describe("Phase 16.1 — passing-loop stations (play-test 3)", () => {
  test("a straight double-track line running through a station: two parallel platform tracks, no pinch", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await clearArea(page, 55, 95, 5, 15);
    const tiles = Array.from({ length: 31 }, (_, i) => ({ x: 60 + i, y: 10 })); // x60..90, y10
    await buildPath(page, tiles);
    await upgradeToDouble(page, tiles);
    await buildStationAt(page, 60, 10, "depot");
    const stationId = await buildStationAt(page, 75, 10, "station");
    await buildStationAt(page, 90, 10, "depot");
    expect(stationId).toBeGreaterThanOrEqual(0);

    await centerOn(page, 75, 10, 2);
    await page.screenshot({ path: "docs/screenshots/phase-16-1-station-straight.png" });
    await centerOn(page, 75, 10, 1.5);
    await page.screenshot({ path: "docs/screenshots/phase-16-1-station-straight-zoom1.5.png" });
  });

  test("a double-track curve right next to a station: the station tile stays straight, the curve starts just past it", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await clearArea(page, 55, 95, 5, 15);
    // Stations can only be built on a straight-through track tile (SPEC §6.1) — a 45° bend takes
    // two consecutive nodes (one turning off the straight run, one turning back), and *both* of
    // those nodes are themselves invalid station tiles, so the closest a station can sit to a bend
    // is one plain tile back from it.
    const tiles = [
      ...Array.from({ length: 16 }, (_, i) => ({ x: 60 + i, y: 10 })), // x60..75, y10 (station at 74)
      { x: 76, y: 11 }, // the 45° bend, two tiles past the station
      ...Array.from({ length: 14 }, (_, i) => ({ x: 77 + i, y: 11 })), // x77..90, y11
    ];
    await buildPath(page, tiles);
    await upgradeToDouble(page, tiles);
    await buildStationAt(page, 60, 10, "depot");
    const stationId = await buildStationAt(page, 74, 10, "station");
    await buildStationAt(page, 90, 11, "depot");
    expect(stationId).toBeGreaterThanOrEqual(0);

    await centerOn(page, 76, 11, 2);
    await page.screenshot({ path: "docs/screenshots/phase-16-1-station-curve.png" });
  });

  test("a station with double track on one side and single on the other: turnout merges past the station, no kink at it", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await clearArea(page, 55, 95, 18, 28);
    const tiles = Array.from({ length: 31 }, (_, i) => ({ x: 60 + i, y: 20 })); // x60..90, y20
    await buildPath(page, tiles);
    // Double only from the station eastward — single on the station's west side.
    await upgradeToDouble(
      page,
      Array.from({ length: 16 }, (_, i) => ({ x: 75 + i, y: 20 })), // x75..90
    );
    await buildStationAt(page, 60, 20, "depot");
    const stationId = await buildStationAt(page, 75, 20, "station");
    await buildStationAt(page, 90, 20, "depot");
    expect(stationId).toBeGreaterThanOrEqual(0);

    await centerOn(page, 78, 20, 2);
    await page.screenshot({ path: "docs/screenshots/phase-16-1-station-single-double.png" });
  });

  test("a mid-line single<->double transition, away from any station", async ({ page }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await clearArea(page, 55, 95, 30, 40);
    const tiles = Array.from({ length: 31 }, (_, i) => ({ x: 60 + i, y: 32 })); // x60..90, y32
    await buildPath(page, tiles);
    await upgradeToDouble(
      page,
      Array.from({ length: 11 }, (_, i) => ({ x: 70 + i, y: 32 })), // x70..80, double middle span
    );
    await buildStationAt(page, 60, 32, "depot");
    await buildStationAt(page, 90, 32, "depot");

    await centerOn(page, 70, 32, 2);
    await page.screenshot({ path: "docs/screenshots/phase-16-1-mid-line-transition.png" });
  });

  test("two trains stopped side by side at a double-track passing-loop station", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await clearArea(page, 55, 95, 5, 15);
    const tiles = Array.from({ length: 31 }, (_, i) => ({ x: 60 + i, y: 10 })); // x60..90, y10
    await buildPath(page, tiles);
    await upgradeToDouble(page, tiles);
    // "station" (not "depot") for a 3-train capacity, and only depotW can buy trains (SPEC §7:
    // buyTrain requires the Engine Shed, which only the very first station built ever gets) — both
    // trains are bought there, so the second is sent out only once the first is already inbound
    // from the far end, to get a genuine opposite-direction meeting at S.
    const depotW = await buildStationAt(page, 60, 10, "depot"); // built first: gets the engine shed
    const stationS = await buildStationAt(page, 75, 10, "station");
    const depotE = await buildStationAt(page, 90, 10, "depot");

    const loopOrders = [
      { stationId: depotW, rule: "passThrough" },
      { stationId: stationS, rule: "auto" },
      { stationId: depotE, rule: "passThrough" },
      { stationId: stationS, rule: "auto" },
    ];
    const trainA = await buyAndOrder(page, depotW, loopOrders, LOCO_STEAM, ["coal"]);

    // Run trainA out to depotE before sending trainB east — a fresh eastbound train and an
    // already-turned-around westbound one, exactly the pattern Phase 16's own screenshot test uses
    // for a real opposite-direction meeting (rather than two trains bunched up going the same way).
    await page.evaluate(
      ({ trainId }) => {
        const g = window.__game!;
        for (let i = 0; i < 3000; i++) {
          const t = g.getTrains().find((tt) => tt.id === trainId);
          if (t && t.x >= 89.5) break; // reached depotE, now heading back west
          g.runDays(1 / 24);
        }
      },
      { trainId: trainA },
    );
    const trainB = await buyAndOrder(page, depotW, loopOrders, LOCO_STEAM, ["grain"]);

    let met = false;
    for (let i = 0; i < 6000 && !met; i++) {
      await page.evaluate(() => window.__game!.runDays(1 / 24));
      const trains = await page.evaluate(() => window.__game!.getTrains());
      const a = trains.find((t) => t.id === trainA);
      const b = trains.find((t) => t.id === trainB);
      if (a && b && a.x === 75 && a.y === 10 && b.x === 75 && b.y === 10) met = true;
    }
    expect(met).toBe(true);

    await centerOn(page, 75, 10, 2);
    await page.screenshot({ path: "docs/screenshots/phase-16-1-two-trains-at-station.png" });
  });
});
