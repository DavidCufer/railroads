import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phone-sized viewport (SPEC §10.1: "~800×360 CSS px"), matching Phase 4's track e2e specs. */
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

async function tileScreenPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), { x, y });
}

async function selectTool(page: Page, name: "Track" | "Station" | "Info"): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
}

/** Drags a straight Track-mode run from (x1,y1) to (x2,y2) and confirms it. Centers the camera
 * on the midpoint first so both endpoints are safely on-screen regardless of the default camera
 * position. */
async function buildStraightTrack(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await centerOn(page, (from.x + to.x) / 2, (from.y + to.y) / 2, 1);
  await selectTool(page, "Track");
  const p1 = await tileScreenPoint(page, from.x, from.y);
  const p2 = await tileScreenPoint(page, to.x, to.y);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move(p2.x, p2.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  await page.locator(".confirm-bar-build").click();
  await page.waitForTimeout(100);
}

/** Taps a track tile in Station mode and, once the placement panel is open, optionally picks a
 * type before confirming the build. Re-centers on `tile` first (at the 1.5 zoom the reviewer
 * asked screenshots be taken at) so the tap always lands correctly regardless of prior camera
 * state. */
async function buildStationAt(
  page: Page,
  tile: { x: number; y: number },
  type?: "Depot" | "Station" | "Terminal",
): Promise<void> {
  await selectTool(page, "Station");
  await centerOn(page, tile.x, tile.y, 1.5);
  const p = await tileScreenPoint(page, tile.x, tile.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".panel-title")).toHaveText("New Station");
  if (type) {
    await page.locator(".station-type-btn", { hasText: type }).click();
  }
  await page.locator(".panel-action-build").click();
  await page.waitForTimeout(100);
}

// A flat, obstacle-free row for seed 12345 (plain terrain from x=71 to at least x=95 at y=47 —
// verified with a throwaway search script against the deterministic generator, see PROGRESS.md),
// running right through the town of Ashtown's footprint (tiles (75,47) and (76,47)) — the same
// town visible in phase-4-junction.png.
const ROW_Y = 47;
const TRACK_FROM = { x: 71, y: ROW_Y };
const TRACK_TO = { x: 90, y: ROW_Y };

test.describe("Phase 5 — stations", () => {
  test("Station mode: tap a track tile shows the catchment overlay, preview, and type picker", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", roughness: "normal" });
    await buildStraightTrack(page, TRACK_FROM, TRACK_TO);

    await selectTool(page, "Station");
    await centerOn(page, 76, ROW_Y, 1.5);
    const p = await tileScreenPoint(page, 76, ROW_Y); // an Ashtown footprint tile
    await page.mouse.click(p.x, p.y);
    // Let the panel's slide-in transition finish before screenshotting or measuring positions.
    await page.waitForTimeout(300);

    await expect(page.locator(".panel-title")).toHaveText("New Station");
    await expect(page.locator(".station-type-btn")).toHaveCount(3);
    await expect(page.locator(".station-type-btn.active")).toContainText("Depot");

    // On an Ashtown tile, even the smallest (Depot) catchment should already clear the acceptance
    // threshold for the city's own passengers/mail.
    await expect(page.locator(".station-economy .chip")).not.toHaveCount(0);

    await page.screenshot({ path: "docs/screenshots/phase-5-station-placement.png" });

    // Switching the type picker updates the live preview/cost without re-opening the panel.
    await page.locator(".station-type-btn", { hasText: "Terminal" }).click();
    await expect(page.locator(".station-type-btn.active")).toContainText("Terminal");
    await expect(page.locator(".panel-action-build")).toContainText("$100k");

    await page.locator(".panel-action-cancel").click();
    await expect(page.locator(".panel")).toHaveCount(0);
    expect(await page.evaluate(() => window.__game!.getStations())).toHaveLength(0);

    expect(consoleErrors).toEqual([]);
  });

  test("each station type renders distinctly on the map", async ({ page }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", roughness: "normal" });
    await buildStraightTrack(page, TRACK_FROM, TRACK_TO);

    const DEPOT = { x: 73, y: ROW_Y };
    const STATION = { x: 76, y: ROW_Y }; // inside Ashtown's footprint
    const TERMINAL = { x: 85, y: ROW_Y };

    await buildStationAt(page, DEPOT, "Depot");
    await buildStationAt(page, STATION, "Station");
    await buildStationAt(page, TERMINAL, "Terminal");

    const stations = await page.evaluate(() => window.__game!.getStations());
    expect(stations).toHaveLength(3);
    expect(stations.find((s) => s.x === DEPOT.x)?.type).toBe("depot");
    expect(stations.find((s) => s.x === STATION.x)?.type).toBe("station");
    expect(stations.find((s) => s.x === TERMINAL.x)?.type).toBe("terminal");
    // The city-tile station should default-name to the city alone.
    expect(stations.find((s) => s.x === STATION.x)?.name).toBe("Ashtown");
    // Only the first station built ever gets the free Engine Shed.
    const byId = [...stations].sort((a, b) => a.id - b.id);
    expect(byId[0]?.hasEngineShed).toBe(true);
    expect(byId[1]?.hasEngineShed).toBe(false);
    expect(byId[2]?.hasEngineShed).toBe(false);

    await selectTool(page, "Info");
    await centerOn(page, DEPOT.x, ROW_Y, 1.5);
    await page.screenshot({ path: "docs/screenshots/phase-5-depot.png" });

    await centerOn(page, STATION.x, ROW_Y, 1.5);
    await page.screenshot({ path: "docs/screenshots/phase-5-station-type.png" });

    await centerOn(page, TERMINAL.x, ROW_Y, 1.5);
    await page.screenshot({ path: "docs/screenshots/phase-5-terminal.png" });
  });

  test("station panel: rename, upgrade, supplies/accepts, waiting-cargo bars", async ({ page }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", roughness: "normal" });
    await buildStraightTrack(page, TRACK_FROM, TRACK_TO);
    const STATION_TILE = { x: 76, y: ROW_Y }; // inside Ashtown — rich supply/accept preview
    await buildStationAt(page, STATION_TILE, "Depot");

    const [station] = await page.evaluate(() => window.__game!.getStations());
    expect(station).toBeDefined();

    const economy = await page.evaluate((id) => window.__game!.getStationEconomy(id), station!.id);
    // Ashtown is a town — its per-tile passenger/mail acceptance (4 each) across a Depot's 3x3
    // catchment clears the 8-point threshold.
    expect(economy?.accepts).toEqual(expect.arrayContaining(["passengers", "mail"]));

    await selectTool(page, "Info");
    await centerOn(page, STATION_TILE.x, ROW_Y, 1.5);
    const p = await tileScreenPoint(page, STATION_TILE.x, STATION_TILE.y);
    await page.mouse.click(p.x, p.y);
    // Let the panel's slide-in transition finish before screenshotting.
    await page.waitForTimeout(300);

    await expect(page.locator(".panel-title")).toHaveText("Ashtown");
    await expect(page.locator(".station-upgrade-btn")).toContainText("Upgrade to Station");
    await expect(page.locator(".station-name-input")).toHaveValue("Ashtown");
    // No days have run yet, so nothing has accrued (Phase 7 cargo flow).
    await expect(page.locator("text=Nothing waiting.")).toBeVisible();

    await page.screenshot({ path: "docs/screenshots/phase-5-station-panel.png" });

    // Rename.
    await page.locator(".station-name-input").fill("Ashtown Central");
    await page.locator(".station-name-input").blur();
    await expect(page.locator(".panel-title")).toHaveText("Ashtown Central");

    // Upgrade (the panel fully re-renders; give the old copy time to be removed from the DOM
    // before re-querying, since it lingers briefly for its slide-out transition).
    await page.locator(".station-upgrade-btn").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".station-upgrade-btn")).toContainText("Upgrade to Terminal");
    const upgraded = await page.evaluate(() => window.__game!.getStations());
    expect(upgraded[0]?.type).toBe("station");
    expect(upgraded[0]?.name).toBe("Ashtown Central");
  });
});
