import { expect, test } from "@playwright/test";
import "./gameWindow";
import { clearArea, setup } from "./p30bHelpers";

/** Phase 75: sinks say what they accept, producers say who buys, and the long-haul chain is one tappable line. */
test.use({ deviceScaleFactor: 2 });
const shot = (name: string): string => `docs/screenshots/phase-75-${name}.png`;

async function openAt(page: import("@playwright/test").Page, type: string): Promise<void> {
  await page.evaluate((t) => {
    const ind = window.__game!.getIndustries().find((i) => i.type === t)!;
    window.__game!.camera.setCenter((ind.x + 0.5) * 32, (ind.y + 0.5) * 32);
    window.__game!.camera.setZoom(2);
  }, type);
  await page.waitForTimeout(300);
  const open = await page.locator(".panel-close, [aria-label='Close']").count();
  if (open > 0) await page.locator(".panel-close, [aria-label='Close']").first().click();
  await page.waitForTimeout(200);
  await page.mouse.click(400, 180);
  await page.waitForTimeout(500);
}

test("Mint, Smelter and Silver Mine panels show the chain, sources and buyers", async ({
  page,
}) => {
  await setup(page);
  await clearArea(page, 40, 140, 20, 50);
  await page.evaluate(() => {
    const g = window.__game!;
    const w = g.getMap().width;
    g.debugPlaceIndustry(30 * w + 50, "silverMine");
    g.debugPlaceIndustry(30 * w + 80, "smelter");
    g.debugPlaceIndustry(30 * w + 110, "mint");
  });
  await page.getByRole("button", { name: "Info", exact: true }).click();

  await openAt(page, "mint");
  await expect(page.locator(".panel-title")).toHaveText("Mint");
  await expect(page.getByText("Accepts", { exact: true })).toBeVisible();
  await expect(page.getByText("Nearest sources")).toBeVisible();
  await expect(page.getByTestId("industry-chain")).toBeVisible();
  await expect(page.locator(".industry-source").first()).toContainText("Smelter");
  await page.screenshot({ path: shot("mint") });

  await openAt(page, "smelter");
  await expect(page.locator(".panel-title")).toHaveText("Smelter");
  await expect(page.getByText("Nearest buyers")).toBeVisible();
  await expect(page.getByTestId("industry-chain")).toBeVisible();
  await page.getByText("Nearest buyers").scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot("smelter") });
  // Tapping the Mint step in the chain centres the map there.
  await page.getByTestId("chain-mint").click();
  const cam = await page.evaluate(() => window.__game!.camera.getCenter().x);
  const mint = await page.evaluate(() => {
    const all = window.__game!.getIndustries();
    const sm = all.filter((i) => i.type === "smelter").find((i) => i.x === 80)!;
    return all
      .filter((i) => i.type === "mint")
      .sort((p, q) => Math.hypot(p.x - sm.x, p.y - sm.y) - Math.hypot(q.x - sm.x, q.y - sm.y))[0]!
      .x;
  });
  expect(Math.abs(cam - (mint + 0.5) * 32)).toBeLessThan(40);

  await openAt(page, "silverMine");
  await expect(page.locator(".panel-title")).toHaveText("Silver Mine");
  await expect(page.getByText("Nearest buyers")).toBeVisible();
  await expect(page.locator(".industry-buyer").first()).toContainText("Smelter");
  await page.screenshot({ path: shot("silver-mine") });
});

test("a chain from another era says none on the map", async ({ page }) => {
  await setup(page);
  await clearArea(page, 40, 140, 20, 50);
  await page.evaluate(() => {
    const g = window.__game!;
    g.debugPlaceIndustry(30 * g.getMap().width + 80, "enrichmentPlant");
  });
  await page.getByRole("button", { name: "Info", exact: true }).click();
  await openAt(page, "enrichmentPlant");
  await expect(page.locator(".panel-title")).toHaveText("Enrichment Plant");
  await expect(page.getByText("None on the map yet").first()).toBeVisible();
  await expect(page.getByTestId("chain-uraniumMine")).toBeDisabled();
});
