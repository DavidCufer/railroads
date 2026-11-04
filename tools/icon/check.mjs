/**
 * Phase 86: icon check sheet. Draws the adaptive icon (background colour + foreground) and the legacy icon under a
 * circle, rounded-square and squircle mask at 48 px and 192 px; writes docs/screenshots/phase-86-icon-masks.png.
 * Run: node tools/icon/check.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const res = path.join(root, "android/app/src/main/res");
const uri = (p) => "data:image/png;base64," + fs.readFileSync(path.join(res, p)).toString("base64");
const bg = fs
  .readFileSync(path.join(res, "values/ic_launcher_background.xml"), "utf8")
  .match(/#[0-9A-Fa-f]{6}/)[0];
const masks = { circle: "50%", rounded: "22%", squircle: "38% / 38%" };
const cell = (size, radius, inner) =>
  `<div style="width:${size}px;height:${size}px;border-radius:${radius};overflow:hidden;position:relative;background:#fff">${inner}</div>`;
let html = `<body style="margin:0;padding:20px;background:#e8e4da;font:14px sans-serif;width:1000px">`;
for (const size of [48, 192]) {
  html += `<h3>${size} px: adaptive (foreground over ${bg}) | legacy round | legacy square</h3><div style="display:flex;gap:24px;align-items:center;margin-bottom:18px">`;
  for (const [name, radius] of Object.entries(masks)) {
    const fg = uri("mipmap-xxxhdpi/ic_launcher_foreground.png");
    // The adaptive canvas is 108 dp and the mask shows the inner 72 dp: scale 108/72.
    html += cell(
      size,
      radius,
      `<div style="position:absolute;inset:0;background:${bg}"></div><img src="${fg}" style="position:absolute;width:${(size * 108) / 72}px;left:${(-size * 18) / 72}px;top:${(-size * 18) / 72}px">`,
    );
  }
  html += cell(
    size,
    "50%",
    `<img src="${uri("mipmap-xxxhdpi/ic_launcher_round.png")}" width="${size}">`,
  );
  html += cell(size, "12%", `<img src="${uri("mipmap-xxxhdpi/ic_launcher.png")}" width="${size}">`);
  html += `</div>`;
}
html += `</body>`;
const executablePath = fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
  ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
  : undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1040, height: 520 } });
await page.setContent(html);
await page.screenshot({ path: path.join(root, "docs/screenshots/phase-86-icon-masks.png") });
await browser.close();
