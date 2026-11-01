import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 78: an industry's output goes to the stations whose trains collect it, and the station panel says so. */
test.use({ deviceScaleFactor: 2 });

interface Placed {
  stationId: number;
}

async function stationBeside(page: import("@playwright/test").Page, type: string): Promise<Placed> {
  return page.evaluate((t) => {
    const game = window.__game!;
    const map = game.getMap();
    const industry = game.getIndustries().find((i) => i.type === t);
    if (!industry) throw new Error(`no ${t} on the map`);
    const m = map as unknown as {
      terrain: Uint8Array;
      riverNext: Int32Array;
      riverFlow: Uint16Array;
      industryId: Int32Array;
    };
    for (let y = industry.y - 3; y <= industry.y + 3; y++)
      for (let x = industry.x - 3; x <= industry.x + 3; x++) {
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
      const idx = (industry.y + dy) * map.width + industry.x + dx;
      game.buildTrackPath([idx, idx + 1]);
      if (game.buildStation(idx, "depot").ok)
        return { stationId: game.getStations().slice(-1)[0]!.id };
    }
    throw new Error(`could not place a station by the ${t}`);
  }, type);
}

test("two stations at the Smelter: the one that is loaded from gets the bars, and the panel says so", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1840 }),
  );
  await page.evaluate(() => window.__game!.debugSetCash(5_000_000));
  await page.evaluate(() => window.__game!.setSpeed(0));
  await page.evaluate(() => {
    const state = window.__game!.getState() as {
      industries: Array<{ id: number; type: string }>;
      industryEconomy: Map<number, { monthlyOutput: Record<string, number> }>;
    };
    const smelter = state.industries.find((i) => i.type === "smelter")!;
    state.industryEconomy.get(smelter.id)!.monthlyOutput = { silverBars: 40 };
  });
  const first = await stationBeside(page, "smelter");
  // The second station (the one bars are loaded at) has a month of pickups behind it.
  const second = await page.evaluate(() => {
    const state = window.__game!.getState() as {
      nextStationId: number;
      stationFlow: Map<number, unknown>;
    };
    state.stationFlow.set(state.nextStationId, {
      month: {},
      lastMonth: {},
      year: {},
      lastYear: {},
      fare: {},
      pickups: { silverBars: [30, 30, 30] },
    });
    return state.nextStationId;
  });
  const placed = await page.evaluate(() => {
    const game = window.__game!;
    const smelter = game.getIndustries().find((i) => i.type === "smelter")!;
    const map = game.getMap();
    for (const [dx, dy] of [
      [-1, 1],
      [1, -1],
      [-2, 0],
      [0, -2],
      [2, 1],
      [1, 2],
    ] as const) {
      const idx = (smelter.y + dy) * map.width + smelter.x + dx;
      game.buildTrackPath([idx, idx + 1]);
      if (game.buildStation(idx, "depot").ok) return true;
    }
    return false;
  });
  expect(placed).toBe(true);
  const ids = await page.evaluate(() => window.__game!.getStations().map((s) => s.id));
  expect(ids).toContain(second);
  await page.evaluate((id) => window.__game!.debugOpenStation(id), first.stationId);
  await page.waitForTimeout(400);
  const line = page.locator('[data-testid="output-split"]');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Smelter: 0 % here, 100 % via ");
  await page.screenshot({ path: "docs/screenshots/phase-78-station-split.png" });
  await page.evaluate((id) => window.__game!.debugOpenStation(id), second);
  await page.waitForTimeout(400);
  await expect(page.locator('[data-testid="output-split"]')).toContainText("Smelter: 100 % here");
});
