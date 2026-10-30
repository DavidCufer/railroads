import { buildSync } from "esbuild";
import { test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 70: top-down train sprites. Item 1 stages three sample consists on the real map (one per
 * era) and shoots each at zoom 1 and 2. `PHASE70_OUT` redirects the crops (used to keep a "before"
 * set from the old art); `docs/screenshots/phase-70-sample-before-after.png` is composed from them.
 */
test.use({ deviceScaleFactor: 3 });

const OUT = process.env.PHASE70_OUT ?? "docs/screenshots";

const ERAS = [
  { name: "1850s", year: 1855, loco: "american-4-4-0", cars: ["passengers", "mail"] },
  { name: "1900s", year: 1905, loco: "pacific-4-6-2", cars: ["passengers", "passengers", "mail"] },
  { name: "1920s", year: 1925, loco: "mikado-2-8-2", cars: ["coal", "coal", "goods"] },
  {
    name: "1940s",
    year: 1945,
    loco: "articulated-4-8-8-4",
    cars: ["oil", "wood", "steel", "livestock"],
  },
  { name: "1960s", year: 1965, loco: "high-horsepower-diesel", cars: ["passengers", "passengers"] },
  { name: "1980s", year: 1985, loco: "high-speed-trainset", cars: ["passengers", "passengers"] },
  { name: "1990s", year: 1998, loco: "heavy-freight-electric", cars: ["coal", "grain", "ironOre"] },
];

const SAMPLES = [
  { name: "1850s", year: 1855, loco: "american-4-4-0", cars: ["passengers", "passengers"] },
  { name: "1920s", year: 1925, loco: "mikado-2-8-2", cars: ["coal", "coal", "goods"] },
  { name: "1960s", year: 1965, loco: "high-horsepower-diesel", cars: ["passengers", "passengers"] },
];

async function buildPath(page: Page, tiles: Array<{ x: number; y: number }>): Promise<void> {
  const r = await page.evaluate((tiles) => {
    const w = window.__game!.getMap().width;
    return window.__game!.buildTrackPath(tiles.map(({ x, y }) => y * w + x));
  }, tiles);
  if (!r.ok) throw new Error(`track build failed: ${r.reason}`);
}

const RUNS = [
  ...SAMPLES.map((s) => ({ prefix: "sample", s })),
  ...ERAS.map((s) => ({ prefix: "era", s })),
];

for (const { prefix, s } of RUNS) {
  test(`${prefix} consist ${s.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 360 });
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await page.evaluate((o) => window.__game?.regenerate(o), {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: s.year,
    });
    await page.evaluate(() => window.__game!.debugSetCash(50_000_000));
    // A flat, empty patch of the real terrain (plain tiles; the map itself is the normal renderer).
    await page.evaluate(() => {
      const map = window.__game!.getMap() as unknown as {
        width: number;
        terrain: Uint8Array;
        industryId: Int16Array;
        cityId: Int16Array;
        riverNext: Int32Array;
        riverFlow: Uint16Array;
      };
      for (let y = -3; y <= 13; y++)
        for (let x = 57; x <= 163; x++) {
          const i = y * map.width + x;
          if (y < 0) continue;
          map.terrain[i] = 0;
          map.industryId[i] = -1;
          map.cityId[i] = -1;
          map.riverNext[i] = -1;
          map.riverFlow[i] = 0;
        }
      (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
    });
    await buildPath(
      page,
      Array.from({ length: 81 }, (_, i) => ({ x: 70 + i, y: 5 })),
    );
    if (/electric|trainset/.test(s.loco)) {
      const r = await page.evaluate(() => {
        const w = window.__game!.getMap().width;
        return window.__game!.electrifyTrackPath(
          Array.from({ length: 81 }, (_, i) => 5 * w + 70 + i),
        );
      });
      if (!r.ok) throw new Error(`electrify failed: ${r.reason}`);
    }
    const trainId = await page.evaluate((s) => {
      const g = window.__game!;
      const w = g.getMap().width;
      const mk = (x: number): number => {
        const r = g.buildStation(5 * w + x, "depot");
        if (!r.ok) throw new Error(`station: ${r.reason}`);
        return g.getStations().find((st) => st.x === x && st.y === 5)!.id;
      };
      const a = mk(70);
      const b = mk(150);
      const bought = g.buyTrain(a, s.loco, s.cars);
      if (!bought.ok || bought.trainId === undefined) throw new Error(`buy: ${bought.reason}`);
      g.setOrders(bought.trainId, [
        { stationId: a, rule: "passThrough" },
        { stationId: b, rule: "passThrough" },
      ]);
      return bought.trainId;
    }, s);
    await page.evaluate((id) => {
      const g = window.__game!;
      // Freight cars show their load (the sample is about the heaps, not an empty run).
      const st = g.getState() as unknown as {
        trains: Array<{ id: number; cars: Array<{ cargoType: string; loadedUnits: number }> }>;
      };
      for (const c of st.trains.find((t) => t.id === id)!.cars)
        if (c.cargoType !== "passengers" && c.cargoType !== "mail") c.loadedUnits = 20;
      for (let i = 0; i < 400; i++) {
        const t = g.getTrains().find((tt) => tt.id === id);
        if (t && t.x > 79) break;
        g.runDays(1 / 24);
      }
      g.setSpeed(0);
    }, trainId);
    for (const zoom of [1, 2]) {
      await page.evaluate(
        ({ id, zoom }) => {
          const g = window.__game!;
          const t = g.getTrains().find((tt) => tt.id === id)!;
          g.camera.setCenter((t.x - 1.5 + 0.5) * 32, (t.y + 0.5) * 32);
          g.camera.setZoom(zoom);
        },
        { id: trainId, zoom },
      );
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${OUT}/phase-70-${prefix}-${s.name}-z${zoom}.png`,
        clip: { x: 400 - 190, y: 180 - 40, width: 380, height: 80 },
      });
    }
  });
}

test("gallery of every top-down map sprite at zoom 2", async ({ page }) => {
  const bundle = buildSync({
    entryPoints: ["e2e/spriteGalleryEntry.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "SG",
  }).outputFiles[0]!.text;
  await page.setViewportSize({ width: 800, height: 230 });
  await page.setContent('<body style="margin:0"><canvas id="c"></canvas></body>');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const sg = (window as unknown as { SG: { renderGallery: (c: HTMLCanvasElement) => void } }).SG;
    sg.renderGallery(document.getElementById("c") as HTMLCanvasElement);
  });
  await page.screenshot({ path: `${OUT}/phase-70-map-sprites-gallery.png` });
});
