import { createRequire } from "module";
const { chromium } = createRequire(new URL("../../package.json", import.meta.url))(
  "@playwright/test",
);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1100, height: 1100 } });
await p.goto("file://" + process.argv[2]);
await p.waitForTimeout(2000);
await p.locator("#c").screenshot({ path: process.argv[3], omitBackground: true });
await b.close();
