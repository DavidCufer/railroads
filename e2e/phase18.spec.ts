import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phone-sized viewport (SPEC §10.1), matching earlier specs. */
const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;
const ROW_Y = 47; // flat plain row for seed 12345 (see e2e/stations.spec.ts)
const LOCO = "american-4-4-0";

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    }),
  );
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tileSize }) =>
      window.__game?.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize),
    { x, y, tileSize: TILE_SIZE },
  );
  await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
  await page.waitForTimeout(300);
}

async function selectTool(page: Page, name: "Track" | "Station" | "Info"): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
}

test.describe("Phase 18 — play-test 5", () => {
  test("A: a sharp join onto existing track is refused and drawn red", async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(
      ({ y }) => {
        const w = window.__game!.getMap().width;
        const row = Array.from({ length: 10 }, (_, i) => y * w + 71 + i);
        const first = window.__game!.buildTrackPath(row);
        // A second piece leaving the dead end at 90° — the "hairpin in three parts" trick.
        const corner = window.__game!.buildTrackPath([
          y * w + 80,
          (y - 1) * w + 80,
          (y - 2) * w + 80,
        ]);
        // A legal 45° branch still works.
        const branch = window.__game!.buildTrackPath([
          y * w + 75,
          (y - 1) * w + 76,
          (y - 2) * w + 77,
        ]);
        return { first, corner, branch };
      },
      { y: ROW_Y },
    );
    expect(result.first.ok).toBe(true);
    expect(result.corner).toEqual({ ok: false, reason: "sharpTurn" });
    expect(result.branch.ok).toBe(true);
    await selectTool(page, "Track");
    await centerOn(page, 78, ROW_Y - 1, 2);
    await page.evaluate(
      ({ y }) => {
        const w = window.__game!.getMap().width;
        window.__game!.debugPreviewBuild([y * w + 80, (y - 1) * w + 80, (y - 2) * w + 80]);
      },
      { y: ROW_Y },
    );
    await expect(page.locator(".toast")).toContainText("Too sharp");
    await page.waitForTimeout(150);
    await page.screenshot({ path: "docs/screenshots/phase-18-sharp-turn-rejected.png" });
  });

  test("B: a train waiting for a platform says what it waits for", async ({ page }) => {
    await setup(page);
    const ids = await page.evaluate(
      ({ y, loco }) => {
        const g = window.__game!;
        const w = g.getMap().width;
        const row = Array.from({ length: 20 }, (_, i) => y * w + 71 + i);
        if (!g.buildTrackPath(row).ok) throw new Error("track");
        g.buildStation(y * w + 71, "depot");
        g.buildStation(y * w + 90, "depot");
        const [a, b] = g.getStations();
        const trains: number[] = [];
        for (let i = 0; i < 3; i++) {
          const bought = g.buyTrain(a!.id, loco, []);
          if (!bought.ok) throw new Error(`buy ${bought.reason}`);
          trains.push(bought.trainId!);
          g.setOrders(bought.trainId!, [
            { stationId: a!.id, rule: "passThrough" },
            { stationId: b!.id, rule: "passThrough" },
          ]);
        }
        return { trains, a: a!.id };
      },
      { y: ROW_Y, loco: LOCO },
    );
    await page.evaluate(() => window.__game!.runDays(1));
    const waiting = await page.evaluate(() =>
      window.__game!.getTrains().find((t) => t.status === "waitingForStation"),
    );
    expect(waiting, "a train waits for the far depot's second slot").toBeDefined();
    // Open that train's panel from the station's train list.
    await selectTool(page, "Info");
    await centerOn(page, 74, ROW_Y, 1.5);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
    await page.waitForTimeout(300);
    await page.locator(".train-loco-btn", { hasText: waiting!.name }).click();
    await page.waitForTimeout(300);
    await expect(page.locator(".panel")).toContainText("Waiting for platform at");
    await expect(page.locator(".panel")).toContainText("Train");
    await page.screenshot({ path: "docs/screenshots/phase-18-train-waiting.png" });
    expect(ids.trains).toHaveLength(3);
  });

  test("D: the industry panel lists inputs with the nearest source, tap to centre", async ({
    page,
  }) => {
    await setup(page);
    const factory = await page.evaluate(() =>
      window.__game!.getIndustries().find((i) => i.type === "factory"),
    );
    expect(factory, "every generated map has a Factory").toBeDefined();
    await selectTool(page, "Info");
    await centerOn(page, factory!.x, factory!.y, 2);
    const p = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), factory!);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    await expect(page.locator(".panel-title")).toHaveText("Factory");
    await expect(page.locator(".industry-recipe")).toContainText(
      "Makes Goods from Steel or Lumber",
    );
    const rows = page.locator("button.industry-source");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("tile");
    await page.locator(".panel-body").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(100);
    await page.screenshot({ path: "docs/screenshots/phase-18-industry-panel.png" });
    const before = await page.evaluate(() => window.__game!.camera.getCenter());
    await rows.first().click();
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__game!.camera.getCenter());
    expect(after.x !== before.x || after.y !== before.y).toBe(true);
  });

  test("C: coal relays A → warehouse hub → B and pays once, at B", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => window.__game!.setSpeed(0)); // only runDays advances time
    const setupResult = await page.evaluate(
      ({ y, loco }) => {
        const g = window.__game!;
        const w = g.getMap().width;
        const row = Array.from({ length: 20 }, (_, i) => y * w + 71 + i);
        if (!g.buildTrackPath(row).ok) throw new Error("track");
        g.debugPlaceIndustry((y - 1) * w + 71, "coalMine");
        g.debugPlaceIndustry((y - 1) * w + 90, "steelMill");
        g.buildStation(y * w + 71, "depot"); // A: coal mine catchment
        g.buildStation(y * w + 80, "depot"); // hub
        g.buildStation(y * w + 90, "depot"); // B: steel mill catchment
        const [a, hub, b] = g.getStations();
        const wh = g.buildImprovement(hub!.id, "warehouse");
        if (!wh.ok) throw new Error(`warehouse ${wh.reason}`);
        const feeder = g.buyTrain(a!.id, loco, ["coal", "coal"]);
        const carrier = g.buyTrain(a!.id, loco, ["coal", "coal"]);
        if (!feeder.ok || !carrier.ok) throw new Error("buy");
        g.setOrders(feeder.trainId!, [
          { stationId: a!.id, rule: "auto" },
          { stationId: hub!.id, rule: "transfer" },
        ]);
        g.setOrders(carrier.trainId!, [
          { stationId: hub!.id, rule: "auto" },
          { stationId: b!.id, rule: "auto" },
        ]);
        return {
          a: a!.id,
          hub: hub!.id,
          b: b!.id,
          feeder: feeder.trainId!,
          carrier: carrier.trainId!,
        };
      },
      { y: ROW_Y, loco: LOCO },
    );

    let sawStock = false;
    let screenshotDone = false;
    for (let i = 0; i < 60 && !sawStock; i++) {
      await page.evaluate(() => window.__game!.runDays(3));
      const stock = await page.evaluate(
        (id) => window.__game!.getStationTransfer(id),
        setupResult.hub,
      );
      if (stock.length > 0) {
        sawStock = true;
        expect(stock[0]!.cargoType).toBe("coal");
        expect(stock[0]!.originStationId).toBe(setupResult.a);
        await selectTool(page, "Info");
        await centerOn(page, 79, ROW_Y, 1.5);
        await page.evaluate((id) => window.__game!.debugOpenStation(id), setupResult.hub);
        await page.waitForTimeout(300);
        await expect(page.locator(".panel")).toContainText("Waiting for transfer");
        await expect(page.locator(".panel")).toContainText("coal from");
        await page.locator(".panel-body").evaluate((el) => (el.scrollTop = 0));
        await page.screenshot({ path: "docs/screenshots/phase-18-warehouse-transfer.png" });
        screenshotDone = true;
      }
    }
    expect(sawStock, "coal reached the hub's transfer stock").toBe(true);
    expect(screenshotDone).toBe(true);

    // Keep running until the carrier has delivered at B.
    const revenue = async () =>
      page.evaluate(({ feeder, carrier }) => {
        const trains = (
          window.__game!.getState() as { trains: Array<{ id: number; lifetimeRevenue: number }> }
        ).trains;
        return {
          feeder: trains.find((t) => t.id === feeder)!.lifetimeRevenue,
          carrier: trains.find((t) => t.id === carrier)!.lifetimeRevenue,
        };
      }, setupResult);
    let r = await revenue();
    for (let i = 0; i < 60 && r.carrier <= 0; i++) {
      await page.evaluate(() => window.__game!.runDays(3));
      r = await revenue();
    }
    expect(r.carrier).toBeGreaterThan(0);
    expect(r.feeder).toBe(0);
  });
});
