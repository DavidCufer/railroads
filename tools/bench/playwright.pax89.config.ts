import { defineConfig } from "@playwright/test";
import fs from "node:fs";

/** Phase 89 mock-up screenshots only: `npx playwright test -c tools/bench/playwright.pax89.config.ts` (not part of `npm run e2e`). */
const executablePath = fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
  ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
  : undefined;

export default defineConfig({
  testDir: "./",
  testMatch: /pax89Shots\.spec\.ts/,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
