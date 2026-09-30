import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 29 A: explicit node routes — turnout, diamond, single slip and double slip render as real track, and the
 * player's case (a line joining a turnout node from the other side) keeps the turnout. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-29-${name}.png`;
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

test.describe("Phase 29 — node routes", () => {
  test("turnout, diamond, single slip and double slip at zoom 1.5 and 2", async ({ page }) => {
    await setup(page);
    await clearArea(page, 40, 140, 20, 80);
    const cells: Array<{ name: string; cx: number; cy: number }> = [
      { name: "turnout", cx: 50, cy: 30 },
      { name: "diamond", cx: 70, cy: 30 },
      { name: "single-slip", cx: 90, cy: 30 },
      { name: "double-slip", cx: 110, cy: 30 },
    ];
    const diag = (cx: number, cy: number): P[] =>
      range(9, (i) => ({ x: cx - 4 + i, y: cy - 4 + i }));
    const horiz = (cx: number, cy: number): P[] => range(9, (i) => ({ x: cx - 4 + i, y: cy }));
    // Turnout: diagonal main, branch to the right.
    await build(page, diag(50, 30));
    await build(
      page,
      range(4, (i) => ({ x: 50 + i, y: 30 })),
    );
    // Diamond: diagonal and horizontal crossing at the node.
    await build(page, diag(70, 30));
    await build(page, horiz(70, 30));
    // Single slip: the player's case — diagonal, branch right, then a line from the left joins.
    await build(page, diag(90, 30));
    await build(
      page,
      range(4, (i) => ({ x: 90 + i, y: 30 })),
    );
    await build(
      page,
      range(5, (i) => ({ x: 86 + i, y: 30 })),
    );
    // Double slip: a diamond with both slips added.
    await build(page, diag(110, 30));
    await build(page, horiz(110, 30));
    const slip = (cx: number, cy: number, a: P, b: P): Promise<{ ok: boolean; reason?: string }> =>
      page.evaluate(
        ({ cx, cy, a, b }) => {
          const w = window.__game!.getMap().width;
          return window.__game!.setNodeRoute(cy * w + cx, b.y * w + b.x, a.y * w + a.x, true);
        },
        { cx, cy, a, b },
      );
    const r1 = await slip(110, 30, { x: 111, y: 30 }, { x: 109, y: 29 }); // NW <-> E
    const r2 = await slip(110, 30, { x: 109, y: 30 }, { x: 111, y: 31 }); // W <-> SE
    expect(r1.ok && r2.ok).toBe(true);
    const routes = async (x: number, y: number): Promise<number> =>
      page.evaluate(
        ({ x, y }) => window.__game!.getNodeRoutes(y * window.__game!.getMap().width + x).length,
        { x, y },
      );
    expect(await routes(50, 30)).toBe(2);
    expect(await routes(70, 30)).toBe(2);
    expect(await routes(90, 30)).toBe(3);
    expect(await routes(110, 30)).toBe(4);
    for (const cell of cells) {
      for (const z of [1.5, 2]) {
        await centerOn(page, cell.cx, cell.cy, z);
        await page.screenshot({ path: shot(`${cell.name}-z${z}`) });
      }
      await centerOn(page, cell.cx, cell.cy, 3);
      await page.screenshot({
        path: shot(`closeup-${cell.name}`),
        clip: { x: 300, y: 100, width: 200, height: 160 },
      });
    }
  });
});

test.describe("Phase 29 — demolish station", () => {
  test("Build tab: two-tap demolish removes the stop from the train's orders", async ({ page }) => {
    await setup(page);
    await clearArea(page, 40, 140, 20, 80);
    await build(
      page,
      range(12, (i) => ({ x: 50 + i, y: 30 })),
    );
    await station(page, 50, 30, "depot");
    await station(page, 55, 30, "station");
    await station(page, 61, 30, "station");
    const ids = await page.evaluate(() => window.__game!.getStations().map((s) => s.id));
    await page.evaluate((ids) => {
      const g = window.__game!;
      const r = g.buyTrain(ids[0]!, "atlantic-4-4-2", ["passengers"]);
      if (!r.ok) throw new Error(`buyTrain: ${r.reason}`);
      g.setOrders(
        r.trainId!,
        ids.map((stationId) => ({ stationId, rule: "auto" })),
      );
    }, ids);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids[1]!);
    await page.locator(".tab", { hasText: "Build" }).click();
    const btn = page.locator(".station-demolish-btn");
    await btn.scrollIntoViewIfNeeded();
    await expect(page.locator(".station-demolish-note")).toContainText("1 train stops here");
    await page.screenshot({ path: shot("demolish-station-panel") });
    await btn.click();
    await expect(btn).toContainText("Tap again");
    await page.screenshot({ path: shot("demolish-station-armed") });
    await btn.click();
    await expect(page.locator(".panel")).toHaveCount(0);
    const after = await page.evaluate(() => ({
      stations: window.__game!.getStations().length,
      orders: window.__game!.getTrains()[0]!.orders.length,
    }));
    expect(after).toEqual({ stations: 2, orders: 2 });
  });
});

test.describe("Phase 29 — demand clarity", () => {
  test("a Port's export demands carry an anchor badge and name the acceptor", async ({ page }) => {
    await setup(page);
    await clearArea(page, 40, 140, 20, 80);
    await page.evaluate(() => {
      const g = window.__game!;
      const st = g.getState() as unknown as {
        industries: Array<{ id: number; type: string; x: number; y: number }>;
        cities: Array<{ name: string; tiles: number[] }>;
      };
      const map = g.getMap() as unknown as { width: number; industryId: Int16Array };
      const id = st.industries.length;
      st.industries.push({ id, type: "port", x: 81, y: 31 });
      map.industryId[31 * map.width + 81] = id;
    });
    await build(
      page,
      range(8, (i) => ({ x: 76 + i, y: 30 })),
    );
    await station(page, 80, 30, "station");
    const id = await page.evaluate(() => window.__game!.getStations()[0]!.id);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), id);
    await expect(page.locator(".chip-badge").first()).toBeVisible();
    await page.screenshot({ path: shot("port-demand-badge") });
    await page.locator(".chip-badged").first().click();
    await expect(page.locator(".toast").last()).toContainText("Accepted by:");
    await expect(page.locator(".toast").last()).toContainText("(export)");
    await page.screenshot({ path: shot("port-demand-tap") });
  });
});
