import { expect, test } from "@playwright/test";
import "./gameWindow";
import { addTowns } from "./addTowns";

/** Phase 43/54: load and waiting made visible — "load N %" in the train list, the waiting line and the towns reached at a
 * station, the destinations sheet rows ("N/mo · share") and the over-served hint in Lines. */
test.use({ deviceScaleFactor: 2 });

type Page = import("@playwright/test").Page;

async function overservedLine(page: Page): Promise<{ a: number; b: number; c: number }> {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1842 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
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
    if (!game.buildStation(tiles[0]!, "station").ok) throw new Error("station a");
    if (!game.buildStation(tiles[19]!, "station").ok) throw new Error("station b");
    const [sa, sb] = game.getStations();
    for (let i = 0; i < 4; i++) {
      const bought = game.buyTrain(sa!.id, "norris-4-2-0", [
        "passengers",
        "passengers",
        "passengers",
      ]);
      if (!bought.ok) throw new Error(`buy ${bought.reason}`);
      game.setOrders(bought.trainId!, [
        { stationId: sa!.id, rule: "auto" },
        { stationId: sb!.id, rule: "auto" },
      ]);
    }
    if (!game.buildStation(tiles[9]!, "station").ok) throw new Error("station c");
    const mid = game.getStations().find((s) => s.id !== sa!.id && s.id !== sb!.id)!;
    return { a: sa!.id, b: sb!.id, c: mid.id };
  });
}

test("train list shows load, station shows who waits and where trains reach, Lines says when trains are surplus", async ({
  page,
}) => {
  const ids = await overservedLine(page);
  await page.evaluate(() => window.__game!.runDays(120));
  // A town at each station (the bare patch has none) and a pile of 58 passengers waiting at the first (Phase 54: one pile).
  await addTowns(page, [ids.a, ids.b], ["Venice", "Milan"]);
  await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationCargo: Map<number, { passengers?: { amount: number; waitingDays: number } }>;
    };
    const entry = state.stationCargo.get(id.a) ?? {};
    entry.passengers = { amount: 58, waitingDays: 1 };
    state.stationCargo.set(id.a, entry);
  }, ids);

  await page.locator(".train-list-button").click();
  await expect(page.locator('[data-testid="train-load"]').first()).toContainText(/load \d+ %/);
  await page.screenshot({ path: "docs/screenshots/phase-43-train-list.png" });

  await page.locator('[data-testid="list-sort-lines"]').click();
  await expect(page.locator('[data-testid="line-overserved"]')).toContainText(
    /would carry this demand/,
  );
  await page.screenshot({ path: "docs/screenshots/phase-43-lines-hint.png" });

  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
  await expect(page.locator('[data-testid="waiting-split"]')).toContainText(/Waiting \d+/);
  await expect(page.locator('[data-testid="waiting-split"]')).toContainText(
    "Trains here reach: Milan",
  );
  await page.screenshot({ path: "docs/screenshots/phase-43-station-split.png" });

  await page.locator(".dest-link").click();
  await expect(page.locator(".dest-count").first()).toContainText("/mo");
  await page.screenshot({ path: "docs/screenshots/phase-43-destinations.png" });
});
