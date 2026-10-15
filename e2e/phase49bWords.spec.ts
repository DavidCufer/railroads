import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 49B item 2: visible words on the cards Phase 49 left out (contracts, news, game over, scenario end, the
 * first-game hints, the new-engine card). Same rule as phase49Words.spec: a word is a whitespace-separated token with
 * a letter or digit; BEFORE holds the counts measured on the Phase 49 look; each card must now stay under 60 % of it.
 */
test.use({ deviceScaleFactor: 2 });

const BEFORE: Record<string, number> = {
  "contracts-offers": 41,
  "contracts-accepted": 41,
  news: 16,
  "game-over": 30,
  "scenario-won": 27,
  "hints-all-steps": 101,
  "new-engine": 11,
};
const MEASURED: Record<string, number> = {};
const PHASE50_CEILING: Record<string, number> = { "new-engine": 8 };

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

async function game(page: Page, startYear: number): Promise<void> {
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(
    (year) =>
      window.__game?.regenerate({
        seed: 12345,
        size: "medium",
        waterLevel: "normal",
        startYear: year,
      }),
    startYear,
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
}

test("contracts and news", async ({ page }) => {
  await game(page, 1900);
  await page.evaluate(() => {
    const state = window.__game!.getState() as {
      ticks: number;
      cities: Array<{ id: number; tiles: number[]; population: number }>;
      news: unknown[];
      pendingNews: unknown[];
      nextNewsId: number;
      contracts: { offers: unknown[]; nextId: number };
    };
    const [a, b] = [...state.cities]
      .filter((c) => c.tiles.length > 0)
      .sort((x, y) => y.population - x.population);
    const month = 30 * 24;
    const mk = (over: Record<string, unknown>) => ({
      id: state.contracts.nextId++,
      progress: 0,
      offeredTick: state.ticks,
      expiresTick: state.ticks + 3 * month,
      ...over,
    });
    const delivery = mk({
      kind: "delivery",
      cityId: a!.id,
      cargo: "goods",
      target: 300,
      reward: 85_000,
      durationTicks: 12 * month,
    });
    const connection = mk({
      kind: "connection",
      cityId: b!.id,
      target: 0,
      reward: 120_000,
      paid: 0,
      fromTile: 0,
      toTile: 1,
      durationTicks: 30 * month,
    });
    state.contracts.offers.push(delivery, connection);
    const item = {
      kind: "contract",
      event: "offered",
      contract: delivery,
      money: 85_000,
      id: state.nextNewsId++,
      tick: state.ticks,
    };
    state.news.push(item);
    state.pendingNews.push(item);
  });
  await page.locator(".contracts-button").click();
  await expect(page.locator(".contract-card")).toHaveCount(2);
  await record(page, "contracts-offers", ".panel", "phase-49b-contracts");
  await page.locator(".contract-accept").first().click();
  await expect(page.locator(".contract-abandon")).toHaveCount(1);
  await record(page, "contracts-accepted", ".panel");
  await page.locator(".panel-close").first().click();
  await page.locator(".news-button").click();
  await record(page, "news", ".panel, .sheet", "phase-49b-news");
});

test("game over", async ({ page }) => {
  await game(page, 1900);
  await page.evaluate(() => {
    const state = window.__game!.getState() as {
      ticks: number;
      cash: number;
      finance: { loans: number; bankrupt: boolean };
    };
    state.ticks = 50 * 30 * 24;
    state.cash = -900_000;
    state.finance.loans = 300_000;
    state.finance.bankrupt = true;
  });
  await page.evaluate(() => window.__game!.setSpeed(1));
  await expect(page.locator(".game-over-card")).toBeVisible();
  await record(page, "game-over", ".game-over-card", "phase-49b-game-over");
});

test("scenario end cards", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() => window.__game?.startScenario("coalTrieste"));
  await page.evaluate(() => {
    const s = window.__game!.getState() as unknown as { scenario?: { progress: number } };
    s.scenario!.progress = 6000;
    window.__game!.setSpeed(1);
  });
  await expect(page.getByTestId("scenario-end")).toBeVisible({ timeout: 15_000 });
  await record(page, "scenario-won", '[data-testid="scenario-end"]', "phase-49b-scenario-won");
});

test("first-game hints and the new-engine card", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Game" }).click();
  await page.getByRole("button", { name: "Random" }).click();
  await page.getByRole("button", { name: "Start Game" }).click();
  await expect(page.locator(".hint-card")).toBeVisible();
  let total = 0;
  for (let i = 0; i < 8 && (await page.locator(".hint-card").count()) > 0; i++) {
    total += await words(page, ".hint-card");
    if (i === 0) await page.screenshot({ path: "docs/screenshots/phase-49b-hint.png" });
    await page.locator(".hint-card-btn-next").click();
  }
  MEASURED["hints-all-steps"] = total;
  console.log(`WORDS hints-all-steps ${total}`);
  const before = BEFORE["hints-all-steps"];
  if (before !== undefined) expect(total).toBeLessThanOrEqual(Math.floor(before * 0.6));

  await game(page, 1911);
  await page.evaluate(() => window.__game!.runDays(365));
  await expect(page.locator(".new-engine-card")).toBeVisible();
  await record(page, "new-engine", ".new-engine-card", "phase-49b-new-engine");
  console.log("WORDS_JSON " + JSON.stringify(MEASURED));
});
