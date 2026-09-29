import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 26B screenshots and checks: news, junction art, station Build tab, Help, map edge. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const SHOT = process.env["SHOT"] ?? "after";
const shot = (name: string): string => `docs/screenshots/phase-26b-${name}.png`;
const jshot = (name: string): string => `docs/screenshots/phase-26b-junction-${name}-${SHOT}.png`;
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

test.describe("Phase 26B — news", () => {
  test("Clear all with two-tap confirm, and collapsed repeats show a count", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const s = window.__game!.getState() as unknown as {
        news: Array<Record<string, unknown>>;
        trains: unknown[];
      };
      s.news.push(
        { id: 1, tick: 100, kind: "newLocomotive", locoId: "american-4-4-0" },
        { id: 2, tick: 200, kind: "trafficJam", tile: 5000, count: 3 },
        { id: 3, tick: 300, kind: "washout", tile: 5100 },
      );
    });
    await page.locator(".news-button").click();
    await page.waitForTimeout(350);
    await expect(page.getByText(/Traffic jam near .* ×3/)).toBeVisible();
    await page.screenshot({ path: shot("news-collapsed") });
    await page.locator(".news-clear-btn").click();
    await expect(page.getByText("Clear all news?")).toBeVisible();
    await page.screenshot({ path: shot("news-clear-confirm") });
    await page.locator(".news-clear-btn").click();
    await expect(page.getByText("No news yet.")).toBeVisible();
    expect(await page.evaluate(() => window.__game!.getNewsCount())).toBe(0);
    await page.screenshot({ path: shot("news-cleared") });
  });
});

test.describe("Phase 26B — junction art", () => {
  test("double main + double wye + double branch + crossing next to a station", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 50, 100, 20, 50);
    // Double main line, west to east.
    await build(
      page,
      range(41, (i) => ({ x: 55 + i, y: 35 })),
      true,
    );
    // Double wye: two diagonal legs off the main meeting at (66,31), double stem north of it.
    const stem = range(7, (i) => ({ x: 66, y: 30 - i }));
    await build(page, [...range(5, (i) => ({ x: 62 + i, y: 35 - i })), ...stem], true);
    await build(page, [...range(5, (i) => ({ x: 70 - i, y: 35 - i })), ...stem.slice(0, 2)], true);
    // A single line crossing the stem, and a double branch off the main close to the wye.
    await build(
      page,
      range(21, (i) => ({ x: 56 + i, y: 27 })),
    );
    await build(
      page,
      range(7, (i) => ({ x: 74 + i, y: 35 + i })),
      true,
    );
    await station(page, 78, 35);
    for (const z of [1.5, 2]) {
      await centerOn(page, 66, 32, z);
      await page.screenshot({ path: jshot(`wye-z${z}`) });
      await centerOn(page, 66, 28, z);
      await page.screenshot({ path: jshot(`crossing-z${z}`) });
      await centerOn(page, 76, 36, z);
      await page.screenshot({ path: jshot(`branch-station-z${z}`) });
    }
  });
});

test.describe("Phase 26B — dense junctions", () => {
  test("close turnouts, a forking double branch, a double crossing and a crossover", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 50, 100, 20, 50);
    await build(
      page,
      range(41, (i) => ({ x: 55 + i, y: 35 })),
      true,
    );
    // Two double branches leaving the main three tiles apart, both to the north-east.
    await build(
      page,
      [...range(5, (i) => ({ x: 60 + i, y: 35 - i })), ...range(6, (i) => ({ x: 65, y: 30 - i }))],
      true,
    );
    await build(
      page,
      [
        ...range(5, (i) => ({ x: 63 + i, y: 35 - i })),
        ...range(3, (i) => ({ x: 67 + i, y: 30 - i })),
      ],
      true,
    );
    // A double branch off the first that forks again two tiles later.
    await build(
      page,
      range(5, (i) => ({ x: 65 + i, y: 29 - i })),
      true,
    );
    // South side: single branch and double branch two tiles apart.
    await build(
      page,
      range(6, (i) => ({ x: 72 + i, y: 35 + i })),
    );
    await build(
      page,
      range(6, (i) => ({ x: 74 - i, y: 35 + i })),
      true,
    );
    // Vertical double line crossing the double main.
    await build(
      page,
      range(12, (i) => ({ x: 84, y: 29 + i })),
      true,
    );
    await station(page, 88, 35);
    for (const z of [1.5, 2]) {
      await centerOn(page, 63, 33, z);
      await page.screenshot({ path: jshot(`dense-north-z${z}`) });
      await centerOn(page, 73, 36, z);
      await page.screenshot({ path: jshot(`dense-south-z${z}`) });
      await centerOn(page, 85, 35, z);
      await page.screenshot({ path: jshot(`dense-crossing-z${z}`) });
    }
  });
});

test.describe("Phase 26B — station Build tab and Help", () => {
  test("Build tab explains upgrades; Help has both explainers", async ({ page }) => {
    await setup(page);
    await clearArea(page, 50, 100, 20, 50);
    await build(
      page,
      range(12, (i) => ({ x: 60 + i, y: 35 })),
    );
    await station(page, 65, 35, "depot");
    const id = await page.evaluate(
      () => (window.__game!.getStations() as Array<{ id: number }>)[0]!.id,
    );
    await page.evaluate((sid) => window.__game!.debugOpenStation(sid), id);
    await page.waitForTimeout(300);
    await page.locator('[data-tab="build"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator(".upgrade-benefit")).toContainText("Catchment 5×5");
    await expect(page.locator(".station-improvement-btn").first()).toContainText("Mail +50% here");
    await page.screenshot({ path: shot("station-build-tab") });
    await page.locator(".panel-body").evaluate((el) => (el.scrollTop = 400));
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot("station-build-tab-scrolled") });

    await page
      .locator(".panel-header button, .panel button[aria-label='Close']")
      .first()
      .click()
      .catch(() => {});
    await page
      .getByRole("button", { name: "Menu" })
      .click()
      .catch(async () => {
        await page.locator(".top-bar-menu, [aria-label='Menu']").first().click();
      });
    await page.locator('[data-testid="menu-help"]').click();
    await page.waitForTimeout(300);
    await expect(page.getByText("Station size")).toBeVisible();
    await page.screenshot({ path: shot("help-upgrades") });
    await page.locator('[data-tab="money"]').click();
    await page.waitForTimeout(200);
    await expect(page.getByText(/You earn money when a train unloads/)).toBeVisible();
    await page.screenshot({ path: shot("help-money") });
  });
});
