import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 53B: a real central-eu line (Venice-Milan on the generated map, no debug patch), three Norris trains, four
 * months in 1842: Venice's platform shows who waits for which stop, and what each costs in a change. */
test.use({ deviceScaleFactor: 2 });

test("Venice station after four months on the real map", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1842 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  const venice = await page.evaluate(() => {
    const game = window.__game!;
    const cities = (
      game.getState() as { cities: Array<{ name: string; anchorX: number; anchorY: number }> }
    ).cities;
    const centre = (name: string): number => {
      const c = cities.find((x) => x.name === name)!;
      return c.anchorY * game.getMap().width + c.anchorX;
    };
    const tiles = game.findBuildPath(centre("Venice"), centre("Milan"));
    if (!tiles) throw new Error("no path");
    game.debugSetCash(5_000_000);
    if (!game.buildTrackPath(tiles).ok) throw new Error("track");
    for (const t of [tiles[0]!, tiles[tiles.length - 1]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    const [sa, sb] = game.getStations().map((s) => s.id);
    for (let i = 0; i < 3; i++) {
      const bought = game.buyTrain(sa!, "norris-4-2-0", Array(5).fill("passengers") as string[]);
      if (!bought.ok) throw new Error(`buy ${bought.reason}`);
      game.setOrders(
        bought.trainId!,
        [sa!, sb!].map((stationId) => ({ stationId, rule: "auto" as const })),
      );
    }
    const w = game.getMap().width;
    game.camera.setZoom(2);
    game.camera.setCenter(((tiles[0]! % w) + 0.5) * 32, (Math.floor(tiles[0]! / w) + 0.5) * 32);
    return sa!;
  });
  await page.evaluate(() => window.__game!.runDays(120));

  const waiting = await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationCargo: Map<number, { passengers?: { amount: number } }>;
    };
    return state.stationCargo.get(id)?.passengers?.amount ?? 0;
  }, venice);
  expect(waiting).toBeGreaterThan(0);
  await page.evaluate((id) => window.__game!.debugOpenStation(id), venice);
  await expect(page.locator('[data-testid="waiting-split"]')).toContainText(/\d+/);
  await page.screenshot({ path: "docs/screenshots/phase-53b-station.png" });
});
