import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phone-sized viewport (SPEC §10.1: "~800×360 CSS px"), matching earlier phases' e2e specs. */
const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;
const ROW_Y = 5; // a quiet corner of the map, away from any map-gen city/industry

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

async function tileScreenPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), { x, y });
}

async function selectTool(page: Page, name: "Track" | "Electrify" | "Info"): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
}

async function dragTo(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const p1 = await tileScreenPoint(page, from.x, from.y);
  const p2 = await tileScreenPoint(page, to.x, to.y);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move(p2.x, p2.y, { steps: 6 });
  await page.waitForTimeout(80);
}

/** Same rationale as economy.spec.ts's helper: guarantees a flat, empty patch regardless of what
 * the seed's map generator placed nearby. */
async function clearStrip(page: Page, x0: number, x1: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x0, x1, y }) => {
      const map = window.__game!.getMap();
      for (let row = y - 2; row <= y + 2; row++) {
        for (let x = x0; x <= x1; x++) {
          const idx = row * map.width + x;
          (map as unknown as { terrain: Uint8Array }).terrain[idx] = 0; // plain
          (map as unknown as { industryId: Int16Array }).industryId[idx] = -1;
          (map as unknown as { cityId: Int16Array }).cityId[idx] = -1;
        }
      }
    },
    { x0, x1, y },
  );
}

async function buildLineWithStations(
  page: Page,
  x0: number,
  x1: number,
  y: number,
): Promise<{ stationAId: number; stationBId: number }> {
  return page.evaluate(
    ({ x0, x1, y }) => {
      const g = window.__game!;
      const width = g.getMap().width;
      const path: number[] = [];
      for (let x = x0; x <= x1; x++) path.push(y * width + x);
      const track = g.buildTrackPath(path);
      if (!track.ok) throw new Error(`track build failed: ${track.reason}`);
      const a = g.buildStation(y * width + x0, "depot");
      const b = g.buildStation(y * width + x1, "depot");
      if (!a.ok || !b.ok) throw new Error(`station build failed: ${a.reason ?? b.reason}`);
      const stations = g.getStations();
      const stationAId = stations.find((s) => s.x === x0 && s.y === y)!.id;
      const stationBId = stations.find((s) => s.x === x1 && s.y === y)!.id;
      return { stationAId, stationBId };
    },
    { x0, x1, y },
  );
}

test.describe("Phase 8 — eras and technology", () => {
  test("Electrify mode drags along existing track and confirms; catenary + electric loco render at zoom 2", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    // 1940: well past the 1905 electrification era, so the drag/command isn't era-blocked.
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearStrip(page, 60, 90, ROW_Y);
    const { stationAId, stationBId } = await buildLineWithStations(page, 70, 78, ROW_Y);

    await centerOn(page, 73, ROW_Y, 1.5);
    await selectTool(page, "Electrify");
    await dragTo(page, { x: 70, y: ROW_Y }, { x: 78, y: ROW_Y });
    await page.mouse.up();
    await page.waitForTimeout(100);
    await expect(page.locator(".confirm-bar-build")).toBeVisible();
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(100);

    const edges = await page.evaluate(() => window.__game!.getTrackEdges());
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every((e) => e.electrified)).toBe(true);

    const bought = await page.evaluate(
      ({ stationAId }) => window.__game!.buyTrain(stationAId, "early-electric", ["goods", "goods"]),
      { stationAId },
    );
    expect(bought.ok).toBe(true);
    await page.evaluate(
      ({ trainId, stationAId, stationBId }) =>
        window.__game!.setOrders(trainId, [
          { stationId: stationAId, rule: "auto" },
          { stationId: stationBId, rule: "auto" },
        ]),
      { trainId: bought.trainId!, stationAId, stationBId },
    );

    await page.evaluate(() => window.__game!.runDays(2));
    await selectTool(page, "Info");
    await centerOn(page, 73, ROW_Y, 2);
    await page.screenshot({ path: "docs/screenshots/phase-8-electrified-line-zoom2.png" });

    expect(consoleErrors).toEqual([]);
  });

  test("diesel train renders distinctly at zoom 2 (no electrification needed)", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    });
    await clearStrip(page, 60, 90, ROW_Y + 10);
    const { stationAId, stationBId } = await buildLineWithStations(page, 70, 78, ROW_Y + 10);

    const bought = await page.evaluate(
      ({ stationAId }) =>
        window.__game!.buyTrain(stationAId, "streamliner-diesel", ["passengers", "passengers"]),
      { stationAId },
    );
    expect(bought.ok).toBe(true);
    await page.evaluate(
      ({ trainId, stationAId, stationBId }) =>
        window.__game!.setOrders(trainId, [
          { stationId: stationAId, rule: "auto" },
          { stationId: stationBId, rule: "auto" },
        ]),
      { trainId: bought.trainId!, stationAId, stationBId },
    );

    await page.evaluate(() => window.__game!.runDays(2));
    await centerOn(page, 73, ROW_Y + 10, 2);
    await page.screenshot({ path: "docs/screenshots/phase-8-diesel-train-zoom2.png" });
  });

  test("a forced breakdown shows the map indicator and appears in the News panel with an unread badge", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1900,
    });
    await clearStrip(page, 60, 90, ROW_Y + 20);
    const { stationAId, stationBId } = await buildLineWithStations(page, 70, 78, ROW_Y + 20);

    const bought = await page.evaluate(
      ({ stationAId }) => window.__game!.buyTrain(stationAId, "american-4-4-0", ["coal"]),
      { stationAId },
    );
    expect(bought.ok).toBe(true);
    await page.evaluate(
      ({ trainId, stationAId, stationBId }) =>
        window.__game!.setOrders(trainId, [
          { stationId: stationAId, rule: "auto" },
          { stationId: stationBId, rule: "auto" },
        ]),
      { trainId: bought.trainId!, stationAId, stationBId },
    );
    await page.evaluate(() => window.__game!.runDays(2)); // get it moving first

    // Force a breakdown deterministically (SPEC §7.6's monthly roll is probabilistic — not
    // suitable for a screenshot test) by setting the sim's own breakdown countdown directly (the
    // formula itself is covered by tests/sim/trains/eras.test.ts's statistical tests) and pushing
    // the same news item `monthlyBreakdownStep` would have, then ticking once so `stepTrain`
    // picks up the countdown and sets status="broken".
    await page.evaluate(
      ({ trainId }) => {
        const state = window.__game!.getState() as {
          ticks: number;
          nextNewsId: number;
          news: Array<{ id: number; tick: number; kind: string; trainId: number }>;
          pendingNews: Array<{ id: number; tick: number; kind: string; trainId: number }>;
          trains: Array<{ id: number; breakdownTicksLeft: number }>;
        };
        const train = state.trains.find((t) => t.id === trainId)!;
        train.breakdownTicksLeft = 3 * 24;
        const item = { id: state.nextNewsId++, tick: state.ticks, kind: "breakdown", trainId };
        state.news.push(item);
        state.pendingNews.push(item);
      },
      { trainId: bought.trainId! },
    );
    await page.evaluate(() => window.__game!.runDays(0.1));

    await centerOn(page, 73, ROW_Y + 20, 2);
    await page.screenshot({ path: "docs/screenshots/phase-8-breakdown-indicator.png" });

    await expect(page.locator(".news-unread-badge")).toHaveClass(/visible/);
    await page.locator(".news-button").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".panel-title")).toHaveText("News");
    await expect(page.locator(".news-item").first()).toContainText("broken down");
    await page.screenshot({ path: "docs/screenshots/phase-8-news-panel.png" });

    // Opening the panel marks everything read.
    await expect(page.locator(".news-unread-badge")).not.toHaveClass(/visible/);
  });

  test("yearly report shows a New technology section the year a locomotive unlocks", async ({
    page,
  }) => {
    // 1904 -> cross into 1905, the exact year the first Electric (early-electric) unlocks.
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1904,
    });
    await page.evaluate(() => window.__game!.runDays(366));
    await page.waitForTimeout(300); // clear the panel's own slide-in transition

    await expect(page.locator(".panel-title")).toHaveText("1904 Year in Review");
    await expect(page.locator("text=New technology")).toBeVisible();
    // Pacific 4-6-2 (Steam) also happens to intro in 1905, so both cards render — check the
    // Electric one specifically rather than assuming there's only one.
    const electricCard = page.locator(".yearly-report-tech-card", { hasText: "Early Electric" });
    await expect(electricCard).toBeVisible();
    // Let the "new locomotive" toasts (SPEC §10.1: non-blocking, top-center) finish their own
    // timeout so the screenshot shows the report clearly instead of overlapped by them, and
    // scroll the panel body down to the tech section itself.
    await page.waitForTimeout(4000);
    await electricCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await page.screenshot({ path: "docs/screenshots/phase-8-yearly-report-tech.png" });
  });

  test("finance panel: Yearly Report button stays pinned at the bottom (Phase 7.1 review fix)", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });
    await clearStrip(page, 60, 90, ROW_Y + 30);
    await buildLineWithStations(page, 70, 80, ROW_Y + 30);
    await page.evaluate(() => window.__game!.runDays(65));

    await page.locator(".cash").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".panel-title")).toHaveText("Finance");
    await expect(page.locator(".panel-actions")).toContainText("Yearly Report");
    await page.screenshot({ path: "docs/screenshots/phase-8-finance-panel-fixed.png" });
  });
});
