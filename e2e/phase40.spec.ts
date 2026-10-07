import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 40: the long-haul chain is on the map from the start, and the station panel says in one line what it pays. */
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

test("the chain is on the map from the start, far apart, and its station says what it pays", async ({
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

  const sites = await page.evaluate(() => {
    const all = window.__game!.getIndustries();
    const find = (t: string) => all.find((i) => i.type === t);
    return { mine: find("silverMine"), smelter: find("smelter"), mint: find("mint") };
  });
  expect(sites.mine && sites.smelter && sites.mint).toBeTruthy();
  const map = await page.evaluate(() => window.__game!.getMap());
  const d = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const third = Math.max(map.width, map.height) / 3;
  expect(d(sites.mine!, sites.smelter!)).toBeGreaterThanOrEqual(third * 0.4);
  expect(d(sites.smelter!, sites.mint!)).toBeGreaterThanOrEqual(third * 0.4);

  // As if the smelter had been fed ore for a month: it makes bars, which the station then supplies.
  await page.evaluate(() => {
    const state = window.__game!.getState() as {
      industries: Array<{ id: number; type: string }>;
      industryEconomy: Map<number, { monthlyOutput: Record<string, number> }>;
    };
    const smelter = state.industries.find((i) => i.type === "smelter")!;
    state.industryEconomy.get(smelter.id)!.monthlyOutput = { silverBars: 40 };
  });
  const { stationId } = await stationBeside(page, "smelter");
  await page.evaluate((id) => window.__game!.debugOpenStation(id), stationId);
  await page.waitForTimeout(400);
  const line = page.locator('[data-testid="chain-pay"]');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Pays on arrival at the Mint: ~$");
  await page.screenshot({ path: "docs/screenshots/phase-40-station-line.png" });
});

test("the six chain industries draw distinctly", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1940,
    }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  await page.evaluate(() => {
    const st = window.__game!.getState() as {
      industries: Array<{ id: number; type: string; x: number; y: number }>;
      map: {
        width: number;
        height: number;
        industryId: Int16Array;
        cityId: Int16Array;
        terrain: Uint8Array;
        riverNext: Int32Array;
        riverFlow: Uint16Array;
      };
      industryEconomy: Map<number, { inputStock: object; monthlyOutput: object }>;
      mapContentVersion: number;
    };
    const m = st.map;
    for (let y = 0; y < 14; y++)
      for (let x = 58; x < 90; x++) {
        const i = y * m.width + x;
        m.terrain[i] = 0;
        m.industryId[i] = -1;
        m.cityId[i] = -1;
        m.riverNext[i] = -1;
        m.riverFlow[i] = 0;
      }
    ["silverMine", "smelter", "mint", "uraniumMine", "enrichmentPlant", "nuclearPlant"].forEach(
      (type, i) => {
        const x = 63 + (i % 3) * 4;
        const y = 4 + Math.floor(i / 3) * 4;
        const id = st.industries.length;
        st.industries.push({ id, type, x, y });
        m.industryId[y * m.width + x] = id;
        st.industryEconomy.set(id, { inputStock: {}, monthlyOutput: {} });
      },
    );
    st.mapContentVersion++;
  });
  await page.evaluate(() => window.__game!.camera.setCenter(66.5 * 32, 6.6 * 32));
  await page.evaluate(() => window.__game!.camera.setZoom(1.05));
  await page.waitForTimeout(900);
  await page.screenshot({ path: "docs/screenshots/phase-40-chain-industries.png" });
  expect(errors).toEqual([]);
});
