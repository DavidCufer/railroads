import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 21 (STYLE §10): map polish. Station types with improvements, a city, the industry roster and
 * an overview, each screenshotted for review.
 */
const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;

interface RegenOptions {
  seed: number;
  size?: string;
  waterLevel?: string;
  roughness?: string;
  startYear?: number;
}

async function setup(page: Page, options: RegenOptions): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate((opts) => window.__game?.regenerate(opts), options);
  // Enough for every locomotive/car this file buys, but well under any random-map goal's net
  // worth threshold (a scaled multiple of starting cash) — avoids a "Goal reached!" celebration
  // dialog popping up and covering the screenshot.
  await page.evaluate(() => window.__game!.debugSetCash(2_000_000));
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tileSize }) => {
      window.__game?.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize);
    },
    { x, y, tileSize: TILE_SIZE },
  );
  await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
  await page.waitForTimeout(300);
}

/** Same rationale as other phases' e2e specs: guarantees a flat, empty patch regardless of what
 * the seed's map generator placed nearby — including rivers, which (unlike cities/industries)
 * aren't just a `terrain` id: the renderer draws them by walking `riverNext`/`riverFlow`
 * independently of the tile's own terrain, so those need clearing too, with a small margin so a
 * river approaching from just outside the rectangle doesn't still poke a segment in. */
async function clearArea(
  page: Page,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Promise<void> {
  await page.evaluate(
    ({ x0, x1, y0, y1 }) => {
      const map = window.__game!.getMap();
      const margin = 3;
      for (let y = y0 - margin; y <= y1 + margin; y++) {
        for (let x = x0 - margin; x <= x1 + margin; x++) {
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const idx = y * map.width + x;
          (map as unknown as { terrain: Uint8Array }).terrain[idx] = 0; // plain
          (map as unknown as { industryId: Int16Array }).industryId[idx] = -1;
          (map as unknown as { cityId: Int16Array }).cityId[idx] = -1;
          (map as unknown as { riverNext: Int32Array }).riverNext[idx] = -1;
          (map as unknown as { riverFlow: Uint16Array }).riverFlow[idx] = 0;
        }
      }
      // Bumps the same version counter city growth/new industries use (src/main.ts) to bust the
      // terrain chunk cache next frame — otherwise a chunk already baked (e.g. by the mini-map)
      // from the pre-mutation terrain would keep showing stale water/rivers.
      (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
    },
    { x0, x1, y0, y1 },
  );
}

async function setWater(page: Page, tiles: Array<{ x: number; y: number }>): Promise<void> {
  await page.evaluate((tiles) => {
    const map = window.__game!.getMap();
    for (const { x, y } of tiles) {
      (map as unknown as { terrain: Uint8Array }).terrain[y * map.width + x] = 6; // water
    }
    (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
  }, tiles);
}

async function buildPath(page: Page, tiles: Array<{ x: number; y: number }>): Promise<void> {
  const result = await page.evaluate((tiles) => {
    const width = window.__game!.getMap().width;
    const path = tiles.map(({ x, y }) => y * width + x);
    return window.__game!.buildTrackPath(path);
  }, tiles);
  if (!result.ok) throw new Error(`track build failed: ${result.reason}`);
}

async function buildDepot(page: Page, x: number, y: number): Promise<number> {
  return page.evaluate(
    ({ x, y }) => {
      const width = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * width + x, "depot");
      if (!r.ok) throw new Error(`station build failed: ${r.reason}`);
      return window.__game!.getStations().find((s) => s.x === x && s.y === y)!.id;
    },
    { x, y },
  );
}

async function buyAndRun(
  page: Page,
  stationAId: number,
  stationBId: number,
  loco: string,
  cars: string[],
): Promise<number> {
  return page.evaluate(
    ({ stationAId, stationBId, loco, cars }) => {
      const bought = window.__game!.buyTrain(stationAId, loco, cars);
      if (!bought.ok || bought.trainId === undefined) {
        throw new Error(`buy failed: ${bought.reason}`);
      }
      const orders = window.__game!.setOrders(bought.trainId, [
        { stationId: stationAId, rule: "passThrough" },
        { stationId: stationBId, rule: "passThrough" },
      ]);
      if (!orders.ok) throw new Error(`orders failed: ${orders.reason}`);
      return bought.trainId;
    },
    { stationAId, stationBId, loco, cars },
  );
}

const OUT = process.env.P21_OUT ?? "phase-21";
/** Review aid: P21_DSF=3 renders at 3x and clips around the centre so small details can be inspected. */
const DSF = Number(process.env.P21_DSF ?? 1);
test.use({ deviceScaleFactor: DSF });

function clipRect(): { x: number; y: number; width: number; height: number } {
  const [x, y, width, height] = (process.env.P21_CLIP ?? "240,70,320,200").split(",").map(Number);
  return { x: x!, y: y!, width: width!, height: height! };
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `docs/screenshots/${OUT}-${name}.png`,
    ...(DSF > 1 ? { clip: clipRect() } : {}),
  });
}

const pageErrors = new WeakMap<Page, string[]>();

async function scene(page: Page, startYear = 1940): Promise<void> {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page, {
    seed: 12345,
    size: "medium",
    waterLevel: "normal",
    roughness: "normal",
    startYear,
  });
  await page.evaluate(() => window.__game!.setSpeed(0));
}

test.describe("Phase 21 — industries", () => {
  test("industries at zoom 1", async ({ page }) => {
    await scene(page);
    await clearArea(page, 60, 100, 0, 14);
    const types = [
      "coalMine",
      "ironMine",
      "loggingCamp",
      "farm",
      "ranch",
      "oilWell",
      "steelMill",
      "sawmill",
      "foodPlant",
      "factory",
      "refinery",
      "port",
    ];
    await page.evaluate((types) => {
      const st = window.__game!.getState() as {
        industries: Array<{ id: number; type: string; x: number; y: number }>;
        map: { width: number; industryId: Int16Array; terrain: Uint8Array };
        industryEconomy: Map<
          number,
          { inputStock: Record<string, number>; monthlyOutput: Record<string, number> }
        >;
        mapContentVersion: number;
      };
      types.forEach((type, i) => {
        const x = 66 + (i % 6) * 3;
        const y = 5 + Math.floor(i / 6) * 3;
        const id = st.industries.length;
        st.industries.push({ id, type, x, y });
        st.map.industryId[y * st.map.width + x] = id;
        st.industryEconomy.set(id, {
          inputStock: {},
          monthlyOutput: { goods: 20, steel: 20, lumber: 20, coal: 20 },
        });
      });
      // A few forest tiles for the tree look.
      for (let x = 62; x < 66; x++)
        for (let y = 11; y < 14; y++) st.map.terrain[y * st.map.width + x] = 1;
      st.mapContentVersion++;
    }, types);
    await page.evaluate(() => window.__game!.camera.setCenter(73.5 * 32, 6.5 * 32));
    await page.evaluate(() => window.__game!.camera.setZoom(1));
    await page.waitForTimeout(900);
    await shot(page, "industries-zoom1");
    expect(pageErrors.get(page)).toEqual([]);
  });
});
