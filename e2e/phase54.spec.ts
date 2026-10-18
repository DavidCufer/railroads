import { expect, test } from "@playwright/test";
import "./gameWindow";
import { addTowns } from "./addTowns";

/** Phase 54: a Venice station under the one-pile model, and an express (Venice-Milan) and a local (every station) on one line. */
test.use({ deviceScaleFactor: 2 });

test("a Venice station and an express with a local on one line", async ({ page }) => {
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
    for (const t of [tiles[2]!, tiles[14]!, tiles[27]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    const [a, b, c] = game.getStations().map((s) => s.id);
    game.camera.setZoom(1.5);
    game.camera.setCenter(45 * 32, (y + 0.5) * 32);
    return { a: a!, b: b!, c: c! };
  });
  await addTowns(page, [ids.a, ids.b, ids.c], ["Venice", "Padua", "Milan"], 40_000);
  await page.evaluate((id) => {
    const game = window.__game!;
    const local = game.buyTrain(id.a, "norris-4-2-0", ["passengers", "passengers", "passengers"]);
    const express = game.buyTrain(id.a, "norris-4-2-0", ["passengers", "passengers", "passengers"]);
    if (!local.ok || !express.ok) throw new Error("buy");
    game.setOrders(
      local.trainId!,
      [id.a, id.b, id.c, id.b].map((stationId) => ({ stationId, rule: "auto" as const })),
    );
    game.setOrders(
      express.trainId!,
      [id.a, id.c].map((stationId) => ({ stationId, rule: "auto" as const })),
    );
  }, ids);
  await page.evaluate(() => window.__game!.runDays(40));
  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
  const split = page.locator('[data-testid="waiting-split"]');
  await expect(split).toContainText("Trains here reach: Padua, Milan");
  await page.screenshot({ path: "docs/screenshots/phase-54-venice.png" });
  await page.locator(".dest-link").click();
  await expect(page.locator(".dest-row")).toHaveCount(2);
  await page.screenshot({ path: "docs/screenshots/phase-54-where-to.png" });
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    document
      .querySelectorAll(".sheet-close, .panel-close")
      .forEach((b) => (b as HTMLElement).click()),
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/screenshots/phase-54-line.png" });
});
