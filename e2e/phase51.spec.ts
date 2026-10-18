import { expect, test } from "@playwright/test";
import "./gameWindow";
import { addTowns } from "./addTowns";

/** Phase 51: people wait only for the next train. A destination's pile holds the demand of the days until the next
 * train that carries them, and the waiting row says how many days that is. */
test.use({ deviceScaleFactor: 2 });

test("a waiting pile is cut to a month of demand, and the station says when the next train comes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1842 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
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
    for (const t of [tiles[0]!, tiles[19]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    const [a, b] = game.getStations().map((s) => s.id);
    // Four trains on one line: a train every quarter of the round trip.
    for (let i = 0; i < 4; i++) {
      const bought = game.buyTrain(a!, "norris-4-2-0", ["passengers", "passengers"]);
      if (!bought.ok) throw new Error(`buy ${bought.reason}`);
      game.setOrders(
        bought.trainId!,
        [a!, b!].map((stationId) => ({ stationId, rule: "auto" as const })),
      );
    }
    return { a: a!, b: b! };
  });

  // The bare test patch has no towns to draw demand, so a town at each end is added and a month-old pile set by hand
  // (the sim path is covered by tests/sim/stations/waitingForNextTrain.test.ts).
  await addTowns(page, [ids.a, ids.b], ["Venice", "Milan"]);
  await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationCargo: Map<number, Record<string, unknown>>;
    };
    state.stationCargo.set(id.a, { passengers: { amount: 300, waitingDays: 1 } });
  }, ids);
  await page.evaluate(() => window.__game!.runDays(1));

  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
  const split = page.locator('[data-testid="waiting-split"]');
  await expect(split).toContainText(/next train ~\d+d/);
  const text = (await split.textContent()) ?? "";
  const days = Number(/next train ~(\d+)d/.exec(text)![1]);
  const { waiting, pool } = await page.evaluate((id) => {
    const state = window.__game!.getState() as unknown as {
      stationCargo: Map<number, { passengers?: { amount: number } }>;
      stationEconomy: Map<number, { passengerPool?: number }>;
    };
    return {
      waiting: state.stationCargo.get(id.a)?.passengers?.amount ?? 0,
      pool: state.stationEconomy.get(id.a)?.passengerPool ?? 0,
    };
  }, ids);
  // A pile holds at most MAX_WAIT_DAYS (30) of the station's demand (a month), never the 300 set by hand; and the line
  // says when the next train comes, a whole number of days.
  expect(pool).toBeGreaterThan(0);
  expect(pool).toBeLessThan(300);
  expect(waiting).toBeGreaterThan(0);
  expect(waiting).toBeLessThanOrEqual(pool + 1e-6);
  expect(days).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/phase-51-waiting.png" });
});
