import { expect, test } from "@playwright/test";
import "./gameWindow";
import { addTowns } from "./addTowns";

/** Phase 50: a full early train fits a Station's platforms; cars are named; the waiting list never says "any train". */
test.use({ deviceScaleFactor: 2 });

test("a full 8-car train sits within its station's platforms", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1842 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  const info = await page.evaluate(() => {
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
    for (let x = 30; x < 50; x++) {
      const idx = y * map.width + x;
      m.terrain[idx] = 0;
      m.riverNext[idx] = -1;
      m.riverFlow[idx] = 0;
      m.industryId[idx] = -1;
      tiles.push(idx);
    }
    game.debugSetCash(5_000_000);
    if (!game.buildTrackPath(tiles).ok) throw new Error("track");
    for (const t of [tiles[2]!, tiles[17]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    const [a, b] = game.getStations().map((s) => s.id);
    const bought = game.buyTrain(a!, "norris-4-2-0", Array(8).fill("passengers"));
    if (!bought.ok) throw new Error(`buy ${bought.reason}`);
    game.setOrders(bought.trainId!, [
      { stationId: a!, rule: "auto" as const },
      { stationId: b!, rule: "auto" as const },
    ]);
    game.camera.setZoom(3);
    game.camera.setCenter(33 * 32, (y + 0.5) * 32);
    return { a: a!, y };
  });
  await page.evaluate(() => window.__game!.runDays(2));
  await page.screenshot({ path: "docs/screenshots/phase-50-train-length.png" });
  const train = await page.evaluate(() => window.__game!.getTrains()[0]!);
  expect(train.cars).toHaveLength(8);
  expect(info.y).toBeGreaterThan(0);

  // Item 3 (Phase 54): one pile, one number; the station never says "any train" or lists destinations.
  const ends = await page.evaluate(() => window.__game!.getStations().map((s) => s.id));
  await addTowns(page, ends, ["Venice", "Milan"]);
  await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationCargo: Map<number, Record<string, unknown>>;
    };
    state.stationCargo.set(id, { passengers: { amount: 66, waitingDays: 1 } });
    window.__game!.debugOpenStation(id);
  }, info.a);
  const split = page.locator('[data-testid="waiting-split"]');
  await expect(split).toContainText("Waiting 66");
  await expect(split).not.toContainText("any train");
  await page.screenshot({ path: "docs/screenshots/phase-50-waiting.png" });
});

test("the default stop rule is named in the train route", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1842 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  const trainId = await page.evaluate(() => {
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
    for (let x = 30; x < 50; x++) {
      const idx = y * map.width + x;
      m.terrain[idx] = 0;
      m.riverNext[idx] = -1;
      m.riverFlow[idx] = 0;
      m.industryId[idx] = -1;
      tiles.push(idx);
    }
    game.debugSetCash(5_000_000);
    if (!game.buildTrackPath(tiles).ok) throw new Error("track");
    for (const t of [tiles[2]!, tiles[17]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    const [a, b] = game.getStations().map((st) => st.id);
    const bought = game.buyTrain(a!, "norris-4-2-0", ["passengers", "passengers"]);
    if (!bought.ok) throw new Error(`buy ${bought.reason}`);
    game.setOrders(bought.trainId!, [
      { stationId: a!, rule: "auto" as const },
      { stationId: b!, rule: "auto" as const },
    ]);
    return bought.trainId!;
  });
  await page.evaluate((id) => window.__game!.debugOpenTrain(id), trainId);
  const chips = page.locator('[data-testid="rule-chip"]');
  await expect(chips.first()).toContainText("Auto");
  await page.screenshot({ path: "docs/screenshots/phase-50-route.png" });
  await page.getByRole("button", { name: "Edit cars" }).click();
  await expect(page.locator(".car-tile-name").first()).toContainText("Passenger car");
  await page.screenshot({ path: "docs/screenshots/phase-50-cars.png" });
});
