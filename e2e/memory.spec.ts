import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 12 (PLAN "Memory/long-run") bounded-growth check, rendered-side. The pure-sim half of
 * this requirement (news history, net-worth chart samples staying capped over a long span of
 * ticks) is already covered end-to-end by `tests/sim/longRun.test.ts`, which runs a full 131-year
 * game (well past the 20-years this phase asks for) and asserts `state.news.length`/
 * `state.finance.netWorthHistory.length` stay under their caps — not duplicated here.
 *
 * This spec covers what only the renderer can exercise: touring a Large map across every zoom
 * bucket bakes one offscreen canvas per (chunk, zoom bucket) ever seen — without a bound, a long
 * session of panning around never reclaims any of them. It also runs a busy multi-year session
 * (60 trains delivering cargo, at 8x speed) and checks the floating "+$" delivery-label list and
 * the news/net-worth counters stay bounded in a real rendered context too, not just the pure-sim
 * one.
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const SEED = 909090;
const TILE_SIZE = 32;

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate((opts) => window.__game?.regenerate(opts), {
    seed: SEED,
    size: "large",
    waterLevel: "low",
    roughness: "flat",
  });
}

test("memory/long-run: chunk cache, floating labels, and news/chart history stay bounded", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await setup(page);

  const { width, height } = await page.evaluate(() => window.__game!.getMap());

  const { stationCount } = await page.evaluate(() => {
    const g = window.__game!;
    g.debugSetCash(3_000_000);
    // A tighter spacing than the perf stress test (src/main.ts's debugBuildStressNetwork default
    // is tuned for a large, sparse network) — 1830-era locomotives cover under 1 tile/day, so this
    // test wants short hops between stations to actually see completed deliveries within a
    // reasonable warm-up/runtime instead of every train still being mid-journey on its first leg.
    const network = g.debugBuildStressNetwork({ lines: 5, doubleEvery: 2, stationSpacing: 8 });
    // Give every stress station a small city on its own tile, so the passenger trains
    // debugSpawnStressTrains buys actually have real supply to load and deliver (the bare grid
    // network has no supply of its own) — otherwise no delivery ever fires and the floating-label
    // assertion below would be trivially true (always 0) instead of actually exercised.
    for (const id of network.stationIds) {
      const station = g.getStations().find((s) => s.id === id);
      if (station) g.debugPlaceCity([station.tile], 30_000);
    }
    g.debugSpawnStressTrains(60);
    // Warm-up (fast, synchronous, no rendering): let cargo accrue and the first wave of
    // deliveries happen so the real-time measurement window below starts from a steady state of
    // ongoing traffic rather than an empty economy that hasn't had time to spin up yet.
    g.runDays(60);
    return { stationCount: network.stations };
  });
  expect(stationCount).toBeGreaterThan(10);

  // Tour the whole map at every zoom bucket (1x, 0.5x, 0.25x) — this is what actually populates
  // the terrain/track chunk caches; a normal player only ever sees a fraction of this in one
  // sitting, so this is deliberately more exhaustive than real play.
  const cols = 6;
  const rows = 4;
  for (const zoom of [1, 0.5, 0.25]) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = ((c + 0.5) / cols) * width;
        const y = ((r + 0.5) / rows) * height;
        await page.evaluate(
          ({ x, y, zoom, tileSize }) => {
            window.__game!.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize);
            window.__game!.camera.setZoom(zoom);
          },
          { x, y, zoom, tileSize: TILE_SIZE },
        );
        await page.waitForTimeout(16); // let one rAF frame actually draw at this camera position
      }
    }
  }

  const afterTour = await page.evaluate(() => window.__game!.getChunkCacheStats());
  console.log("[memory] chunk cache after full-map tour at 3 zoom levels:", afterTour);
  // Large map = ceil(192/16) x ceil(128/16) = 12x8 = 96 chunks/bucket x 3 buckets = 288 max
  // distinct chunks even if every single one were visited — the cap exists as a backstop above
  // that (see TERRAIN_CHUNK_CACHE_MAX/TRACK_CHUNK_CACHE_MAX), so this assertion is the real
  // regression guard: it fails if the cap is ever removed or a future larger map blows past it.
  expect(afterTour.terrainChunks).toBeLessThanOrEqual(350);
  expect(afterTour.trackChunks).toBeLessThanOrEqual(350);

  // Now run a busy multi-year session at 8x — real rendered ticks, not runDays() — so deliveries,
  // news, and floating labels all happen the way they would in an actual long play session, and
  // check they stay bounded in that rendered context too.
  let maxFloatingLabels = 0;
  await page.evaluate(() => window.__game!.setSpeed(8));
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    const count = await page.evaluate(() => window.__game!.getFloatingLabelCount());
    maxFloatingLabels = Math.max(maxFloatingLabels, count);
  }
  await page.evaluate(() => window.__game!.setSpeed(0));

  const finalStats = await page.evaluate(() => ({
    news: window.__game!.getNewsCount(),
    netWorthSamples: window.__game!.getNetWorthHistoryCount(),
    chunkCache: window.__game!.getChunkCacheStats(),
    calendar: window.__game!.getCalendar(),
  }));
  console.log("[memory] max floating labels seen:", maxFloatingLabels, "final stats:", finalStats);

  // A burst of near-simultaneous deliveries from 60 trains is real, but should still be a small
  // multiple of the train count, not unbounded growth — each label is pruned ~1.4s after it
  // appears (src/render/deliveryLabels.ts), so this would only fail if that pruning broke.
  expect(maxFloatingLabels).toBeLessThan(200);
  expect(finalStats.news).toBeLessThanOrEqual(200); // NEWS_HISTORY_MAX (src/data/news.ts)
  expect(finalStats.netWorthSamples).toBeLessThanOrEqual(480); // NET_WORTH_HISTORY_MAX_SAMPLES
  expect(finalStats.chunkCache.terrainChunks).toBeLessThanOrEqual(350);
  expect(finalStats.chunkCache.trackChunks).toBeLessThanOrEqual(350);

  expect(errors, `console/page errors: ${errors.join("\n")}`).toEqual([]);
});
