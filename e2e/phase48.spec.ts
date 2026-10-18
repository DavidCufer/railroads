import { expect, test } from "@playwright/test";
import "./gameWindow";
import { addTowns } from "./addTowns";

/** Phase 48/54: the station says who waits and which towns its trains reach (a town a change away is not one of them);
 * the destinations sheet lists the towns called at and the ones nobody serves. */
test.use({ deviceScaleFactor: 2 });

test("the waiting line names the towns the trains reach; the sheet lists them and the unserved ones", async ({
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

  // A town at each station (the bare patch has none), and a pile of 53 passengers waiting at the first stop (Phase 54:
  // one pile; this station's trains call at the middle station only, the third is a change away).
  await addTowns(page, [ids.a, ids.c, ids.b], ["Venice", "Padua", "Milan"]);
  await page.evaluate((id) => {
    const state = window.__game!.getState() as {
      stationCargo: Map<number, Record<string, unknown>>;
    };
    state.stationCargo.set(id.a, { passengers: { amount: 53, waitingDays: 1 } });
  }, ids);

  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
  await expect(page.locator('[data-testid="waiting-split"]')).toContainText("Waiting 53");
  await expect(page.locator('[data-testid="waiting-split"]')).toContainText(
    "Trains here reach: Padua",
  );
  await expect(page.locator('[data-testid="waiting-split"]')).not.toContainText("Milan");
  await page.screenshot({ path: "docs/screenshots/phase-48-station-split.png" });

  await page.locator(".dest-link").click();
  // Only Padua is called at directly; Milan (a change away) is a town no train from here serves.
  await expect(page.locator(".dest-row")).toHaveCount(1);
  await expect(page.locator(".dest-row")).toContainText("Padua");
  await expect(page.locator(".dest-unconnected")).toContainText("Milan");
  await page.screenshot({ path: "docs/screenshots/phase-48-destinations.png" });
});
