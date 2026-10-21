import { expect, test } from "@playwright/test";
import "./gameWindow";
import { addTowns } from "./addTowns";

/** Phase 62: the "Where passengers go" sheet splits a town's trips by the size of the towns it can reach (Vienna draws
 * more than Graz), where the old per-destination 20 % cap made every big destination an equal share. */
test.use({ deviceScaleFactor: 2 });

test("Ljubljana sends more passengers to Vienna than to Graz", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1900 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  // One straight line: Vienna, Graz, Ljubljana, Trieste, Venice, a station in each (built in this order).
  const ids = await page.evaluate(() => {
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
    for (let x = 30; x < 60; x++) {
      const idx = y * map.width + x;
      m.terrain[idx] = 0;
      m.riverNext[idx] = -1;
      m.riverFlow[idx] = 0;
      m.industryId[idx] = -1;
      tiles.push(idx);
    }
    game.debugSetCash(5_000_000);
    if (!game.buildTrackPath(tiles).ok) throw new Error("track");
    for (const t of [tiles[0]!, tiles[7]!, tiles[15]!, tiles[22]!, tiles[29]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    game.camera.setZoom(1.2);
    game.camera.setCenter(45 * 32, (y + 0.5) * 32);
    return game.getStations().map((s) => s.id);
  });
  const names = ["Vienna", "Graz", "Ljubljana", "Trieste", "Venice"];
  const cityIds = await addTowns(page, ids, names, 20_000);
  await page.evaluate(
    ({ cityIds }) => {
      const state = window.__game!.getState() as unknown as {
        cities: Array<{ id: number; population: number }>;
      };
      const pop = [400_000, 60_000, 20_000, 80_000, 140_000];
      cityIds.forEach((id, i) => {
        (state.cities.find((c) => c.id === id) as { population: number }).population = pop[i]!;
      });
    },
    { cityIds },
  );
  await page.evaluate(
    ({ ids }) => {
      const game = window.__game!;
      const train = game.buyTrain(ids[0]!, "american-4-4-0", [
        "passengers",
        "passengers",
        "passengers",
      ]);
      if (!train.ok) throw new Error("buy " + train.reason);
      // Out to Vienna and Venice and back, calling everywhere on the way.
      const route = [2, 1, 0, 1, 2, 3, 4, 3].map((i) => ids[i]!);
      game.setOrders(
        train.trainId!,
        route.map((stationId) => ({ stationId, rule: "auto" as const })),
      );
    },
    { ids },
  );
  await page.evaluate(() => window.__game!.runDays(40));
  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids[2]!);
  await page.locator(".dest-link").click();
  const rows = page.locator(".dest-row");
  await expect(rows).toHaveCount(4);
  const share = async (name: string): Promise<number> => {
    const text = await rows.filter({ hasText: name }).locator(".dest-count").innerText();
    return Number(/(\d+) ?%/.exec(text)![1]);
  };
  expect(await share("Vienna")).toBeGreaterThan(await share("Graz"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/screenshots/phase-62-where-to.png" });
});
