/**
 * Phase 89 mock-ups: the station panel and the train panel of each prototype passenger model, as real screenshots of a
 * dev-flag build (`?debug=1&paxModel=...`). Three towns in a row (Venice 40k, Ljubljana 30k, Zagreb 25k), two trains Venice-Ljubljana,
 * one Ljubljana-Zagreb, 4 months of play. Output: docs/explore/mockups/<model>-{station,train}.png.
 */
import { test, type Page } from "@playwright/test";
import "../../e2e/gameWindow";

test.use({ deviceScaleFactor: 2 });
const VIEW = { width: 800, height: 760 };
type P = { x: number; y: number };
const range = (n: number, f: (i: number) => P): P[] => Array.from({ length: n }, (_, i) => f(i));
const TOWNS = [
  { name: "Venice", x: 52, pop: 40000 },
  { name: "Ljubljana", x: 64, pop: 30000 },
  { name: "Zagreb", x: 76, pop: 25000 },
];

async function scene(page: Page, model: string): Promise<{ ids: number[]; trains: number[] }> {
  await page.setViewportSize(VIEW);
  await page.goto(`/?debug=1&paxModel=${model}`);
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      startYear: 1900,
    }),
  );
  await page.evaluate(() => window.__game!.debugSetCash(50_000_000));
  await page.evaluate(() => window.__game!.setSpeed(0));
  await page.evaluate(
    ({ x0, x1, y0, y1 }) => {
      const map = window.__game!.getMap() as unknown as {
        width: number;
        height: number;
        terrain: Uint8Array;
        industryId: Int16Array;
        cityId: Int16Array;
        riverNext: Int32Array;
        riverFlow: Uint16Array;
      };
      for (let y = y0 - 3; y <= y1 + 3; y++)
        for (let x = x0 - 3; x <= x1 + 3; x++) {
          const idx = y * map.width + x;
          map.terrain[idx] = 0;
          map.industryId[idx] = -1;
          map.cityId[idx] = -1;
          map.riverNext[idx] = -1;
          map.riverFlow[idx] = 0;
        }
      (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
    },
    { x0: 50, x1: 80, y0: 30, y1: 45 },
  );
  const path = range(25, (i) => ({ x: 52 + i, y: 35 }));
  await page.evaluate((tiles) => {
    const w = window.__game!.getMap().width;
    const r = window.__game!.buildTrackPath(tiles.map(({ x, y }) => y * w + x));
    if (!r.ok) throw new Error(`build failed: ${r.reason}`);
  }, path);
  for (const x of [52, 64, 76])
    await page.evaluate((x) => {
      const w = window.__game!.getMap().width;
      const r = window.__game!.buildStation(35 * w + x, "station");
      if (!r.ok) throw new Error(`station failed: ${r.reason}`);
    }, x);
  await page.evaluate((towns) => {
    const state = window.__game!.getState() as unknown as {
      cities: Array<Record<string, unknown>>;
      mapContentVersion: number;
    };
    const map = window.__game!.getMap() as unknown as { width: number; cityId: Int16Array };
    state.cities.length = 0;
    towns.forEach((t, i) => {
      const tiles: number[] = [];
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const tl = (35 + dy) * map.width + t.x + dx;
          map.cityId[tl] = i;
          tiles.push(tl);
        }
      state.cities.push({
        id: i,
        name: t.name,
        tier: "city",
        population: t.pop,
        anchorX: t.x,
        anchorY: 35,
        coastal: false,
        tiles,
      });
    });
    state.mapContentVersion++;
  }, TOWNS);
  const st = await page.evaluate(() => window.__game!.getStations());
  const ids = st.map((s) => s.id);
  const trains = await page.evaluate(
    ({ a, b, c }) => {
      const out: number[] = [];
      for (const [from, to] of [
        [a, b],
        [a, b],
        [b, c],
      ] as const) {
        const r = window.__game!.buyTrain(a, "atlantic-4-4-2", [
          "passengers",
          "passengers",
          "passengers",
        ]);
        if (!r.ok) throw new Error(String(r.reason));
        window.__game!.setOrders(r.trainId!, [
          { stationId: from, rule: "auto" },
          { stationId: to, rule: "auto" },
        ]);
        out.push(r.trainId!);
      }
      return out;
    },
    { a: ids[0]!, b: ids[1]!, c: ids[2]! },
  );
  await page.evaluate(() => window.__game!.runDays(120));
  return { ids, trains };
}

for (const model of (process.env.MODELS ?? "route,service,ticket").split(",")) {
  test(`mock-ups: ${model}`, async ({ page }) => {
    const { ids, trains } = await scene(page, model);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids[1]!); // the hub: two destinations
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/explore/mockups/${model}-station.png` });
    await page.evaluate((id) => window.__game!.debugOpenTrain(id), trains[0]!);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/explore/mockups/${model}-train.png` });
  });
}
