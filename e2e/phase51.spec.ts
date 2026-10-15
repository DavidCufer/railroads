import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 51: people wait only for the next train. A destination's pile holds the demand of the days until the next
 * train that carries them, and the waiting row says how many days that is. */
test.use({ deviceScaleFactor: 2 });

test("a waiting pile is cut to the days until the next train, and the row says so", async ({
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

  // The bare test patch has no towns to draw demand, so the route and a month-old pile are set by hand (the sim path
  // is covered by tests/sim/stations/waitingForNextTrain.test.ts).
  await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationEconomy: Map<
        number,
        {
          supply: Record<string, number>;
          passengerRoutes?: unknown[];
          passengerBound?: unknown[];
        }
      >;
      stationCargo: Map<number, Record<string, unknown>>;
      stations: Array<{ id: number; tile: number }>;
    };
    const eco = state.stationEconomy.get(id.a)!;
    eco.supply["passengers"] = 300;
    eco.passengerRoutes = [
      { firstLeg: id.b, destination: id.b, cityId: 1, perMonth: 300, changes: 0 },
    ];
    eco.passengerBound = [{ stationId: id.b, share: 1 }];
    const entry = state.stationCargo.get(id.a) ?? {};
    const tile = state.stations.find((s) => s.id === id.a)!.tile;
    entry["passengers"] = {
      amount: 300,
      waitingDays: 1,
      lots: [{ dest: id.b, amount: 300, originTile: tile }],
    };
    state.stationCargo.set(id.a, entry);
  }, ids);
  await page.evaluate(() => window.__game!.runDays(1));

  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
  const split = page.locator('[data-testid="waiting-split"]');
  await expect(split).toContainText(/next ~\d+ d/);
  const text = (await split.textContent()) ?? "";
  const days = Number(/next ~(\d+) d/.exec(text)![1]);
  const waiting = await page.evaluate(
    (id) =>
      (
        window.__game!.getState() as {
          stationCargo: Map<number, { passengers?: { amount: number } }>;
        }
      ).stationCargo.get(id.a)?.passengers?.amount ?? 0,
    ids,
  );
  // 300 a month = 10 a day: at most the days to the next train (rounded to a day) of people, never the month
  expect(waiting).toBeGreaterThan(0);
  expect(waiting).toBeLessThanOrEqual(10 * (days + 1));
  expect(waiting).toBeLessThan(300);
  await page.screenshot({ path: "docs/screenshots/phase-51-waiting.png" });
});
