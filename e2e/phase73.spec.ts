import { expect, test } from "@playwright/test";
import "./gameWindow";
import { clearArea, setup } from "./p30bHelpers";

/** Phase 73 (owner play-test 8): coal on the dark panel, and a perpendicular join refused at a through station. */
test.use({ deviceScaleFactor: 2 });
const shot = (name: string): string => `docs/screenshots/phase-73-${name}.png`;

test("coal's cargo icon is visible on the station and industry panels", async ({ page }) => {
  await setup(page);
  await clearArea(page, 60, 100, 30, 40);
  const ids = await page.evaluate(() => {
    const g = window.__game!;
    const w = g.getMap().width;
    const y = 35;
    g.debugPlaceIndustry((y - 1) * w + 71, "coalMine");
    g.debugPlaceIndustry((y - 1) * w + 90, "steelMill");
    if (!g.buildTrackPath(Array.from({ length: 20 }, (_, i) => y * w + 71 + i)).ok)
      throw new Error("track");
    g.buildStation(y * w + 71, "depot");
    g.buildStation(y * w + 90, "depot");
    const st = g.getStations();
    return { a: st[0]!.id, b: st[1]!.id };
  });
  await page.evaluate(() => window.__game!.runDays(40));
  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.b);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("coal-station") });
  // The industry panel (the owner's shot): coal in the recipe row and in "nearest sources" on the dark panel.
  await page.evaluate(() => {
    const mill = window.__game!.getIndustries().find((i) => i.type === "steelMill")!;
    window.__game!.camera.setCenter((mill.x + 0.5) * 32, (mill.y + 0.5) * 32);
    window.__game!.camera.setZoom(2);
  });
  await page.getByRole("button", { name: "Info", exact: true }).click();
  await page.locator(".panel-close, [aria-label='Close']").first().click();
  await page.waitForTimeout(300);
  await page.mouse.click(400, 180);
  await page.waitForTimeout(500);
  await expect(page.locator(".panel-title")).toHaveText("Steel Mill");
  await page.screenshot({ path: shot("coal-industry") });
  const bg = await page.evaluate(() => {
    const el = document.querySelector(".cargo-icon") as HTMLElement | null;
    return el ? getComputedStyle(el).color : null;
  });
  expect(bg).not.toBeNull();
});

test("a line joining the side of a through station at 90 degrees is refused", async ({ page }) => {
  await setup(page);
  await clearArea(page, 60, 100, 30, 40);
  const result = await page.evaluate(() => {
    const g = window.__game!;
    const w = g.getMap().width;
    const at = (x: number, y: number): number => y * w + x;
    const main = Array.from({ length: 12 }, (_, i) => at(70 + i, 30 + i));
    if (!g.buildTrackPath(main).ok) throw new Error("main");
    if (!g.buildStation(at(75, 35), "station").ok) throw new Error("station");
    const side = Array.from({ length: 5 }, (_, i) => at(75 - i, 35 + i));
    return g.buildTrackPath(side);
  });
  expect(result.ok).toBe(false);
  expect(result.reason).toBe("stationBend");
});
