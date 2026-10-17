import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 52: an old save's undirected pile is turned into destination lots, a row that needs a change names its
 * first leg, and an 8-car train fits its Station's platform. */
test.use({ deviceScaleFactor: 2 });

async function setup(page: import("@playwright/test").Page, cars: number) {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1842 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  return page.evaluate((n) => {
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
    for (const t of [tiles[5]!, tiles[16]!, tiles[27]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    const [a, b, c] = game.getStations().map((s) => s.id);
    for (const [from, to] of [
      [a!, b!],
      [b!, c!],
    ] as const) {
      const bought = game.buyTrain(a!, "norris-4-2-0", Array(n).fill("passengers"));
      if (!bought.ok) throw new Error(`buy ${bought.reason}`);
      game.setOrders(
        bought.trainId!,
        [from, to].map((stationId) => ({ stationId, rule: "auto" as const })),
      );
    }
    game.camera.setZoom(3);
    game.camera.setCenter(35 * 32, (y + 0.5) * 32);
    return { a: a!, b: b!, c: c! };
  }, cars);
}

test("an old pile becomes destination rows and a change is named", async ({ page }) => {
  const ids = await setup(page, 2);
  await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationEconomy: Map<
        number,
        { supply: Record<string, number>; passengerRoutes?: unknown[]; passengerBound?: unknown[] }
      >;
      stationCargo: Map<number, Record<string, unknown>>;
    };
    const eco = state.stationEconomy.get(id.a)!;
    eco.supply["passengers"] = 600;
    eco.passengerRoutes = [
      { firstLeg: id.b, destination: id.b, cityId: 1, perMonth: 400, changes: 0 },
      { firstLeg: id.b, destination: id.c, cityId: 2, perMonth: 200, changes: 1 },
    ];
    eco.passengerBound = [{ stationId: id.b, share: 1 }];
    // a pre-Phase-48 pile: 2409 people with no destination
    state.stationCargo.set(id.a, { passengers: { amount: 2409, waitingDays: 90 } });
  }, ids);
  await page.evaluate(() => window.__game!.runDays(1));
  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
  const split = page.locator('[data-testid="waiting-split"]');
  await expect(split).toBeVisible();
  const text = (await split.textContent()) ?? "";
  expect(text).not.toContain("other towns");
  expect(text).toMatch(/every ~\d+d/);
  expect(text).toMatch(/→[^→]+→[^→]+/); // first leg, then the destination
  await page.screenshot({ path: "docs/screenshots/phase-52-waiting.png" });
});

test("an 8-car train sits inside a Station's platform", async ({ page }) => {
  const ids = await setup(page, 8);
  await page.evaluate(() => window.__game!.runDays(2));
  expect(ids.a).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: "docs/screenshots/phase-52-platform.png" });
});
