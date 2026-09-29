import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 24B render polish screenshots (double-track branches, delivery labels, chunk seams, terrain borders). Each scenario is a situation from the
 * play-tests (double track curving into a station whose other side is single, S-curves, a
 * transition landing on a curve, a junction off double track, a double-track bridge) at zoom 1.5
 * and 2. Rendered at 2x device scale so individual rails/ties are legible when inspected.
 */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;
type P = { x: number; y: number };

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      startYear: 1848,
    }),
  );
  await page.evaluate(() => window.__game!.debugSetCash(5_000_000));
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tileSize }) => {
      window.__game?.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize);
    },
    { x, y, tileSize: TILE_SIZE },
  );
  await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
  await page.waitForTimeout(250);
}

async function clearArea(
  page: Page,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Promise<void> {
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
      for (let y = y0 - 3; y <= y1 + 3; y++) {
        for (let x = x0 - 3; x <= x1 + 3; x++) {
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const idx = y * map.width + x;
          map.terrain[idx] = 0;
          map.industryId[idx] = -1;
          map.cityId[idx] = -1;
          map.riverNext[idx] = -1;
          map.riverFlow[idx] = 0;
        }
      }
      (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
    },
    { x0, x1, y0, y1 },
  );
}

async function setWater(page: Page, tiles: P[]): Promise<void> {
  await page.evaluate((tiles) => {
    const map = window.__game!.getMap() as unknown as { width: number; terrain: Uint8Array };
    for (const { x, y } of tiles) map.terrain[y * map.width + x] = 6;
    (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
  }, tiles);
}

async function build(page: Page, tiles: P[], double?: P[]): Promise<void> {
  const r = await page.evaluate(
    ({ tiles, double }) => {
      const w = window.__game!.getMap().width;
      const b = window.__game!.buildTrackPath(tiles.map(({ x, y }) => y * w + x));
      if (!b.ok) return b;
      if (double) return window.__game!.upgradeTrackPath(double.map(({ x, y }) => y * w + x));
      return b;
    },
    { tiles, double },
  );
  if (!r.ok) throw new Error(`build failed: ${r.reason}`);
}

async function station(page: Page, x: number, y: number, type = "depot"): Promise<number> {
  return page.evaluate(
    ({ x, y, type }) => {
      const w = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * w + x, type);
      if (!r.ok) throw new Error(`station failed: ${r.reason}`);
      return window.__game!.getStations().find((s) => s.x === x && s.y === y)!.id;
    },
    { x, y, type },
  );
}

async function train(page: Page, at: number, orders: number[], cars: string[]): Promise<number> {
  return page.evaluate(
    ({ at, orders, cars }) => {
      const b = window.__game!.buyTrain(at, "american-4-4-0", cars);
      if (!b.ok || b.trainId === undefined) throw new Error(`buy failed: ${b.reason}`);
      const r = window.__game!.setOrders(
        b.trainId,
        orders.map((stationId) => ({ stationId, rule: "auto" })),
      );
      if (!r.ok) throw new Error(`orders failed: ${r.reason}`);
      return b.trainId;
    },
    { at, orders, cars },
  );
}

const range = (n: number, f: (i: number) => P): P[] => Array.from({ length: n }, (_, i) => f(i));
const SHOT = process.env["SHOT_PREFIX"] ?? "phase-24b";

test.describe("Phase 24B — branch off double track", () => {
  test("branches off diagonal, straight and both sides", async ({ page }) => {
    await setup(page);
    await clearArea(page, 55, 100, 20, 80);
    // 1. Diagonal double main (SE) with a single branch leaving east (the player's case).
    const diag = range(14, (i) => ({ x: 60 + i, y: 22 + i }));
    await build(page, diag, diag);
    const br1 = [{ x: 66, y: 28 }, ...range(6, (i) => ({ x: 67 + i, y: 28 }))];
    await build(page, br1);
    // 2. Diagonal double main with a *double* branch leaving south.
    const diag2 = range(14, (i) => ({ x: 60 + i, y: 42 + i }));
    await build(page, diag2, diag2);
    const br2 = [{ x: 66, y: 48 }, ...range(6, (i) => ({ x: 66, y: 49 + i }))];
    await build(page, br2, br2);
    // 3. Straight double with a diagonal single branch on the north side, and one on the south.
    const st = range(22, (i) => ({ x: 60 + i, y: 66 }));
    await build(page, st, st);
    await build(page, [{ x: 66, y: 66 }, ...range(5, (i) => ({ x: 67 + i, y: 65 - i }))]);
    await build(page, [{ x: 74, y: 66 }, ...range(5, (i) => ({ x: 75 + i, y: 67 + i }))]);
    for (const z of [2, 1.5]) {
      await centerOn(page, 68, 29, z);
      await page.screenshot({ path: `docs/screenshots/${SHOT}-branch-diagonal-z${z}.png` });
      await centerOn(page, 67, 49, z);
      await page.screenshot({ path: `docs/screenshots/${SHOT}-branch-diag-double-z${z}.png` });
      await centerOn(page, 70, 66, z);
      await page.screenshot({ path: `docs/screenshots/${SHOT}-branch-straight-z${z}.png` });
    }
  });
});

test.describe("Phase 24B — delivery labels", () => {
  test("a burst of deliveries at one station stacks, never overlaps, and clears the supply bubbles", async ({
    page,
  }) => {
    await setup(page);
    const city = await page.evaluate(() => {
      const c = window.__game!.getCities()[0]!;
      const w = window.__game!.getMap().width;
      return { x: c.tiles[0]! % w, y: Math.floor(c.tiles[0]! / w) };
    });
    const id = await page.evaluate(({ x, y }) => {
      const w = window.__game!.getMap().width;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -8; dx <= 0; dx++) {
          const row = [0, 1, 2, 3, 4].map((i) => (y + dy) * w + x + dx + i);
          if (!window.__game!.buildTrackPath(row).ok) continue;
          const r = window.__game!.buildStation(row[2]!, "station");
          if (r.ok) {
            return window.__game!.getStations().find((s) => s.tile === row[2])!.id;
          }
        }
      }
      return -1;
    }, city);
    expect(id).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => window.__game!.runDays(20));
    const st = await page.evaluate(
      (id) => window.__game!.getStations().find((s) => s.id === id)!,
      id,
    );
    for (const z of [1, 2]) {
      await centerOn(page, st.x, st.y, z);
      await page.evaluate(
        (id) => window.__game!.debugQueueDeliveries(id, "passengers", 7, 662),
        id,
      );
      await page.waitForTimeout(700);
      await page.screenshot({ path: `docs/screenshots/${SHOT}-delivery-labels-z${z}.png` });
      await page.waitForTimeout(2600);
    }
  });
});

/** Seam metric over the game canvas, in device pixels. For every column (row) crossing the middle
 * of the screen, the mean absolute luminance difference from the average of its two neighbours; the
 * chunk-border columns (rows) are compared with the median of all of them. A hairline seam or a cut
 * decoration makes a border stand well above the terrain texture's own noise. */
async function seamMetric(page: Page): Promise<{
  vertical: { border: number; median: number; columns: number[] };
  horizontal: { border: number; median: number; columns: number[] };
}> {
  return page.evaluate(() => {
    const game = window.__game!;
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width;
    const ch = canvas.height;
    const x0 = Math.floor(cw * 0.3);
    const x1 = Math.floor(cw * 0.7);
    const y0 = Math.floor(ch * 0.3);
    const y1 = Math.floor(ch * 0.7);
    const sw = x1 - x0;
    const sh = y1 - y0;
    const data = ctx.getImageData(x0, y0, sw, sh).data;
    const lum = (i: number): number =>
      0.299 * (data[i] as number) +
      0.587 * (data[i + 1] as number) +
      0.114 * (data[i + 2] as number);
    const diffs = (n: number, m: number, at: (a: number, b: number) => number): number[] => {
      const out: number[] = new Array<number>(n).fill(0);
      for (let a = 1; a < n - 1; a++) {
        let sum = 0;
        for (let b = 0; b < m; b++) sum += Math.abs(at(a, b) - (at(a - 1, b) + at(a + 1, b)) / 2);
        out[a] = sum / m;
      }
      return out;
    };
    const median = (v: number[]): number =>
      v.slice(1, -1).sort((p, q) => p - q)[Math.floor((v.length - 2) / 2)] as number;
    const vert = diffs(sw, sh, (a, b) => lum((b * sw + a) * 4));
    const horiz = diffs(sh, sw, (a, b) => lum((a * sw + b) * 4));
    // Chunk borders are every 16 tiles = 512 world units.
    const borderCols: number[] = [];
    const borderRows: number[] = [];
    for (let k = 0; k < 40; k++) {
      const c = game.camera.getCenter();
      const zoom = game.camera.getZoom();
      const p = {
        x: (k * 512 - c.x) * zoom + canvas.clientWidth / 2,
        y: (k * 512 - c.y) * zoom + canvas.clientHeight / 2,
      };
      const dx = Math.round(p.x * dpr) - x0;
      const dy = Math.round(p.y * dpr) - y0;
      if (dx > 2 && dx < sw - 2) borderCols.push(dx);
      if (dy > 2 && dy < sh - 2) borderRows.push(dy);
    }
    const worst = (v: number[], at: number[]): number =>
      Math.max(0, ...at.map((i) => v[i] as number));
    return {
      vertical: { border: worst(vert, borderCols), median: median(vert), columns: borderCols },
      horizontal: { border: worst(horiz, borderRows), median: median(horiz), columns: borderRows },
    };
  });
}

test.describe("Phase 24B — chunk seams", () => {
  test("no hairline seams across chunk borders at fractional zooms", async ({ page }) => {
    await setup(page);
    const results: string[] = [];
    for (const z of [1, 1.37, 2, 0.9]) {
      // Chunk borders are every 16 tiles; centre near a border with a fractional offset.
      for (const [cx, cy] of [
        [96.3, 80.7],
        [112.6, 96.2],
      ] as const) {
        await centerOn(page, cx, cy, z);
        await page.waitForTimeout(400);
        const m = await seamMetric(page);
        const line = `z${z} @${cx},${cy} vertical ${m.vertical.border.toFixed(2)} (median ${m.vertical.median.toFixed(2)}, cols ${m.vertical.columns.length}) horizontal ${m.horizontal.border.toFixed(2)} (median ${m.horizontal.median.toFixed(2)}, rows ${m.horizontal.columns.length})`;
        results.push(line);
        expect.soft(m.vertical.border, line).toBeLessThan(m.vertical.median * 3 + 2);
        expect.soft(m.horizontal.border, line).toBeLessThan(m.horizontal.median * 3 + 2);
      }
      await page.screenshot({ path: `docs/screenshots/${SHOT}-seams-z${z}.png` });
    }
    console.log(results.join("\n"));
  });
});

test.describe("Phase 24B — terrain borders", () => {
  test("land class borders are smooth contours, not tile staircases", async ({ page }) => {
    await setup(page);
    // A hills↔mountain border and a hills↔grass border, found on the generated map.
    const spots = await page.evaluate(() => {
      const map = window.__game!.getMap() as unknown as {
        width: number;
        height: number;
        terrain: Uint8Array;
      };
      const HILLS = 2;
      const MOUNTAIN = 3;
      const found: Record<string, { x: number; y: number }> = {};
      for (let y = 4; y < map.height - 4 && !(found["hills"] && found["mountain"]); y++) {
        for (let x = 4; x < map.width - 4; x++) {
          const t = map.terrain[y * map.width + x];
          const e = map.terrain[y * map.width + x + 1];
          if (t === HILLS && e === MOUNTAIN && !found["mountain"]) found["mountain"] = { x, y };
          if (t === HILLS && e === 0 && !found["hills"]) found["hills"] = { x, y };
        }
      }
      return found;
    });
    for (const [name, x, y, z] of [
      ["forest-grass", 100, 88, 2],
      ["forest-grass-z1", 100, 88, 1],
      ["hills-grass", spots["hills"]?.x ?? 60, spots["hills"]?.y ?? 60, 2],
      ["hills-mountain", spots["mountain"]?.x ?? 60, spots["mountain"]?.y ?? 60, 2],
      ["overview", 110, 90, 0.5],
    ] as const) {
      await centerOn(page, x, y, z);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `docs/screenshots/${SHOT}-borders-${name}.png` });
    }
  });
});
