import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 28B — UX fixes from the agent play-test (docs/PLAYTEST-1.md). Screenshots at 800×360. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const SHOT = process.env["SHOT"] ?? "after";
const shot = (name: string): string => `docs/screenshots/phase-28b-${name}-${SHOT}.png`;
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

/** A flat 1900 map with a straight 12-tile line, two stations and one train. */
async function lineWithTrain(page: Page): Promise<{ trainId: number; a: number; b: number }> {
  await setup(page);
  await clearArea(page, 50, 70, 30, 40);
  await build(
    page,
    range(13, (i) => ({ x: 52 + i, y: 35 })),
  );
  await station(page, 52, 35);
  await station(page, 64, 35);
  const ids = await page.evaluate(() => {
    const st = window.__game!.getStations();
    const r = window.__game!.buyTrain(st[0]!.id, "atlantic-4-4-2", ["passengers", "mail"]);
    if (!r.ok) throw new Error(String(r.reason));
    window.__game!.setOrders(r.trainId!, [
      { stationId: st[0]!.id, rule: "auto" },
      { stationId: st[1]!.id, rule: "auto" },
    ]);
    return { trainId: r.trainId!, a: st[0]!.id, b: st[1]!.id };
  });
  await centerOn(page, 58, 35, 1);
  return ids;
}

test.describe("Phase 28B — stuck indicator", () => {
  test("⚠ chip counts trains needing attention; tap jumps to one and opens its panel", async ({
    page,
  }) => {
    const { trainId } = await lineWithTrain(page);
    await expect(page.locator(".stuck-chip")).toBeHidden();
    await page.screenshot({ path: shot("stuck-none") });
    await page.evaluate((id) => {
      const s = window.__game!.getState() as unknown as {
        trains: Array<{ id: number; status: string; waitTicks: number }>;
      };
      const t = s.trains.find((x) => x.id === id)!;
      t.status = "waitingForStation";
      t.waitTicks = 12 * 24;
    }, trainId);
    await page.waitForTimeout(300);
    await expect(page.locator(".stuck-chip")).toBeVisible();
    await expect(page.locator(".stuck-chip .stuck-count")).toHaveText("1");
    await page.evaluate(() => window.__game!.camera.setCenter(10 * 32, 10 * 32));
    await page.locator(".stuck-chip").click();
    await page.waitForTimeout(400);
    await expect(page.locator(".panel")).toBeVisible();
    await page.screenshot({ path: shot("stuck-chip") });
    // An unknown future status with no long wait is ignored, never throws.
    await page.evaluate((id) => {
      const s = window.__game!.getState() as unknown as {
        trains: Array<{ id: number; status: string; waitTicks: number }>;
      };
      const t = s.trains.find((x) => x.id === id)!;
      t.status = "inYard";
      t.waitTicks = 0;
    }, trainId);
    await page.waitForTimeout(300);
    await expect(page.locator(".stuck-chip")).toBeHidden();
  });
});
