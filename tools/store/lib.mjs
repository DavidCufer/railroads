/** Shared Playwright helpers for the store-asset tools (Phase 71). */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BASE = process.env.STORE_BASE ?? "http://localhost:4173";
export const cacheDir = path.join(root, "tools/store/.cache");

export async function launch() {
  const executablePath = fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
    : undefined;
  return chromium.launch({ executablePath });
}

/** A game page at `viewport` CSS px, DPR `dpr`, with the busy save (tools/store/.cache/busy.json,
 * made by tools/store/make-save.sh) loaded as the live game. */
export async function openBusyGame(
  browser,
  viewport,
  dpr,
  query = "debug=1&debugHud=0",
  save = "busy",
) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?${query}`);
  await page.waitForFunction(() => window.__game !== undefined);
  const json = fs.readFileSync(path.join(cacheDir, `${save}.json`), "utf8");
  await page.evaluate((json) => window.__game.debugLoadSave(json), json);
  await page.waitForTimeout(500);
  return { ctx, page };
}
