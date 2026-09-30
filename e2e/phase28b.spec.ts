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

test.describe("Phase 28B — modals never block", () => {
  test("Jan 1: toast + badge, no panel, map still drags; report opens from Finance", async ({
    page,
  }) => {
    await lineWithTrain(page);
    await page.evaluate(() => window.__game!.runDays(366));
    await page.waitForTimeout(400);
    await expect(page.locator(".panel-open")).toHaveCount(0);
    await expect(page.locator(".top-bar .cash.has-badge")).toBeVisible();
    await expect(page.locator(".toast", { hasText: "Year in Review" })).toBeVisible();
    await page.screenshot({ path: shot("year-toast-badge") });
    // A drag on the map pans the camera (nothing swallows it).
    const before = await page.evaluate(() => window.__game!.camera.getCenter());
    await page.mouse.move(400, 200);
    await page.mouse.down();
    await page.mouse.move(300, 160, { steps: 6 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__game!.camera.getCenter());
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(20);
    await page.locator(".top-bar .cash").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".fbtn.has-badge")).toBeVisible();
    await page.getByRole("button", { name: "Yearly Report" }).click();
    await page.waitForTimeout(400);
    await expect(page.locator(".yearly-report-headline")).toContainText("Operating profit");
    await expect(page.locator(".yearly-report-investments")).toBeVisible();
    await expect(page.locator(".top-bar .cash.has-badge")).toHaveCount(0);
    await page.waitForTimeout(4000); // let the toasts clear
    await page.screenshot({ path: shot("year-report") });
  });

  test("several new engines share one card and do not block map drags", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const s = window.__game!.getState() as unknown as { pendingNews: Array<unknown> };
      s.pendingNews.push(
        { id: 9001, tick: 0, kind: "newLocomotive", locoId: "pacific-4-6-2" },
        { id: 9002, tick: 0, kind: "newLocomotive", locoId: "early-electric" },
        { id: 9003, tick: 0, kind: "newLocomotive", locoId: "mikado-2-8-2" },
      );
    });
    await page.evaluate(() => window.__game!.runDays(1));
    await page.waitForTimeout(300);
    await expect(page.locator(".new-engine-card")).toHaveCount(1);
    await expect(page.locator(".new-engine-row")).toHaveCount(3);
    await page.screenshot({ path: shot("new-engines") });
    const before = await page.evaluate(() => window.__game!.camera.getCenter());
    await page.mouse.move(690, 300);
    await page.mouse.down();
    await page.mouse.move(640, 280, { steps: 5 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__game!.camera.getCenter());
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(10);
  });
});

test.describe("Phase 28B — buy-train route sheet", () => {
  test("bottom sheet keeps the map tappable; stops from the tap hook and from a searchable list", async ({
    page,
  }) => {
    const { a, b } = await lineWithTrain(page);
    await build(
      page,
      range(10, (i) => ({ x: 64 + i, y: 35 })),
    );
    await station(page, 73, 35);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), a);
    await page.locator(".station-buy-train-btn").click();
    await page.locator(".wizard-next").click();
    await page.locator(".train-car-add-btn", { hasText: "Passengers" }).click();
    await page.locator(".wizard-next").click();
    const sheet = page.locator(".panel.panel-bottom");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    const box = (await sheet.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(0.45 * 360);
    expect(box.y + box.height).toBeGreaterThanOrEqual(355);
    await page.screenshot({ path: shot("route-sheet-empty") });
    // Stop 1 via the map-pick hook, stop 2 via the searchable list.
    await page.locator(".train-pick-station-btn").click();
    await page.evaluate((sid) => window.__game!.debugPickStation(sid), a);
    await expect(page.locator('[data-testid="tl-stop"]')).toHaveCount(1);
    await page.locator(".rs-list-btn").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("route-sheet-list") });
    await page.locator(".rs-search").fill("zzzz");
    await expect(page.locator('[data-testid="rs-station"]')).toHaveCount(0);
    await page.locator(".rs-search").fill("");
    await expect(page.locator('[data-testid="rs-station"]')).toHaveCount(3);
    await page.locator('[data-testid="rs-station"]').nth(1).click();
    await expect(page.locator('[data-testid="tl-stop"]')).toHaveCount(2);
    // A third stop so the compact list has to scroll within its sheet.
    await page.locator(".train-pick-station-btn").click();
    await page.evaluate((sid) => window.__game!.debugPickStation(sid), b);
    await expect(page.locator('[data-testid="tl-stop"]')).toHaveCount(3);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("route-sheet-stops") });
    // The map above the sheet still takes drags.
    const before = await page.evaluate(() => window.__game!.camera.getCenter());
    await page.mouse.move(500, 60 + 40);
    await page.mouse.down();
    await page.mouse.move(420, 100, { steps: 5 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__game!.camera.getCenter());
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(20);
    await page.locator(".panel-action-build").click();
    const trains = await page.evaluate(() => window.__game!.getTrains());
    expect(trains).toHaveLength(2);
    expect(trains[1]!.orders).toHaveLength(3);
  });
});

async function dragTiles(page: Page, from: P, to: P, release = false): Promise<void> {
  const p1 = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), from);
  const p2 = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), to);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move(p2.x, p2.y, { steps: 8 });
  await page.waitForTimeout(120);
  if (release) await page.mouse.up();
}

test.describe("Phase 28B — bulldoze", () => {
  test("highlights exactly what goes; a stub beside the line leaves the main line; empty drags explain $0", async ({
    page,
  }) => {
    await lineWithTrain(page);
    await page.evaluate(() => window.__game!.sellTrain(window.__game!.getTrains()[0]!.id));
    await build(page, [
      { x: 58, y: 35 },
      { x: 59, y: 36 },
    ]);
    await centerOn(page, 58, 35, 2);
    const edgesBefore = await page.evaluate(() => window.__game!.getTrackEdges().length);
    await page.getByRole("button", { name: "Bulldoze", exact: true }).click();
    // A drag over bare ground explains itself instead of a silent "$0".
    await dragTiles(page, { x: 61, y: 37 }, { x: 63, y: 37 });
    await expect(page.locator(".build-cost-label")).toContainText("whole track piece");
    await page.screenshot({ path: shot("bulldoze-empty") });
    await page.mouse.up();
    // The stub drag: preview shows a refund, then the main line survives the removal.
    await dragTiles(page, { x: 59, y: 36 }, { x: 58, y: 35 });
    await expect(page.locator(".build-cost-label")).toContainText("+$");
    await page.screenshot({ path: shot("bulldoze-stub") });
    await page.mouse.up();
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(200);
    const edgesAfter = await page.evaluate(() => window.__game!.getTrackEdges().length);
    expect(edgesAfter).toBe(edgesBefore - 1);
  });

  test("tapping a station with Bulldoze asks to confirm; trains on its orders block it", async ({
    page,
  }) => {
    const { b } = await lineWithTrain(page);
    await centerOn(page, 62, 35, 1.5);
    await page.getByRole("button", { name: "Bulldoze", exact: true }).click();
    const p = await page.evaluate(() => window.__game!.tileScreenPoint(64, 35));
    await page.mouse.click(p.x, p.y);
    await expect(page.locator(".toast", { hasText: "orders" })).toBeVisible();
    expect(await page.evaluate(() => window.__game!.getStations().length)).toBe(2);
    await page.evaluate(() => window.__game!.sellTrain(window.__game!.getTrains()[0]!.id));
    await page.waitForTimeout(3700);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator(".confirm-bar")).toContainText("Remove");
    await page.screenshot({ path: shot("bulldoze-station") });
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(200);
    const left = await page.evaluate(() => window.__game!.getStations().map((s) => s.id));
    expect(left).not.toContain(b);
    expect(left).toHaveLength(1);
  });
});
