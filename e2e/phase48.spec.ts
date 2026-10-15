import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 48: people wait bound for their destination station (people who changed here included), and the
 * destinations sheet says how many changes a far town needs. */
test.use({ deviceScaleFactor: 2 });

test("waiting split names destination stations; destinations show the changes", async ({
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
    for (const t of [tiles[0]!, tiles[9]!, tiles[19]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    const [a, c, b] = game.getStations().map((s) => s.id);
    // Two lines meeting at the middle station: a to b needs one change.
    for (const stops of [
      [a!, c!],
      [c!, b!],
    ]) {
      const bought = game.buyTrain(a!, "norris-4-2-0", ["passengers", "passengers"]);
      if (!bought.ok) throw new Error(`buy ${bought.reason}`);
      game.setOrders(
        bought.trainId!,
        stops.map((stationId) => ({ stationId, rule: "auto" as const })),
      );
    }
    return { a: a!, c: c!, b: b! };
  });
  await page.evaluate(() => window.__game!.runDays(20));

  // The bare test patch has no towns to draw demand, so the station's routes and its waiting pile are set by hand
  // (the sim path is covered by tests/sim/stations/throughJourneys.test.ts): people for the far station and the middle one.
  await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationEconomy: Map<number, { supply: Record<string, number>; passengerRoutes?: unknown[] }>;
      stationCargo: Map<number, Record<string, unknown>>;
      stations: Array<{ id: number; tile: number }>;
    };
    const eco = state.stationEconomy.get(id.a)!;
    eco.supply["passengers"] = 400;
    eco.passengerRoutes = [
      { firstLeg: id.c, destination: id.b, cityId: 1, perMonth: 300, changes: 1 },
      { firstLeg: id.c, destination: id.c, cityId: 2, perMonth: 100, changes: 0 },
    ];
    const entry = state.stationCargo.get(id.a) ?? {};
    const tile = state.stations.find((s) => s.id === id.a)!.tile;
    entry["passengers"] = {
      amount: 160,
      waitingDays: 1,
      lots: [
        { dest: id.b, amount: 120, originTile: tile },
        { dest: id.c, amount: 40, originTile: tile },
      ],
    };
    state.stationCargo.set(id.a, entry);
  }, ids);

  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
  await expect(page.locator('[data-testid="waiting-split"]')).toContainText("120");
  await page.screenshot({ path: "docs/screenshots/phase-48-station-split.png" });

  await page.locator(".dest-link").click();
  await page.locator(".dest-row-head").first().click();
  await expect(page.locator(".dest-final").first()).toContainText("1 change");
  await page.screenshot({ path: "docs/screenshots/phase-48-destinations.png" });
});
