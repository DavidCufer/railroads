import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 36: a served raw producer shows one short trend line ("↑ 6 %/yr") under its supply chip. */
test.use({ deviceScaleFactor: 2 });

test("a served mine's supply chip shows its growth on one line", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1840 }),
  );
  await page.evaluate(() => window.__game!.debugSetCash(5_000_000));
  await page.evaluate(() => window.__game!.setSpeed(0));

  const stationId = await page.evaluate(() => {
    const game = window.__game!;
    const map = game.getMap();
    const mine = game.getIndustries().find((i) => i.type === "coalMine");
    if (!mine) throw new Error("no coal mine on the map");
    // Flatten the surroundings so a station fits, then try tiles next to the mine.
    const m = map as unknown as {
      terrain: Uint8Array;
      riverNext: Int32Array;
      riverFlow: Uint16Array;
    };
    for (let y = mine.y - 3; y <= mine.y + 3; y++)
      for (let x = mine.x - 3; x <= mine.x + 3; x++) {
        const idx = y * map.width + x;
        if ((map as unknown as { industryId: Int32Array }).industryId[idx] !== -1) continue;
        m.terrain[idx] = 0;
        m.riverNext[idx] = -1;
        m.riverFlow[idx] = 0;
      }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [2, 0],
      [0, 2],
    ] as const) {
      const idx = (mine.y + dy) * map.width + mine.x + dx;
      game.buildTrackPath([idx, idx + 1]);
      const r = game.buildStation(idx, "depot");
      if (r.ok) {
        const state = game.getState() as unknown as {
          industryEconomy: Map<number, { carriedShare?: number }>;
          mapContentVersion: number;
        };
        // As if trains had carried 90 % of its output for months: the panel reads the smoothed share.
        const econ = state.industryEconomy.get(mine.id);
        if (econ) econ.carriedShare = 0.9;
        return game.getStations().slice(-1)[0]!.id;
      }
    }
    throw new Error("could not place a station by the mine");
  });
  await page.evaluate((id) => window.__game!.debugOpenStation(id), stationId);
  await page.waitForTimeout(400);
  await expect(page.locator(".supply-trend").first()).toHaveText("↑ 8 %/yr");
  await page.screenshot({ path: "docs/screenshots/phase-36-industry-growth.png" });
});
