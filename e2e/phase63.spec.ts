import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 63: the processor on a station's Cargo tab is a recipe picture (inputs with stock gauges -> output). */
test.use({ deviceScaleFactor: 2 });

async function openSteelMill(page: Page): Promise<void> {
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1870 }),
  );
  await page.evaluate(() => window.__game!.debugSetCash(5_000_000));
  await page.evaluate(() => window.__game!.setSpeed(0));
  const stationId = await page.evaluate(() => {
    const game = window.__game!;
    const map = game.getMap();
    const ind = game.getIndustries().find((i) => i.type === "steelMill");
    if (!ind) throw new Error("no steel mill on the map");
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
      const r = game.buildStation(idx, "depot");
      if (!r.ok) continue;
      const state = game.getState() as unknown as {
        industryEconomy: Map<
          number,
          {
            inputStock: Record<string, number>;
            lastReport?: { tick: number; received: object; made: object };
          }
        >;
        ticks: number;
      };
      const econ = state.industryEconomy.get(ind.id);
      if (econ) {
        econ.inputStock = { ironOre: 240 };
        econ.lastReport = {
          tick: state.ticks,
          received: { coal: 38, ironOre: 75 },
          made: { steel: 38 },
        };
      }
      const st = game.getStations().slice(-1)[0]!;
      const b = game.buyTrain(st.id, "grasshopper-0-4-0", ["coal"]);
      if (b.ok)
        game.setOrders(b.trainId!, [
          { stationId: st.id, rule: "auto" },
          { stationId: st.id, rule: "auto" },
        ]);
      return st.id;
    }
    throw new Error("could not place a station");
  });
  await page.evaluate((id) => window.__game!.debugOpenStation(id), stationId);
  await page.waitForTimeout(400);
}

test("steel mill panel is a recipe picture with a full gauge and an on-the-way mark", async ({
  page,
}) => {
  await openSteelMill(page);
  await expect(page.locator(".recipe-in")).toHaveCount(2);
  await expect(page.locator(".recipe-out")).toHaveCount(1);
  await expect(page.locator('.recipe-in[data-cargo="ironOre"]')).toHaveClass(/full/);
  await expect(page.locator('.recipe-in[data-cargo="coal"] .recipe-tag svg')).toHaveCount(1);
  await expect(page.locator(".processing-row")).toHaveCount(0);
  await page.screenshot({ path: "docs/screenshots/phase-63-industry-panel.png" });
});
