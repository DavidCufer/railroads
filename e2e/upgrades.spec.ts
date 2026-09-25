import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phone-sized viewport (SPEC §10.1: "~800×360 CSS px"), matching earlier phases' e2e specs. */
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

/** Same rationale as economy.spec.ts's helper: guarantees a flat, empty patch regardless of what
 * the seed's map generator placed nearby. */
async function clearStrip(page: Page, x0: number, x1: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x0, x1, y }) => {
      const map = window.__game!.getMap();
      for (let row = y - 3; row <= y + 3; row++) {
        for (let x = x0; x <= x1; x++) {
          const idx = row * map.width + x;
          (map as unknown as { terrain: Uint8Array }).terrain[idx] = 0; // plain
          (map as unknown as { industryId: Int16Array }).industryId[idx] = -1;
          (map as unknown as { cityId: Int16Array }).cityId[idx] = -1;
        }
      }
    },
    { x0, x1, y },
  );
}

async function buildLineWithStations(
  page: Page,
  x0: number,
  x1: number,
  y: number,
): Promise<{ stationAId: number; stationBId: number }> {
  return page.evaluate(
    ({ x0, x1, y }) => {
      const g = window.__game!;
      const width = g.getMap().width;
      const path: number[] = [];
      for (let x = x0; x <= x1; x++) path.push(y * width + x);
      const track = g.buildTrackPath(path);
      if (!track.ok) throw new Error(`track build failed: ${track.reason}`);
      const a = g.buildStation(y * width + x0, "depot");
      const b = g.buildStation(y * width + x1, "depot");
      if (!a.ok || !b.ok) throw new Error(`station build failed: ${a.reason ?? b.reason}`);
      const stations = g.getStations();
      const stationAId = stations.find((s) => s.x === x0 && s.y === y)!.id;
      const stationBId = stations.find((s) => s.x === x1 && s.y === y)!.id;
      return { stationAId, stationBId };
    },
    { x0, x1, y },
  );
}

test.describe("Phase 9 — upgrades and growth", () => {
  test("a station with several improvements renders distinct markers at zoom 2", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1875 });
    await clearStrip(page, 60, 90, 5);
    const { stationAId } = await buildLineWithStations(page, 70, 78, 5);

    for (const type of ["postOffice", "hotel", "warehouse", "livestockPens", "freightYard"]) {
      const result = await page.evaluate(
        ({ stationAId, type }) => window.__game!.buildImprovement(stationAId, type),
        { stationAId, type },
      );
      expect(result.ok, `${type}: ${result.reason ?? ""}`).toBe(true);
    }

    const stations = await page.evaluate(() => window.__game!.getStations());
    const stationA = stations.find((s) => s.id === stationAId)!;
    expect(stationA.improvements).toHaveLength(5);

    await centerOn(page, 70, 5, 2);
    await page.screenshot({ path: "docs/screenshots/phase-9-station-improvements-zoom2.png" });
  });

  test("a served city grows population, footprint, and tier, with a news toast", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1900 });
    await clearStrip(page, 30, 60, 40);

    const cityId = await page.evaluate(() => {
      const map = window.__game!.getMap().width;
      const tiles = [40 * map + 45, 40 * map + 46, 41 * map + 45, 41 * map + 46];
      return window.__game!.debugPlaceCity(tiles, 4_800);
    });

    // debugPlaceCity always tags it "city" tier — override to a real Village so there's a tier to
    // cross, and give it a name worth reading in the news toast.
    await page.evaluate(
      ({ cityId }) => {
        const state = window.__game!.getState() as {
          cities: Array<{ id: number; tier: string; population: number; name: string }>;
        };
        const city = state.cities.find((c) => c.id === cityId)!;
        city.tier = "village";
        city.population = 4_800;
        city.name = "Ashtown";
      },
      { cityId },
    );

    await centerOn(page, 46, 40, 1.5);
    await page.waitForTimeout(100);
    await page.screenshot({ path: "docs/screenshots/phase-9-city-before-growth.png" });

    // Force a large growth score (SPEC §8.3's threshold-crossing math is unit-tested in
    // tests/sim/economy/cityGrowth.test.ts — this screenshot just needs it to visibly fire) and
    // cross the next month boundary so `monthlyCityGrowthStep` applies it.
    await page.evaluate(
      ({ cityId }) => {
        const state = window.__game!.getState() as {
          cityGrowth: Map<number, { points: number; monthlyScore: number }>;
        };
        let growth = state.cityGrowth.get(cityId);
        if (!growth) {
          growth = { points: 0, monthlyScore: 0 };
          state.cityGrowth.set(cityId, growth);
        }
        growth.monthlyScore = 10_000_000;
      },
      { cityId },
    );
    await page.evaluate(() => window.__game!.runDays(31));

    const city = await page.evaluate(
      ({ cityId }) => {
        const state = window.__game!.getState() as {
          cities: Array<{ id: number; tier: string; population: number; tiles: number[] }>;
        };
        return state.cities.find((c) => c.id === cityId)!;
      },
      { cityId },
    );
    expect(city.population).toBeGreaterThan(4_800);
    expect(city.tier).not.toBe("village");
    expect(city.tiles.length).toBeGreaterThan(4);

    const news = await page.evaluate(() => {
      const state = window.__game!.getState() as {
        news: Array<{ kind: string }>;
      };
      return state.news;
    });
    expect(news.some((n) => n.kind === "cityGrowth")).toBe(true);

    await page.screenshot({ path: "docs/screenshots/phase-9-city-after-growth.png" });
  });

  test("city panel shows Civic Investment, connected by rail, with clear feedback", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1900 });
    await clearStrip(page, 30, 60, 60);

    const setupResult = await page.evaluate(() => {
      const g = window.__game!;
      const mapWidth = g.getMap().width;
      const tiles = [
        60 * mapWidth + 45,
        60 * mapWidth + 46,
        61 * mapWidth + 45,
        61 * mapWidth + 46,
      ];
      const cityId = g.debugPlaceCity(tiles, 50_000);
      const path: number[] = [];
      for (let x = 44; x <= 50; x++) path.push(60 * mapWidth + x);
      const track = g.buildTrackPath(path);
      if (!track.ok) throw new Error(`track failed: ${track.reason}`);
      const station = g.buildStation(60 * mapWidth + 45, "station");
      if (!station.ok) throw new Error(`station failed: ${station.reason}`);
      return { cityId, cityTile: 60 * mapWidth + 46 }; // a city tile, distinct from the station's
    });

    await centerOn(page, 46, 60, 1.5);
    const point = await page.evaluate(
      ({ tile }) => {
        const map = window.__game!.getMap();
        return window.__game!.tileScreenPoint(tile % map.width, Math.floor(tile / map.width));
      },
      { tile: setupResult.cityTile },
    );
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(300);
    await expect(page.locator(".city-civic-investment-btn")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-9-city-panel-civic-investment.png" });

    const popBefore = await page.evaluate(
      ({ cityId }) => {
        const state = window.__game!.getState() as {
          cities: Array<{ id: number; population: number }>;
        };
        return state.cities.find((c) => c.id === cityId)!.population;
      },
      { cityId: setupResult.cityId },
    );
    await page.locator(".city-civic-investment-btn").click();
    // openCityPanel's render() re-opens the panel (closePanel's old DOM node lingers ~220ms for
    // its slide-out transition), so wait past that before re-querying the (now-recreated) button.
    await page.waitForTimeout(400);
    const popAfter = await page.evaluate(
      ({ cityId }) => {
        const state = window.__game!.getState() as {
          cities: Array<{ id: number; population: number }>;
        };
        return state.cities.find((c) => c.id === cityId)!.population;
      },
      { cityId: setupResult.cityId },
    );
    expect(popAfter).toBeGreaterThan(popBefore);
    // Clear feedback: the button now shows a cooldown instead of a price.
    await expect(page.locator(".city-civic-investment-btn")).toBeDisabled();
    await page.screenshot({ path: "docs/screenshots/phase-9-city-civic-investment-cooldown.png" });
  });

  test("mini-map renders and tap-to-jump moves the camera", async ({ page }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await centerOn(page, 10, 10, 1);
    await page.waitForTimeout(150);
    await page.screenshot({ path: "docs/screenshots/phase-9-minimap.png" });

    const before = await page.evaluate(() => window.__game!.camera.getCenter());

    const rect = await page.evaluate(() => window.__game!.getMiniMapRect());
    // Tap near the mini-map's far corner (bottom-right of the mini-map itself) to jump the camera
    // toward the opposite side of the map from where it's currently centered near (10,10).
    const tapX = rect.x + rect.width - 4;
    const tapY = rect.y + rect.height - 4;
    await page.evaluate(({ tapX, tapY }) => window.__game!.tapMiniMap(tapX, tapY), { tapX, tapY });
    await page.waitForTimeout(150);

    const after = await page.evaluate(() => window.__game!.camera.getCenter());
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    expect(moved).toBeGreaterThan(TILE_SIZE * 5);
    await page.screenshot({ path: "docs/screenshots/phase-9-minimap-after-jump.png" });
  });

  test("each overlay renders (catchments, cargo heatmap, track type, train profit)", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await clearStrip(page, 60, 90, 5);
    const { stationAId, stationBId } = await buildLineWithStations(page, 70, 80, 5);
    // A real coal supply (not just a car hauling the type) so the heatmap overlay has something to
    // actually show — it tints by a station's *supply*, which is 0 without a producing industry.
    await page.evaluate(() => {
      window.__game!.debugPlaceIndustry(4 * window.__game!.getMap().width + 70, "coalMine");
    });
    const bought = await page.evaluate(
      ({ stationAId }) => window.__game!.buyTrain(stationAId, "american-4-4-0", ["coal"]),
      { stationAId },
    );
    expect(bought.ok).toBe(true);
    await page.evaluate(
      ({ trainId, stationAId, stationBId }) =>
        window.__game!.setOrders(trainId, [
          { stationId: stationAId, rule: "auto" },
          { stationId: stationBId, rule: "auto" },
        ]),
      { trainId: bought.trainId!, stationAId, stationBId },
    );
    await page.evaluate(() => window.__game!.runDays(5));
    await centerOn(page, 75, 5, 1.5);

    for (const overlay of ["catchments", "cargoHeatmap", "trackType", "trainProfit"] as const) {
      await page.evaluate((o) => window.__game!.setOverlay(o, true), overlay);
      if (overlay === "cargoHeatmap") {
        await page.evaluate(() => window.__game!.setHeatmapCargo("coal"));
      }
      await page.waitForTimeout(100);
      await page.screenshot({ path: `docs/screenshots/phase-9-overlay-${overlay}.png` });
      await page.evaluate((o) => window.__game!.setOverlay(o, false), overlay);
    }
  });

  test("floating buttons hide while a panel is open (Phase 8 review carry-over)", async ({
    page,
  }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", startYear: 1848 });
    await expect(page.locator(".news-button")).toBeVisible();
    await page.locator(".cash").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".panel-title")).toHaveText("Finance");
    await expect(page.locator(".news-button")).toBeHidden();
    await expect(page.locator(".train-list-button")).toBeHidden();
    await expect(page.locator(".quick-build-toggle")).toBeHidden();
    await page.screenshot({ path: "docs/screenshots/phase-9-finance-panel-buttons-hidden.png" });
  });
});
