import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 53: towns are demand-bound and passengers pay by distance. Two big towns joined by a line with a few Norris
 * trains: after a few months the platforms hold about a train-load or two, not a crowd, and the trains earn. */
test.use({ deviceScaleFactor: 2 });

test("a station after a few months: small crowds, and a paying line", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1842 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  const a = await page.evaluate(() => {
    const game = window.__game!;
    const map = game.getMap();
    const m = map as unknown as {
      terrain: Uint8Array;
      riverNext: Int32Array;
      riverFlow: Uint16Array;
      industryId: Int32Array;
      cityId: Int32Array;
    };
    const y = Math.floor(map.height / 2);
    const x0 = 30;
    const x1 = 70;
    const tiles: number[] = [];
    for (let x = x0 - 3; x <= x1 + 4; x++)
      for (let yy = y - 2; yy <= y + 2; yy++) {
        const idx = yy * map.width + x;
        m.terrain[idx] = 0;
        m.riverNext[idx] = -1;
        m.riverFlow[idx] = 0;
        m.industryId[idx] = -1;
        m.cityId[idx] = -1;
      }
    for (let x = x0; x <= x1; x++) tiles.push(y * map.width + x);
    const block = (ox: number): number[] => [
      y * map.width + ox,
      y * map.width + ox + 1,
      (y - 1) * map.width + ox,
      (y - 1) * map.width + ox + 1,
    ];
    game.debugPlaceCity(block(x0 - 3), 90_000);
    game.debugPlaceCity(block(x1 + 3), 60_000);
    game.debugSetCash(5_000_000);
    if (!game.buildTrackPath(tiles).ok) throw new Error("track");
    for (const t of [tiles[0]!, tiles[tiles.length - 1]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    const [sa, sb] = game.getStations().map((s) => s.id);
    for (let i = 0; i < 2; i++) {
      const bought = game.buyTrain(sa!, "norris-4-2-0", Array(5).fill("passengers") as string[]);
      if (!bought.ok) throw new Error(`buy ${bought.reason}`);
      game.setOrders(
        bought.trainId!,
        (i === 0 ? [sa!, sb!] : [sb!, sa!]).map((stationId) => ({
          stationId,
          rule: "auto" as const,
        })),
      );
    }
    return sa!;
  });
  await page.evaluate(() => window.__game!.runDays(120));

  // Nobody waits more than a couple of train-loads (2 x 5 cars x 40), and the line has taken money.
  const waiting = await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationCargo: Map<number, { passengers?: { amount: number } }>;
      cash: number;
    };
    return { people: state.stationCargo.get(id)?.passengers?.amount ?? 0, cash: state.cash };
  }, a);
  expect(waiting.people).toBeLessThan(2 * 200);
  expect(waiting.cash).toBeGreaterThan(0);

  await page.evaluate((id) => window.__game!.debugOpenStation(id), a);
  await expect(page.locator('[data-testid="waiting-split"]')).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/phase-53-station.png" });
});
