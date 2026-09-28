import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 17 B screenshots: the general lane/centerline model. Each scenario is a situation from the
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
const CARS = ["passengers", "mail", "coal", "passengers"];

test.describe("Phase 17 — lane geometry screenshots", () => {
  test("player situation: double track curving into a station, single on the other side", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 55, 95, 20, 34);
    // Diagonal approach (SE) bending onto an east run into the station; single track beyond it.
    const tiles = [
      ...range(7, (i) => ({ x: 60 + i, y: 24 + i })), // (60,24)..(66,30)
      ...range(13, (i) => ({ x: 67 + i, y: 30 })), // (67..79,30)
    ];
    const doubled = [
      ...range(7, (i) => ({ x: 62 + i, y: 26 + i })).slice(0, 5), // (62,26)..(66,30)
      ...range(4, (i) => ({ x: 67 + i, y: 30 })), // (67..70,30)
    ];
    await build(page, tiles, doubled);
    const far = await station(page, 79, 30, "depot");
    const mid = await station(page, 70, 30, "station");
    await station(page, 60, 24, "depot");
    await centerOn(page, 68, 28, 2);
    await page.screenshot({ path: "docs/screenshots/phase-17-player-situation.png" });
    await centerOn(page, 68, 28, 1.5);
    await page.screenshot({ path: "docs/screenshots/phase-17-player-situation-zoom1.5.png" });
    expect(far).not.toBe(mid);
  });

  test("double-track S-curve and a transition landing on a curve", async ({ page }) => {
    await setup(page);
    await clearArea(page, 55, 95, 34, 50);
    const s = [
      ...range(4, (i) => ({ x: 60 + i, y: 36 })), // E (60..63,36)
      ...range(4, (i) => ({ x: 64 + i, y: 37 + i })), // SE (64,37)..(67,40)
      ...range(8, (i) => ({ x: 68 + i, y: 40 })), // E (68..75,40)
    ];
    await build(page, s, s.slice(1));
    await centerOn(page, 66, 38.5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-17-double-s-curve.png" });

    // A transition that starts right next to a bend.
    const t = [
      ...range(5, (i) => ({ x: 60 + i, y: 44 })), // E (60..64,44)
      ...range(5, (i) => ({ x: 65 + i, y: 45 + i })), // SE (65,45)..(69,49)
      ...range(8, (i) => ({ x: 70 + i, y: 49 })), // E (70..77,49)
    ];
    await build(page, t, t.slice(5));
    await centerOn(page, 67, 46.5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-17-transition-on-curve.png" });
    await centerOn(page, 67, 46.5, 1.5);
    await page.screenshot({ path: "docs/screenshots/phase-17-transition-on-curve-zoom1.5.png" });
  });

  test("junctions off double track", async ({ page }) => {
    await setup(page);
    await clearArea(page, 55, 95, 54, 70);
    const main = range(20, (i) => ({ x: 60 + i, y: 58 }));
    await build(page, main, main);
    // Branch leaving the mainline at (68,58) toward the south-east: single, then a double one.
    const b1 = [{ x: 68, y: 58 }, ...range(5, (i) => ({ x: 69 + i, y: 59 + i }))];
    await build(page, b1);
    const main2 = range(20, (i) => ({ x: 60 + i, y: 66 }));
    await build(page, main2, main2);
    const b2 = [{ x: 68, y: 66 }, ...range(5, (i) => ({ x: 69 + i, y: 67 + i }))];
    await build(page, b2, b2);
    await centerOn(page, 71, 59, 2);
    await page.screenshot({ path: "docs/screenshots/phase-17-junction-single-branch.png" });
    await centerOn(page, 71, 67, 2);
    await page.screenshot({ path: "docs/screenshots/phase-17-junction-double-branch.png" });
  });

  test("double-track bridge", async ({ page }) => {
    await setup(page);
    await clearArea(page, 55, 95, 74, 86);
    await setWater(page, [
      { x: 74, y: 80 },
      { x: 75, y: 80 },
    ]);
    const tiles = [
      ...range(6, (i) => ({ x: 68 + i, y: 80 })), // (68..73,80)
      ...range(8, (i) => ({ x: 76 + i, y: 80 })), // (76..83,80) – bridges (74,75)
    ];
    await build(page, tiles, tiles);
    const edges = await page.evaluate(() => window.__game!.getTrackEdges());
    expect(edges.some((e) => e.bridge !== null && e.double)).toBe(true);
    await centerOn(page, 75, 80, 2);
    await page.screenshot({ path: "docs/screenshots/phase-17-double-bridge.png" });
  });

  test("consist on a diagonal and curved double-track approach", async ({ page }) => {
    await setup(page);
    await clearArea(page, 55, 95, 60, 76);
    const tiles = [
      ...range(8, (i) => ({ x: 60 + i, y: 62 + i })), // SE (60,62)..(67,69)
      ...range(14, (i) => ({ x: 68 + i, y: 69 })), // E (68..81,69)
    ];
    await build(page, tiles, tiles.slice(1));
    const a = await station(page, 81, 69, "depot");
    const b = await station(page, 60, 62, "depot");
    await train(page, a, [a, b], CARS);
    await train(page, a, [b, a], CARS);
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.__game!.runDays(1));
      const trains = await page.evaluate(() => window.__game!.getTrains());
      const t0 = trains[0]!;
      await centerOn(page, t0.renderX - 0.5, t0.renderY - 0.5, 2);
      if (i === 3 || i === 5) {
        const name = i === 3 ? "straight" : "diagonal-curve";
        await page.screenshot({ path: `docs/screenshots/phase-17-consist-${name}.png` });
      }
    }
  });
});
