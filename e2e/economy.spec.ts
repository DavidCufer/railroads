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

async function selectTool(page: Page, name: "Track" | "Station" | "Info"): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
}

const LOCO = "american-4-4-0"; // 1848, cheap, plenty of cars

/** Flattens a block of plain terrain (`x0..x1`, a few rows around `y`) and clears any map-gen
 * city/industry there, so every economy scenario in this file starts from a known-clean slate
 * regardless of what the seed's map generator happened to place nearby — including the rows just
 * off the track line where these tests plant their own industries/cities. */
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
  typeA: "depot" | "station" = "depot",
  typeB: "depot" | "station" = "depot",
): Promise<{ stationAId: number; stationBId: number }> {
  return page.evaluate(
    ({ x0, x1, y, typeA, typeB }) => {
      const g = window.__game!;
      const width = g.getMap().width;
      const path: number[] = [];
      for (let x = x0; x <= x1; x++) path.push(y * width + x);
      const track = g.buildTrackPath(path);
      if (!track.ok) throw new Error(`track build failed: ${track.reason}`);
      const a = g.buildStation(y * width + x0, typeA);
      const b = g.buildStation(y * width + x1, typeB);
      if (!a.ok || !b.ok) throw new Error(`station build failed: ${a.reason ?? b.reason}`);
      const stations = g.getStations();
      const stationAId = stations.find((s) => s.x === x0 && s.y === y)!.id;
      const stationBId = stations.find((s) => s.x === x1 && s.y === y)!.id;
      return { stationAId, stationBId };
    },
    { x0, x1, y, typeA, typeB },
  );
}

test.describe("Phase 7 — cargo flow and economy", () => {
  test("a coal mine -> steel mill delivery earns revenue and shows a floating +$ label", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });
    await clearStrip(page, 60, 90, ROW_Y);
    const { stationAId, stationBId } = await buildLineWithStations(page, 70, 80, ROW_Y);

    await page.evaluate(() => {
      const g = window.__game!;
      const map = g.getMap();
      // Diagonally adjacent rather than directly above the station (still inside a depot's 3x3
      // catchment) — the floating $ label rises straight up from the station tile, so placing the
      // industry icon directly above it would visually bury the label under the icon's own dark
      // colors when we screenshot the delivery below.
      g.debugPlaceIndustry(4 * map.width + 71, "coalMine");
      g.debugPlaceIndustry(4 * map.width + 81, "steelMill");
    });

    const bought = await page.evaluate(
      ({ stationAId, loco }) =>
        window.__game!.buyTrain(stationAId, loco, ["coal", "coal", "coal", "coal"]),
      { stationAId, loco: LOCO },
    );
    expect(bought.ok).toBe(true);
    await page.evaluate(
      ({ trainId, stationAId, stationBId }) =>
        window.__game!.setOrders(trainId!, [
          { stationId: stationAId, rule: "auto" },
          { stationId: stationBId, rule: "auto" },
        ]),
      { trainId: bought.trainId, stationAId, stationBId },
    );

    // Isolate operating profit from the one-time train purchase: measure cash right after buying.
    const cashBefore = await page.evaluate(() => window.__game!.getCash());

    // Step hour by hour and stop the instant a delivery's freight revenue lands, so the
    // screenshot right after is taken within the floating label's ~1.4s real-time window instead
    // of at some arbitrary later point once it's already faded.
    const deliveredWithinWindow = await page.evaluate(() => {
      const g = window.__game!;
      let lastFreight = g.getFinance().thisYear.freight;
      for (let hour = 0; hour < 24 * 60; hour++) {
        g.runDays(1 / 24);
        const freight = g.getFinance().thisYear.freight;
        if (freight > lastFreight) return true;
        lastFreight = freight;
      }
      return false;
    });
    expect(deliveredWithinWindow).toBe(true);

    const cashAfter = await page.evaluate(() => window.__game!.getCash());
    expect(cashAfter).toBeGreaterThan(cashBefore);

    // The delivery should have queued a still-active floating label (SPEC §8.1).
    const labels = await page.evaluate(() => window.__game!.getFloatingLabels());
    expect(labels.length).toBeGreaterThan(0);

    await centerOn(page, 80, ROW_Y, 1.5);
    await page.waitForTimeout(50);
    await page.screenshot({ path: "docs/screenshots/phase-7-delivery-label.png" });
  });

  test("station panel shows waiting-cargo bars once supply has accrued", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });
    await clearStrip(page, 60, 90, ROW_Y);
    const { stationAId } = await buildLineWithStations(page, 70, 80, ROW_Y);

    await page.evaluate(() => {
      const g = window.__game!;
      const map = g.getMap();
      g.debugPlaceIndustry(4 * map.width + 70, "coalMine");
    });
    await page.evaluate(() => window.__game!.runDays(10));

    const pile = await page.evaluate((id) => window.__game!.getStationCargo(id), stationAId);
    expect(pile?.coal?.amount).toBeGreaterThan(0);

    await selectTool(page, "Info");
    await centerOn(page, 70, ROW_Y, 1.5);
    const p = await tileScreenPoint(page, 70, ROW_Y);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    await expect(page.locator(".cargo-bar-row")).toHaveCount(1);
    await expect(page.locator(".cargo-bar-label")).toHaveText("Coal");
    // Waiting cargo is the panel's last section — scroll down so it's actually in frame. Only
    // `.panel-body` scrolls (Phase 7.1: `.panel` itself became a plain flex column with a fixed
    // header/footer around it, see index.html).
    await page.locator(".panel-body").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(50);
    await page.screenshot({ path: "docs/screenshots/phase-7-station-waiting-cargo.png" });
  });

  test("finance panel shows cash, loans, ledger and a chart; borrow/repay works", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });
    await clearStrip(page, 60, 90, ROW_Y);
    await buildLineWithStations(page, 70, 80, ROW_Y);
    await page.evaluate(() => window.__game!.runDays(65)); // cross 2 month boundaries for a real chart line

    await page.locator(".cash").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".panel-title")).toHaveText("Finance");
    await expect(page.locator(".finance-chart")).toBeVisible();

    const loansBefore = (await page.evaluate(() => window.__game!.getFinance())).loans;
    await page.locator(".finance-loan-btn", { hasText: "Borrow" }).click();
    // Re-rendering the panel replaces it (closePanel fades the old DOM out over 220ms) — wait for
    // that to finish so a stale, still-present old button can't match the next locator too.
    await page.waitForTimeout(300);
    const loansAfter = (await page.evaluate(() => window.__game!.getFinance())).loans;
    expect(loansAfter).toBe(loansBefore + 100_000);

    await page.locator(".finance-loan-btn", { hasText: "Repay" }).click();
    await page.waitForTimeout(300);
    const loansRepaid = (await page.evaluate(() => window.__game!.getFinance())).loans;
    expect(loansRepaid).toBe(loansBefore);

    // Scroll just enough to bring the chart into view alongside the cash/loan summary above it.
    await page.locator(".panel").evaluate((el) => {
      const chart = el.querySelector(".finance-chart");
      chart?.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(50);
    await page.screenshot({ path: "docs/screenshots/phase-7-finance-panel.png" });
  });

  test("yearly report opens automatically at the year boundary with the past year's ledger", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });
    await clearStrip(page, 60, 90, ROW_Y);
    await buildLineWithStations(page, 70, 80, ROW_Y);

    await page.evaluate(() => window.__game!.runDays(360)); // exactly one year
    // 300ms, not 100ms: the panel slides in over a 0.2s CSS transition (`.panel`'s
    // `transition: transform 0.2s ease` in index.html) — 100ms wasn't enough to let it finish
    // sliding fully into view, so the screenshot below used to catch it mid-slide, still
    // partially off the right edge of the 800px viewport (Phase 7.1 review: caught while
    // checking every panel screenshot at 800×360 — the ledger row *values*, right-aligned near
    // the panel's own right edge, were rendering past x=800 and invisible in the screenshot,
    // while the labels near the left edge of the panel were still on-screen).
    await page.waitForTimeout(300);

    await expect(page.locator(".panel-title")).toHaveText("1848 Year in Review");
    await expect(page.locator(".yearly-report-headline")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-7-yearly-report.png" });
  });

  test("a loaded coal train at zoom 2 shows cars trailing distinctly behind the loco", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });
    await clearStrip(page, 60, 95, ROW_Y);
    const { stationAId, stationBId } = await buildLineWithStations(page, 70, 90, ROW_Y);

    await page.evaluate(
      ({ stationAId, stationBId, loco }) => {
        const g = window.__game!;
        const bought = g.buyTrain(stationAId, loco, ["coal", "coal", "coal", "coal"]);
        const state = g.getState() as {
          trains: Array<{
            cars: Array<{ loaded: boolean; loadedTile?: number; loadedTick?: number }>;
          }>;
          ticks: number;
        };
        const train = state.trains.find(
          (t) => (t as unknown as { id: number }).id === bought.trainId,
        )!;
        for (const car of train.cars) {
          car.loaded = true;
          car.loadedTile = 0;
          car.loadedTick = state.ticks;
        }
        g.setOrders(bought.trainId!, [
          { stationId: stationAId, rule: "passThrough" },
          { stationId: stationBId, rule: "passThrough" },
        ]);
      },
      { stationAId, stationBId, loco: LOCO },
    );
    await page.evaluate(() => window.__game!.runDays(2));

    const train = (await page.evaluate(() => window.__game!.getTrains()))[0]!;
    await centerOn(page, train.x, train.y, 2);
    await page.waitForTimeout(300);
    await page.screenshot({ path: "docs/screenshots/phase-7-coal-train-zoom2.png" });
  });

  test("a two-city passenger route shuttles passengers both ways", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });
    await clearStrip(page, 60, 95, ROW_Y);

    const { stationAId, stationBId } = await buildLineWithStations(
      page,
      70,
      82,
      ROW_Y,
      "station",
      "station",
    );
    await page.evaluate(
      ({ x0, x1, y }) => {
        const g = window.__game!;
        const map = g.getMap();
        const tilesFor = (originX: number): number[] => [
          originX + y * map.width,
          originX + 1 + y * map.width,
          originX + (y - 1) * map.width,
          originX + 1 + (y - 1) * map.width,
        ];
        g.debugPlaceCity(tilesFor(x0 - 2), 60_000);
        g.debugPlaceCity(tilesFor(x1 + 1), 60_000);
      },
      { x0: 70, x1: 82, y: ROW_Y },
    );

    const bought = await page.evaluate(
      ({ stationAId, loco }) =>
        window.__game!.buyTrain(stationAId, loco, [
          "passengers",
          "passengers",
          "passengers",
          "passengers",
        ]),
      { stationAId, loco: LOCO },
    );
    expect(bought.ok).toBe(true);
    await page.evaluate(
      ({ trainId, stationAId, stationBId }) =>
        window.__game!.setOrders(trainId!, [
          { stationId: stationAId, rule: "auto" },
          { stationId: stationBId, rule: "auto" },
        ]),
      { trainId: bought.trainId, stationAId, stationBId },
    );

    const cashBefore = await page.evaluate(() => window.__game!.getCash());
    await page.evaluate(() => window.__game!.runDays(20));
    const cashAfter = await page.evaluate(() => window.__game!.getCash());
    expect(cashAfter).toBeGreaterThan(cashBefore);

    const train = (await page.evaluate(() => window.__game!.getTrains()))[0]!;
    await centerOn(page, train.x, train.y, 1.5);
    await page.waitForTimeout(300);
    await page.screenshot({ path: "docs/screenshots/phase-7-passenger-train-zoom1.5.png" });
  });

  test("train panel shows the current load of each car", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });
    await clearStrip(page, 60, 90, ROW_Y);
    const { stationAId, stationBId } = await buildLineWithStations(page, 70, 80, ROW_Y);
    await page.evaluate(() => {
      const g = window.__game!;
      const map = g.getMap();
      g.debugPlaceIndustry(4 * map.width + 70, "coalMine");
      g.debugPlaceIndustry(4 * map.width + 80, "steelMill"); // so B accepts the coal (SPEC §6.3)
    });
    const bought = await page.evaluate(
      ({ stationAId, loco }) => window.__game!.buyTrain(stationAId, loco, ["coal", "coal"]),
      { stationAId, loco: LOCO },
    );
    await page.evaluate(
      ({ trainId, stationAId, stationBId }) =>
        window.__game!.setOrders(trainId!, [
          { stationId: stationAId, rule: "auto" },
          { stationId: stationBId, rule: "auto" },
        ]),
      { trainId: bought.trainId, stationAId, stationBId },
    );
    // The train cycles between fully empty (just after unloading at B) and carrying a load (on its
    // way there) — poll day by day instead of a single fixed sample so the check isn't sensitive
    // to exactly which phase of that cycle a fixed day count happens to land on.
    const sawLoaded = await page.evaluate(async (trainId) => {
      const g = window.__game!;
      for (let day = 0; day < 60; day++) {
        g.runDays(1);
        if (g.getTrainCars(trainId!).some((c) => c.loaded)) return true;
      }
      return false;
    }, bought.trainId);
    expect(sawLoaded).toBe(true);

    // Pause before locating/clicking the train — otherwise the real-time gap while centering the
    // camera and clicking (a couple hundred ms of wall-clock, ticking the sim at 1x) can carry a
    // fast-moving train just far enough past its snapshotted tile position to slip outside
    // findTrainAt's hit radius, an intermittent miss unrelated to what this test checks.
    await page.evaluate(() => window.__game!.setSpeed(0));
    await selectTool(page, "Info");
    const trainNow = (await page.evaluate(() => window.__game!.getTrains()))[0]!;
    await centerOn(page, trainNow.x, trainNow.y, 1.5);
    const p = await tileScreenPoint(page, trainNow.x, trainNow.y);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    await expect(page.locator(".chip", { hasText: "Coal" }).first()).toBeVisible();
  });
});
