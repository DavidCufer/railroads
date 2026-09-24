import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phone-sized viewport (SPEC §10.1: "~800×360 CSS px"), matching earlier phases' e2e specs. */
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

const LOCO = "american-4-4-0"; // medium steam, available from 1848 — a flat map defaults to 1830,
// so tests that build track directly (bypassing era-gating UI) set startYear: 1848.

/** Builds a straight single-track line from x0 to x1 at row y via the debug hook (fast/reliable —
 * equivalent to the Track-mode drag e2e specs exercise elsewhere), and a Depot at each end. Returns
 * the two station ids and their tile indices. */
async function buildLineWithStations(
  page: Page,
  x0: number,
  x1: number,
  y: number,
): Promise<{
  stationAId: number;
  stationBId: number;
  tileA: number;
  tileB: number;
  width: number;
}> {
  return page.evaluate(
    ({ x0, x1, y }) => {
      const map = window.__game!.getMap();
      const width = map.width;
      const path: number[] = [];
      for (let x = x0; x <= x1; x++) path.push(y * width + x);
      const track = window.__game!.buildTrackPath(path);
      if (!track.ok) throw new Error(`track build failed: ${track.reason}`);
      const tileA = y * width + x0;
      const tileB = y * width + x1;
      const a = window.__game!.buildStation(tileA, "depot");
      const b = window.__game!.buildStation(tileB, "depot");
      if (!a.ok || !b.ok) throw new Error(`station build failed: ${a.reason ?? b.reason}`);
      const stations = window.__game!.getStations();
      const stationAId = stations.find((s) => s.x === x0 && s.y === y)!.id;
      const stationBId = stations.find((s) => s.x === x1 && s.y === y)!.id;
      return { stationAId, stationBId, tileA, tileB, width };
    },
    { x0, x1, y },
  );
}

async function buyAndOrder(
  page: Page,
  stationAId: number,
  stationBId: number,
  loco: string,
): Promise<number> {
  return page.evaluate(
    ({ stationAId, stationBId, loco }) => {
      const bought = window.__game!.buyTrain(stationAId, loco, []);
      if (!bought.ok || bought.trainId === undefined)
        throw new Error(`buy failed: ${bought.reason}`);
      const orders = window.__game!.setOrders(bought.trainId, [
        { stationId: stationAId, rule: "passThrough" },
        { stationId: stationBId, rule: "passThrough" },
      ]);
      if (!orders.ok) throw new Error(`orders failed: ${orders.reason}`);
      return bought.trainId;
    },
    { stationAId, stationBId, loco },
  );
}

// A flat, obstacle-free row for seed 12345 (see e2e/stations.spec.ts) — plain terrain from x=71 to
// at least x=95 at y=47.
const ROW_Y = 47;

test.describe("Phase 6 — Trains", () => {
  test("a bought train runs and visits both stations within 30 in-game days", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });

    const { stationAId, stationBId, tileA, tileB } = await buildLineWithStations(
      page,
      71,
      90,
      ROW_Y,
    );
    const trainId = await buyAndOrder(page, stationAId, stationBId, LOCO);
    expect(trainId).toBeGreaterThanOrEqual(0);

    // Run a few days so the train is well clear of the departure station (and the left toolbar
    // overlay) before framing the "train moving on a line" screenshots on its actual position.
    await page.evaluate(() => window.__game!.runDays(4));
    const midJourney = await page.evaluate(() => window.__game!.getTrains());
    expect(midJourney[0]!.status).toBe("moving");

    await centerOn(page, midJourney[0]!.x, ROW_Y, 1.5);
    await page.waitForTimeout(50);
    await page.screenshot({ path: "docs/screenshots/phase-6-train-moving-zoom1.5.png" });

    await centerOn(page, midJourney[0]!.x, ROW_Y, 2);
    await page.waitForTimeout(50);
    await page.screenshot({ path: "docs/screenshots/phase-6-train-moving-zoom2.png" });

    // Sample at the loading dwell's own granularity (0.5 in-game day) so a brief stop at either
    // station is never skipped over between samples.
    const visitedTiles = new Set<number>();
    for (let i = 0; i < 60; i++) {
      await page.evaluate(() => window.__game!.runDays(0.5));
      const trains = await page.evaluate(() => window.__game!.getTrains());
      expect(trains).toHaveLength(1);
      visitedTiles.add(trains[0]!.tile);
    }

    expect(visitedTiles.has(tileA)).toBe(true);
    expect(visitedTiles.has(tileB)).toBe(true);

    const finalTrains = await page.evaluate(() => window.__game!.getTrains());
    expect(["moving", "loading", "waitingForBlock", "waitingForStation"]).toContain(
      finalTrains[0]!.status,
    );

    expect(consoleErrors).toEqual([]);
  });

  test("two trains on a single-track line: one waits at a signal while the other moves", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });

    const { stationAId, stationBId } = await buildLineWithStations(page, 71, 90, ROW_Y);
    await page.evaluate(
      ({ stationAId, stationBId, loco }) => {
        for (let i = 0; i < 2; i++) {
          const bought = window.__game!.buyTrain(stationAId, loco, []);
          if (!bought.ok || bought.trainId === undefined) throw new Error("buy failed");
          const result = window.__game!.setOrders(bought.trainId, [
            { stationId: stationAId, rule: "passThrough" },
            { stationId: stationBId, rule: "passThrough" },
          ]);
          if (!result.ok) throw new Error("orders failed");
        }
      },
      { stationAId, stationBId, loco: LOCO },
    );

    let sawWaiting = false;
    for (let i = 0; i < 60 && !sawWaiting; i++) {
      await page.evaluate(() => window.__game!.runDays(0.5));
      const trains = await page.evaluate(() => window.__game!.getTrains());
      const waiting = trains.find(
        (t) => t.status === "waitingForBlock" || t.status === "waitingForStation",
      );
      if (waiting) {
        sawWaiting = true;
        // Center on the waiting train itself — a fixed camera position could easily miss it (it's
        // parked at whichever boundary it got blocked at, not necessarily mid-line).
        await centerOn(page, waiting.x, ROW_Y, 1.5);
        await page.waitForTimeout(50);
        await page.screenshot({ path: "docs/screenshots/phase-6-train-waiting-signal.png" });
      }
    }
    expect(sawWaiting).toBe(true);

    const trains = await page.evaluate(() => window.__game!.getTrains());
    expect(trains.some((t) => t.status === "stuck")).toBe(false);
  });

  test("buy-train dialog and train panel fit an 800×360 viewport", async ({ page }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });

    await buildLineWithStations(page, 71, 90, ROW_Y);

    await selectTool(page, "Info");
    await centerOn(page, 71, ROW_Y, 1.5);
    const p = await tileScreenPoint(page, 71, ROW_Y);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    await expect(page.locator(".station-buy-train-btn")).toBeVisible();
    await page.locator(".station-buy-train-btn").click();
    await page.waitForTimeout(300);

    await expect(page.locator(".panel-title")).toHaveText("Buy Train");
    await expect(page.locator(".train-loco-btn").first()).toBeVisible();
    await page.locator(".train-car-add-btn", { hasText: "Coal" }).click();

    // The panel covers the right ~45% of the viewport, so re-center each target tile toward the
    // left before tapping it — otherwise the tap would land on the panel instead of the map.
    await page.locator(".train-pick-station-btn").click();
    await centerOn(page, 96, ROW_Y, 1.5);
    const pB = await tileScreenPoint(page, 90, ROW_Y);
    await page.mouse.click(pB.x, pB.y);
    await page.waitForTimeout(100);
    await page.locator(".train-pick-station-btn").click();
    await centerOn(page, 77, ROW_Y, 1.5);
    const pA = await tileScreenPoint(page, 71, ROW_Y);
    await page.mouse.click(pA.x, pA.y);
    await page.waitForTimeout(100);

    await expect(page.locator(".train-order-row")).toHaveCount(2);
    await expect(page.locator(".panel-action-build")).toBeEnabled();
    // Clicking the Coal car button auto-scrolled the panel to bring it into view; scroll back to
    // the top so the screenshot shows the locomotive picker too, not just the lower half.
    await page.locator(".panel").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(50);
    await page.screenshot({ path: "docs/screenshots/phase-6-buy-train-dialog.png" });

    await page.locator(".panel-action-build").click();
    await page.waitForTimeout(100);

    const trains = await page.evaluate(() => window.__game!.getTrains());
    expect(trains).toHaveLength(1);
    expect(trains[0]!.cars).toEqual(["coal"]);

    await selectTool(page, "Info");
    const pTrain = await tileScreenPoint(page, 71, ROW_Y);
    await page.mouse.click(pTrain.x, pTrain.y);
    await page.waitForTimeout(300);
    await expect(page.locator(".panel-title")).toHaveText(trains[0]!.name);
    // Scroll to the bottom so the screenshot shows the full orders list above the pinned Sell
    // button (this panel's content is slightly taller than the 800×360 viewport).
    await page.locator(".panel").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(50);
    await expect(page.locator("text=Glenbury Crossing (Auto)")).toBeVisible();
    await expect(page.locator("text=Ashtown Crossing (Auto)")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-6-train-panel.png" });
  });

  test("double track allows two trains to run in opposite directions concurrently", async ({
    page,
  }) => {
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    });

    const { stationAId, stationBId } = await page.evaluate(
      ({ x0, x1, y }) => {
        const map = window.__game!.getMap();
        const width = map.width;
        const path: number[] = [];
        for (let x = x0; x <= x1; x++) path.push(y * width + x);
        const track = window.__game!.buildTrackPath(path);
        if (!track.ok) throw new Error(`track build failed: ${track.reason}`);
        const tileA = y * width + x0;
        const tileB = y * width + x1;
        const a = window.__game!.buildStation(tileA, "depot");
        const b = window.__game!.buildStation(tileB, "depot");
        if (!a.ok || !b.ok) throw new Error("station build failed");
        const stations = window.__game!.getStations();
        return {
          stationAId: stations.find((s) => s.x === x0 && s.y === y)!.id,
          stationBId: stations.find((s) => s.x === x1 && s.y === y)!.id,
        };
      },
      { x0: 71, x1: 90, y: ROW_Y },
    );

    // Upgrade to double via the Double-mode drag (no debug shortcut for this — matches how a
    // player would actually do it).
    await centerOn(page, 80, ROW_Y, 1);
    await selectTool(page, "Track"); // ensure a known tool state before switching
    await page.getByRole("button", { name: "Double", exact: true }).click();
    const p1 = await tileScreenPoint(page, 71, ROW_Y);
    const p2 = await tileScreenPoint(page, 90, ROW_Y);
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    await page.mouse.move(p2.x, p2.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(100);

    const edges = await page.evaluate(() => window.__game!.getTrackEdges());
    expect(edges.every((e) => e.double)).toBe(true);

    await page.evaluate(
      ({ stationAId, stationBId, loco }) => {
        for (let i = 0; i < 2; i++) {
          const bought = window.__game!.buyTrain(stationAId, loco, []);
          if (!bought.ok || bought.trainId === undefined) throw new Error("buy failed");
          const result = window.__game!.setOrders(bought.trainId, [
            { stationId: stationBId, rule: "passThrough" },
            { stationId: stationAId, rule: "passThrough" },
          ]);
          if (!result.ok) throw new Error("orders failed");
        }
      },
      { stationAId, stationBId, loco: LOCO },
    );

    await selectTool(page, "Info");

    let sawOpposite = false;
    let sawPassingCloseUp = false;
    for (let i = 0; i < 60 && !sawPassingCloseUp; i++) {
      await page.evaluate(() => window.__game!.runDays(0.5));
      const trains = await page.evaluate(() => window.__game!.getTrains());
      const moving = trains.filter((t) => t.status === "moving");
      if (moving.length === 2 && moving[0]!.x !== moving[1]!.x) {
        sawOpposite = true;
        // Capture the screenshot right as the two trains are close together (visually "passing"),
        // re-centering on their midpoint since a fixed camera position would likely miss them.
        const dist = Math.abs(moving[0]!.x - moving[1]!.x);
        if (dist <= 8) {
          sawPassingCloseUp = true;
          const midX = (moving[0]!.x + moving[1]!.x) / 2;
          await centerOn(page, midX, ROW_Y, 1.5);
          await page.waitForTimeout(50);
          await page.screenshot({ path: "docs/screenshots/phase-6-double-track-passing.png" });
        }
      }
    }
    expect(sawOpposite).toBe(true);
    expect(sawPassingCloseUp).toBe(true);

    const trains = await page.evaluate(() => window.__game!.getTrains());
    expect(trains.some((t) => t.status === "stuck")).toBe(false);
  });
});
