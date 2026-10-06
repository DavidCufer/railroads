import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 38: a full processor shows "Stock: 240 t grain (full)"; a station without an Engine Shed says why. */
test.use({ deviceScaleFactor: 2 });

async function openStationBy(
  page: import("@playwright/test").Page,
  industryType: string,
  fill: boolean,
  fresh = true,
): Promise<void> {
  if (fresh) {
    await page.setViewportSize({ width: 800, height: 360 });
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await page.evaluate(() =>
      window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1840 }),
    );
    await page.evaluate(() => window.__game!.debugSetCash(5_000_000));
    await page.evaluate(() => window.__game!.setSpeed(0));
  }
  const stationId = await page.evaluate(
    ([type, full]) => {
      const game = window.__game!;
      const map = game.getMap();
      const ind = game.getIndustries().find((i) => i.type === type);
      if (!ind) throw new Error(`no ${type} on the map`);
      const m = map as unknown as {
        terrain: Uint8Array;
        riverNext: Int32Array;
        riverFlow: Uint16Array;
        industryId: Int32Array;
      };
      for (let y = ind.y - 3; y <= ind.y + 3; y++)
        for (let x = ind.x - 3; x <= ind.x + 3; x++) {
          const idx = y * map.width + x;
          if (m.industryId[idx] !== -1) continue;
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
        const idx = (ind.y + dy) * map.width + ind.x + dx;
        game.buildTrackPath([idx, idx + 1]);
        const r = game.buildStation(idx, "station");
        if (r.ok) {
          if (full) {
            const state = game.getState() as unknown as {
              industryEconomy: Map<number, { inputStock: Record<string, number> }>;
            };
            const econ = state.industryEconomy.get(ind.id);
            if (econ) econ.inputStock = { grain: 240 };
          }
          return game.getStations().slice(-1)[0]!.id;
        }
      }
      throw new Error("could not place a station");
    },
    [industryType, fill] as const,
  );
  await page.evaluate((id) => window.__game!.debugOpenStation(id), stationId);
  await page.waitForTimeout(400);
}

test("a full Food Plant says Stock ... (full)", async ({ page }) => {
  await openStationBy(page, "foodPlant", true);
  await expect(page.locator(".processing-stock").first()).toHaveText("Stock: 240 t grain (full)");
  await page.screenshot({ path: "docs/screenshots/phase-38-processor-full.png" });
});

test("a station without an Engine Shed shows a disabled Buy Train and why", async ({ page }) => {
  await openStationBy(page, "farm", false); // the first station gets the shed
  await openStationBy(page, "foodPlant", false, false);
  const shed = await page.evaluate(() => window.__game!.getStations().slice(-1)[0]!.hasEngineShed);
  expect(shed).toBe(false);
  await expect(page.locator(".station-buy-train-btn")).toBeDisabled();
  await expect(page.locator(".station-no-shed")).toHaveText("Needs an Engine Shed");
  await page.screenshot({ path: "docs/screenshots/phase-38-no-engine-shed.png" });
});
