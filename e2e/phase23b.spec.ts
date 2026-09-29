import { test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 23B (PLAN 23B): station placement collisions — before/after screenshots.
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

async function buildPath(page: Page, tiles: Array<{ x: number; y: number }>): Promise<void> {
  const result = await page.evaluate((tiles) => {
    const width = window.__game!.getMap().width;
    const path = tiles.map(({ x, y }) => y * width + x);
    return window.__game!.buildTrackPath(path);
  }, tiles);
  if (!result.ok) throw new Error(`track build failed: ${result.reason}`);
}

async function buildStationAt(page: Page, x: number, y: number, type: string): Promise<number> {
  return page.evaluate(
    ({ x, y, type }) => {
      const width = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * width + x, type);
      if (!r.ok) throw new Error(`station build failed: ${r.reason}`);
      return window.__game!.getStations().find((s) => s.x === x && s.y === y)!.id;
    },
    { x, y, type },
  );
}

/** Hides the DOM chrome so the screenshot is the bare map. */
async function hideUi(page: Page): Promise<void> {
  await page.addStyleTag({ content: "#ui { display: none !important; }" });
}

async function setupFlat(page: Page, cx: number, cy: number, half: number): Promise<void> {
  await setup(page, {
    seed: 12345,
    size: "medium",
    waterLevel: "normal",
    roughness: "normal",
    startYear: 1940,
  });
  await clearArea(page, cx - half, cx + half, cy - half, cy + half);
}

/** `SHOT=before` writes the *-before.png set (taken on the pre-fix code); default writes *-after.png. */
const SHOT = process.env["SHOT"] ?? "after";
const shot = (name: string): string => `docs/screenshots/phase-23b-${name}-${SHOT}.png`;

async function improve(page: Page, id: number, types: string[], shed = false): Promise<void> {
  await page.evaluate(
    ({ id, types, shed }) => {
      for (const t of types) window.__game!.buildImprovement(id, t as never);
      const st = (
        window.__game!.getState() as unknown as {
          stations: Array<{ id: number; hasEngineShed: boolean; hasWaterTower: boolean }>;
        }
      ).stations.find((s) => s.id === id)!;
      if (shed) {
        st.hasEngineShed = true;
        st.hasWaterTower = true;
      }
    },
    { id, types, shed },
  );
}

const line = (x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: x0 + Math.sign(x1 - x0) * Math.min(i, Math.abs(x1 - x0)),
    y: y0 + Math.sign(y1 - y0) * Math.min(i, Math.abs(y1 - y0)),
  }));
};

test.describe("Phase 23B — station placement", () => {
  for (const type of ["depot", "station", "terminal"]) {
    test(`${type} inside a dense city`, async ({ page }) => {
      const cx = 60;
      const cy = 60;
      await setupFlat(page, cx, cy, 9);
      await page.evaluate(
        ({ cx, cy }) => {
          const w = window.__game!.getMap().width;
          const tiles: number[] = [];
          for (let y = cy - 4; y <= cy + 4; y++)
            for (let x = cx - 5; x <= cx + 5; x++) tiles.push(y * w + x);
          window.__game!.debugPlaceCity(tiles, 60000);
        },
        { cx, cy },
      );
      await buildPath(page, line(cx - 7, cy, cx + 7, cy));
      const id = await buildStationAt(page, cx, cy, type);
      await improve(page, id, ["hotel", "warehouse", "postOffice"]);
      await hideUi(page);
      await centerOn(page, cx, cy, 1.8);
      await page.screenshot({ path: shot(`city-${type}`) });
    });
  }

  for (const type of ["depot", "station"]) {
    test(`${type} next to a junction`, async ({ page }) => {
      const cx = 60;
      const cy = 60;
      await setupFlat(page, cx, cy, 9);
      await buildPath(page, line(cx - 7, cy, cx + 7, cy));
      const id = await buildStationAt(page, cx, cy, type);
      await buildPath(page, line(cx, cy, cx + 5, cy - 5)); // branch leaving the station tile
      await buildPath(page, line(cx + 1, cy, cx + 6, cy + 5)); // and one a tile further east
      if (type === "station")
        await improve(
          page,
          id,
          ["hotel", "warehouse", "postOffice", "coldStorage", "freightYard", "livestockPens"],
          true,
        );
      await hideUi(page);
      await centerOn(page, cx, cy, 1.6);
      await page.screenshot({ path: shot(`junction-${type}`) });
    });
  }

  test("station on a diagonal that bends", async ({ page }) => {
    const cx = 60;
    const cy = 60;
    await setupFlat(page, cx, cy, 9);
    await buildPath(page, line(cx - 6, cy - 6, cx + 6, cy + 6));
    const id = await buildStationAt(page, cx, cy, "station");
    await buildPath(page, line(cx, cy, cx + 7, cy)); // axis-aligned branch off the station tile
    await improve(page, id, ["hotel", "warehouse"]);
    await hideUi(page);
    await centerOn(page, cx, cy, 2);
    await page.screenshot({ path: shot("diagonal-bend") });
  });

  test("station on straight diagonal with all improvements", async ({ page }) => {
    const cx = 60;
    const cy = 60;
    await setupFlat(page, cx, cy, 9);
    await buildPath(page, line(cx - 6, cy - 6, cx + 6, cy + 6));
    const id = await buildStationAt(page, cx, cy, "station");
    await improve(
      page,
      id,
      ["hotel", "warehouse", "postOffice", "coldStorage", "freightYard", "livestockPens"],
      true,
    );
    await hideUi(page);
    await centerOn(page, cx, cy, 1.6);
    await page.screenshot({ path: shot("diagonal-improvements") });
  });
});
