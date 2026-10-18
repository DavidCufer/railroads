import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";
import { lineWithTrain } from "./p30bHelpers";

/**
 * Phase 49 item 3: visible words per panel. A "word" is a whitespace-separated token with a letter or digit,
 * counted over the whole text of the panel (what the player can read by scrolling), never over closed (i) tips.
 * BEFORE holds the counts measured on the Phase 48 look; the panels must now stay under 60 % of them.
 */
test.use({ deviceScaleFactor: 2 });

const BEFORE: Record<string, number> = {
  station: 63,
  "buy-engine": 61,
  "buy-cars": 80,
  train: 39,
  consist: 66,
  lines: 52,
  finance: 50,
  goals: 45,
  history: 47,
};
const MEASURED: Record<string, number> = {};
const PHASE50_CEILING: Record<string, number> = { "buy-cars": 65, train: 24, consist: 60 };

async function words(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const roots = Array.from(document.querySelectorAll<HTMLElement>(sel));
    const root = roots[roots.length - 1];
    if (!root) return -1;
    let n = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (el.closest("[hidden], script, style")) continue;
      for (const tok of (node.textContent ?? "").split(/\s+/)) if (/[\p{L}\p{N}]/u.test(tok)) n++;
    }
    return n;
  }, selector);
}

async function record(page: Page, key: string, selector: string, shot?: string): Promise<void> {
  await page.waitForTimeout(250);
  const n = await words(page, selector);
  MEASURED[key] = n;
  console.log(`WORDS ${key} ${n}`);
  if (process.env["WORDS_TEXT"])
    console.log(
      `TEXT ${key}: ` +
        (await page.evaluate((sel) => {
          const roots = Array.from(document.querySelectorAll<HTMLElement>(sel));
          return (roots[roots.length - 1]?.innerText ?? "").replace(/\s*\n\s*/g, " | ");
        }, selector)),
    );
  expect(n, `${key} must be open`).toBeGreaterThan(0);
  const before = BEFORE[key];
  // Phase 50: the owner asked for some text back; those cards get a fixed ceiling at the measured count (still a guard).
  const limit =
    PHASE50_CEILING[key] ?? (before === undefined ? undefined : Math.floor(before * 0.6));
  if (limit !== undefined) expect(n, `${key} words (before ${before})`).toBeLessThanOrEqual(limit);
  if (shot) await page.screenshot({ path: `docs/screenshots/${shot}.png` });
}

test("word counts of the busiest panels", async ({ page }) => {
  const { a, trainId } = await lineWithTrain(page);
  // Make it a real route: a town at each end and two industries beside the line.
  await page.evaluate(() => {
    const g = window.__game!;
    const w = g.getMap().width;
    const block = (x: number, y: number): number[] => [
      x + y * w,
      x + 1 + y * w,
      x + (y - 1) * w,
      x + 1 + (y - 1) * w,
    ];
    // One-word names, as real towns have (the debug name "Test City 24" would count as three words in the station panel).
    const state = g.getState() as unknown as { cities: Array<{ name: string }> };
    state.cities[g.debugPlaceCity(block(49, 35), 24_000)]!.name = "Brno";
    state.cities[g.debugPlaceCity(block(66, 35), 9_000)]!.name = "Linz";
    g.debugPlaceIndustry(32 * w + 57, "coalMine");
    g.debugPlaceIndustry(38 * w + 59, "steelMill");
  });
  await page.evaluate(() => window.__game!.runDays(60));
  await page.evaluate(() => window.__game!.setSpeed(0));

  await page.evaluate((id) => window.__game!.debugOpenStation(id), a);
  await record(page, "station", ".panel", "phase-49-station");

  await page.locator(".station-buy-train-btn").click();
  await record(page, "buy-engine", ".sheet", "phase-49-buy-engine");
  await page.locator(".wizard-next").click();
  await record(page, "buy-cars", ".sheet", "phase-49-buy-cars");
  await page.locator(".wizard-next").click();
  await record(page, "buy-route", ".route-sheet");
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    document.querySelectorAll(".sheet .sheet-close").forEach((b) => (b as HTMLElement).click()),
  );

  await page.evaluate((id) => window.__game!.debugOpenTrain(id), trainId);
  await record(page, "train", ".panel", "phase-49-train");
  await page.locator(".train-edit-btn").click();
  await record(page, "consist", ".sheet", "phase-49-consist");
  await page.evaluate(() =>
    document.querySelectorAll(".sheet .sheet-close").forEach((b) => (b as HTMLElement).click()),
  );
  await page.locator(".panel-close").first().click();

  await page.locator(".train-list-button").click();
  await page.locator('[data-testid="list-sort-lines"]').click();
  await record(page, "lines", ".panel, .sheet", "phase-49-lines");
  await page.locator(".panel-close").first().click();

  await page.locator(".top-bar .cash").click();
  await record(page, "finance", ".panel, .sheet", "phase-49-finance");
  await page.locator(".panel-close").first().click();

  await page.locator(".news-button").click();
  await record(page, "news", ".panel, .sheet");
  await page.locator(".panel-close").first().click();

  await page.locator(".goals-button").click();
  await record(page, "goals", ".panel, .sheet");
  await page.locator(".panel-close").first().click();

  await page.locator("[aria-label='Menu']").first().click();
  await page.locator('[data-testid="menu-history"]').click();
  await record(page, "history", '[data-testid="history-screen"]');
  console.log("WORDS_JSON " + JSON.stringify(MEASURED));
});
