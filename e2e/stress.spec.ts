import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 12 (SPEC §10.4) performance stress test: Large map, 60 trains, ~1,500 track edges, mixed
 * single/double track and stations, all built directly via `debugBuildStressNetwork`/
 * `debugSpawnStressTrains` (see src/main.ts) rather than real drag-to-build — a deterministic
 * scenario shape matters more here than exercising the build UI, and building 1,500 edges through
 * real cost/terrain validation across procedurally-generated terrain (rivers, water, mountains)
 * would make the edge count non-deterministic across map seeds.
 *
 * Measures sim tick time (`advanceOneHour`) and render time, both unthrottled and under 4×
 * Chromium CPU throttling (CDP `Emulation.setCPUThrottlingRate`) as a rough proxy for a mid-range
 * phone. Unthrottled numbers are asserted against the SPEC §10.4 targets (sim tick < 2ms, render
 * budget for 60fps); throttled numbers are recorded/logged, not hard-gated — this container's CPU
 * headroom under emulated throttling isn't representative of a real device, so a hard assertion
 * there would just be flaky. See docs/PROGRESS.md's Phase 12 entry for recorded before/after
 * numbers from optimizing against this test.
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const SEED = 424242;
const TRAIN_COUNT = 60;
const MIN_EDGES = 1200;

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

interface StressSetup {
  edges: number;
  stations: number;
  trainsSpawned: number;
}

async function buildStressScenario(page: Page): Promise<StressSetup> {
  return page.evaluate((trainCount) => {
    const g = window.__game!;
    // Comfortably covers 60 cheap steam locos (~$20-30k each) with margin, but deliberately well
    // under the random-map "Gold: net worth 20x starting cash" goal threshold — setting cash to
    // something huge here would instantly complete that goal and pop a celebration dialog mid-test.
    g.debugSetCash(3_000_000);
    const network = g.debugBuildStressNetwork({ lines: 5, doubleEvery: 2, stationSpacing: 24 });
    const trains = g.debugSpawnStressTrains(trainCount);
    // Frame a busy central stretch of the grid (where lines cross, so track/trains/stations are
    // actually on screen) rather than the default camera position, which mostly looks at open
    // ground on this map — both the screenshot and the render-time measurement below should
    // reflect a player actually looking at their busy network, not an empty viewport.
    const map = g.getMap();
    g.camera.setCenter((map.width / 2) * 32, (map.height / 2) * 32);
    g.camera.setZoom(0.35);
    // Warm up: get every train through its first departure/route search and settle into steady
    // movement/loading/waiting before we start timing — the first few ticks after spawning are
    // dominated by one-off A* route searches, not steady-state per-tick cost.
    g.runDays(3);
    return { edges: network.edges, stations: network.stations, trainsSpawned: trains.spawned };
  }, TRAIN_COUNT);
}

interface PerfSample {
  avgTickMs: number;
  avgFrameMs: number;
  avgRenderMs: number;
}

/** Lets the real game loop run at high speed for `ms` of wall-clock time (so both the sim tick
 * and the render path get freshly sampled via requestAnimationFrame), then reads the rolling
 * averages back. */
async function measure(page: Page, ms: number): Promise<PerfSample> {
  await page.evaluate(() => window.__game?.setSpeed(8));
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.__game?.setSpeed(0));
  return page.evaluate(() => ({
    avgTickMs: window.__game!.getAvgTickMs(),
    avgFrameMs: window.__game!.getAvgFrameMs(),
    avgRenderMs: window.__game!.getAvgRenderMs(),
  }));
}

test("stress scenario: 60 trains, ~1500 edges, sim tick + render perf", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await setup(page);
  const scenario = await buildStressScenario(page);
  expect(scenario.edges).toBeGreaterThanOrEqual(MIN_EDGES);
  expect(scenario.stations).toBeGreaterThan(10);
  expect(scenario.trainsSpawned).toBe(TRAIN_COUNT);

  await page.screenshot({ path: "docs/screenshots/phase-12-stress-overview.png" });

  // --- Unthrottled: this is what SPEC §10.4's targets are gated on. ---
  const unthrottled = await measure(page, 3000);
  console.log("[stress] unthrottled:", unthrottled);
  expect(unthrottled.avgTickMs).toBeLessThan(2);
  // 60 fps == 16.67ms/frame; allow some slack for a headless CI container (not a real device) —
  // the render-only cost (avgRenderMs) is the tighter, more meaningful signal and is asserted
  // separately below.
  expect(unthrottled.avgFrameMs).toBeLessThan(33);
  expect(unthrottled.avgRenderMs).toBeLessThan(16);

  // --- 4× CPU throttled: a rough proxy for a mid-range phone (SPEC §10.4's "accept" clause). ---
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const throttled = await measure(page, 3000);
  console.log("[stress] 4x throttled:", throttled);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  // Not hard-gated on SPEC's unthrottled numbers (this container's throttled headroom isn't a
  // real device), but should still be in a sane ballpark rather than falling over entirely.
  expect(throttled.avgTickMs).toBeLessThan(20);
  expect(throttled.avgRenderMs).toBeLessThan(120);

  expect(errors, `console/page errors: ${errors.join("\n")}`).toEqual([]);
});
