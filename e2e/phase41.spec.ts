import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 41: visible causes (bridge weight), warnings, era start, chain bottlenecks, honest chain pay. */
test.use({ deviceScaleFactor: 2 });

type Page = import("@playwright/test").Page;

async function freshGame(page: Page, startYear: number): Promise<void> {
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(
    (year) => window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: year }),
    startYear,
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
}

/** A flat 10-tile strip with a station at each end; the middle edge is turned into a wooden bridge. */
async function bridgeLine(page: Page): Promise<{ a: number; b: number }> {
  return page.evaluate(() => {
    const game = window.__game!;
    const map = game.getMap();
    const m = map as unknown as {
      terrain: Uint8Array;
      riverNext: Int32Array;
      riverFlow: Uint16Array;
      industryId: Int32Array;
    };
    const y = Math.floor(map.height / 2);
    const tiles: number[] = [];
    for (let x = 30; x < 40; x++) {
      const idx = y * map.width + x;
      m.terrain[idx] = 0;
      m.riverNext[idx] = -1;
      m.riverFlow[idx] = 0;
      m.industryId[idx] = -1;
      tiles.push(idx);
    }
    game.debugSetCash(5_000_000);
    if (!game.buildTrackPath(tiles).ok) throw new Error("track");
    if (!game.buildStation(tiles[0]!, "station").ok) throw new Error("station a");
    if (!game.buildStation(tiles[9]!, "station").ok) throw new Error("station b");
    const state = game.getState() as {
      trackGraph: {
        getEdge: (a: number, b: number) => { bridge: string | null; bridgeSpan: number[] };
      };
    };
    const edge = state.trackGraph.getEdge(tiles[4]!, tiles[5]!);
    edge.bridge = "wood";
    edge.bridgeSpan = [tiles[4]!];
    const [sa, sb] = game.getStations();
    const bought = game.buyTrain(sa!.id, "hudson-4-6-4", []);
    if (!bought.ok) throw new Error(`buy ${bought.reason}`);
    game.setOrders(bought.trainId!, [
      { stationId: sa!.id, rule: "auto" },
      { stationId: sb!.id, rule: "auto" },
    ]);
    return { a: bought.trainId!, b: sb!.id };
  });
}

test("a heavy engine behind a wooden bridge says so and can fix it in one tap", async ({
  page,
}) => {
  await freshGame(page, 1930);
  const { a: trainId } = await bridgeLine(page);
  await page.evaluate(() => window.__game!.runDays(3));
  await page.evaluate((id) => window.__game!.debugOpenTrain(id), trainId);
  const status = page.getByTestId("train-status");
  await expect(status).toContainText(/too heavy for the wooden bridge near/);
  const fix = page.getByTestId("bridge-fix");
  await expect(fix).toHaveText(/Rebuild in (stone|steel) · \$/);
  await page.screenshot({ path: "docs/screenshots/phase-41-heavy-bridge.png" });
  await fix.click();
  await page.evaluate(() => window.__game!.runDays(5));
  const trains = await page.evaluate(() => window.__game!.getTrains());
  expect(trains[0]!.status).not.toBe("noRoute");
  await expect(page.getByTestId("bridge-fix")).toHaveCount(0);
});

test("the insolvency banner is not covered by toasts, and says what the news says", async ({
  page,
}) => {
  await freshGame(page, 1900);
  await page.evaluate(() => {
    const state = window.__game!.getState() as {
      ticks: number;
      cash: number;
    };
    state.ticks = 30 * 30 * 24;
    state.cash = -400_000;
  });
  await page.evaluate(() => window.__game!.runDays(31));
  const banner = page.locator(".status-banner");
  await expect(banner).toBeVisible();
  const text = (await banner.textContent())!;
  expect(text).toMatch(/Insolvent: \d+ months? to recover/);
  // the news toast says the same thing, and the stack starts below the banner
  const toast = page.locator(".toast").filter({ hasText: /Insolvent/ });
  await expect(toast.first()).toBeVisible();
  expect(await toast.first().textContent()).toContain(text.trim());
  const bannerBox = (await banner.boundingBox())!;
  const stackBox = (await page.locator(".toast-container").boundingBox())!;
  expect(stackBox.y).toBeGreaterThanOrEqual(bannerBox.y + bannerBox.height);
  await page.screenshot({ path: "docs/screenshots/phase-41-banner-and-toasts.png" });
});

test("start-up credit ending is announced three months ahead, and Borrow shows its terms", async ({
  page,
}) => {
  await freshGame(page, 1900);
  await page.evaluate(() => {
    const state = window.__game!.getState() as { ticks: number; finance: { loans: number } };
    state.finance.loans = 300_000;
    state.ticks = 21 * 30 * 24 - 24 * 3;
  });
  await page.evaluate(() => window.__game!.runDays(5));
  await expect(page.locator(".status-banner")).toHaveText(
    /Start-up credit ends in 3 months: limit ~\$/,
  );
  await page.screenshot({ path: "docs/screenshots/phase-41-startup-credit.png" });
  await page.locator(".status-banner").click(); // opens Finance
  await expect(page.getByTestId("borrow-terms")).toHaveText(
    /Borrow \$100k: \d+\.\d %.*10 years.*\$833 a month/,
  );
  await page.getByTestId("borrow-terms").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/phase-41-borrow-terms.png" });
});

test("late starts are labelled and start with more cash", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Game" }).click();
  await page.getByRole("button", { name: "Random" }).click();
  await expect(page.getByTestId("expert-start")).toHaveCount(0);
  await expect(page.locator(".starting-cash")).toHaveText("$1.0M");
  await page.getByRole("button", { name: "1950" }).click();
  await expect(page.getByTestId("expert-start")).toHaveText(/Expert: few, expensive first lines/);
  await expect(page.locator(".starting-cash")).toHaveText("$2.0M");
  await page.screenshot({ path: "docs/screenshots/phase-41-new-game-1950.png" });
});

/** Two flat stations a few tiles apart on single track, two trains going opposite ways. */
async function singleTrackPair(page: Page): Promise<{ mid: number; stationId: number }> {
  return page.evaluate(() => {
    const game = window.__game!;
    const map = game.getMap();
    const m = map as unknown as {
      terrain: Uint8Array;
      riverNext: Int32Array;
      riverFlow: Uint16Array;
      industryId: Int32Array;
    };
    const y = Math.floor(map.height / 2);
    const tiles: number[] = [];
    for (let x = 30; x < 42; x++) {
      const idx = y * map.width + x;
      m.terrain[idx] = 0;
      m.riverNext[idx] = -1;
      m.riverFlow[idx] = 0;
      m.industryId[idx] = -1;
      tiles.push(idx);
    }
    game.debugSetCash(5_000_000);
    if (!game.buildTrackPath(tiles).ok) throw new Error("track");
    if (!game.buildStation(tiles[0]!, "station").ok) throw new Error("station a");
    if (!game.buildStation(tiles[11]!, "station").ok) throw new Error("station b");
    const [sa, sb] = game.getStations();
    for (const [from, to] of [
      [sa!, sb!],
      [sb!, sa!],
    ] as const) {
      const bought = game.buyTrain(sa!.id, "american-4-4-0", ["passengers"]); // only the first station has a shed
      if (!bought.ok) throw new Error(`buy ${bought.reason}`);
      game.setOrders(bought.trainId!, [
        { stationId: from.id, rule: "auto" },
        { stationId: to.id, rule: "auto" },
      ]);
    }
    return { mid: tiles[6]!, stationId: sa!.id };
  });
}

test("a single-track jam toast gives the passing-loop price and taps into building it", async ({
  page,
}) => {
  await freshGame(page, 1860);
  const { mid } = await singleTrackPair(page);
  await page.evaluate(() => window.__game!.runDays(6)); // both trains are under way: their routes cross the mid tile
  await page.evaluate((tile) => {
    const state = window.__game!.getState() as {
      ticks: number;
      nextNewsId: number;
      news: unknown[];
      pendingNews: unknown[];
    };
    const item = { kind: "trafficJam", tile, id: state.nextNewsId++, tick: state.ticks };
    state.news.push(item);
    state.pendingNews.push(item);
  }, mid);
  await page.evaluate(() => window.__game!.runDays(1));
  const toast = page.locator(".toast").filter({ hasText: /share a single line/ });
  await expect(toast).toHaveCount(1); // posted once
  await expect(toast).toHaveText(
    /2 trains share a single line near .* — passing loop \$[\d.]+k, tap to build/,
  );
  await toast.click();
  await expect(page.getByTestId("loop-line")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/phase-41-passing-loop.png" });
  const before = await page.evaluate(() => window.__game!.getStations().length);
  await page.locator(".loop-build-btn").click();
  const after = await page.evaluate(() => window.__game!.getStations().length);
  expect(after).toBe(before + 1);
});

test("a station whose pile is full says how much was lost and what a Terminal holds", async ({
  page,
}) => {
  await freshGame(page, 1860);
  const { stationId } = await singleTrackPair(page);
  await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationEconomy: Map<number, { supply: Record<string, number> }>;
    };
    state.stationEconomy.get(id)!.supply["coal"] = 200; // a mine making far more than a Station's pile holds
  }, stationId);
  // as if last month's production had overflowed the pile (the daily accounting is in the sim unit tests)
  await page.evaluate((id) => {
    const flow = window.__game!.getStationFlow(id)! as unknown as {
      lastMonth: Record<string, unknown>;
    };
    flow.lastMonth["coal"] = {
      revenue: 0,
      units: 0,
      lostUnits: 0,
      lostRevenue: 0,
      pileFullUnits: 47,
    };
  }, stationId);
  await page.evaluate((id) => window.__game!.debugOpenStation(id), stationId);
  const line = page.getByTestId("pile-full");
  await expect(line).toHaveText(/Pile full: \d+ t lost last month · Terminal holds 150 t/);
  await page.screenshot({ path: "docs/screenshots/phase-41-pile-full.png" });
});
