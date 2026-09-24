/**
 * Generates the Android app icon (SPEC §1: all graphics procedural, no image assets except the
 * app icon itself, which is drawn once here and committed as PNGs). Draws a simple locomotive
 * silhouette with Canvas 2D inside headless Chromium (reusing the pre-installed browser rather
 * than adding an image-processing dependency) and writes the required mipmap densities plus the
 * adaptive-icon foreground layer directly into the generated `android/` project.
 *
 * Run with: node tools/icon/generate.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const resDir = path.join(repoRoot, "android/app/src/main/res");

const BG_COLOR = "#1E2A38"; // dark steel blue, matches the UI's dark translucent panels
const LOCO_COLOR = "#F2B544"; // ui-accent gold (SPEC §10.3 palette)
const LOCO_SHADE = "#C8912A"; // darker gold for shading

const LEGACY_SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

// Adaptive-icon foreground canvas is larger than the legacy icon at the same density, since only
// the inner ~66% is guaranteed visible (the launcher masks/crops the rest).
const FOREGROUND_SIZES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

/** Runs entirely inside the page: draws the locomotive icon and returns a data URL. Self-contained
 * (no closures over the outer Node scope) because Playwright re-serializes this function's source
 * and evaluates it in the browser. */
function drawIconInPage({ size, round, transparent, bg, locoColor, locoShade }) {
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawLocomotive(ctx, canvasSize, scale) {
    const s = canvasSize * scale;
    const ox = (canvasSize - s) / 2;
    const oy = (canvasSize - s) / 2 + s * 0.06;

    ctx.save();
    ctx.translate(ox, oy);

    const bodyY = s * 0.42;
    const bodyH = s * 0.28;
    const wheelR = s * 0.1;
    const wheelY = bodyY + bodyH + wheelR * 0.55;

    ctx.fillStyle = locoColor;
    roundRect(ctx, s * 0.08, s * 0.22, s * 0.26, bodyY + bodyH - s * 0.22, s * 0.03);
    ctx.fill();

    roundRect(ctx, s * 0.08, bodyY, s * 0.78, bodyH, s * 0.05);
    ctx.fill();

    roundRect(ctx, s * 0.68, s * 0.28, s * 0.08, bodyY - s * 0.28, s * 0.015);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(s * 0.87, bodyY + bodyH * 0.28, s * 0.045, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(s * 0.86, bodyY + bodyH);
    ctx.lineTo(s * 0.98, bodyY + bodyH);
    ctx.lineTo(s * 0.88, wheelY + wheelR);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = locoShade;
    roundRect(ctx, s * 0.08, bodyY + bodyH * 0.62, s * 0.78, bodyH * 0.38, s * 0.03);
    ctx.fill();

    for (const cx of [s * 0.24, s * 0.44, s * 0.64]) {
      ctx.beginPath();
      ctx.arc(cx, wheelY, wheelR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  if (!transparent) {
    if (round) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  drawLocomotive(ctx, size, transparent ? 0.62 : 0.82);
  return canvas.toDataURL("image/png");
}

async function renderPng(page, options) {
  const dataUrl = await page.evaluate(drawIconInPage, options);
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64, "base64");
}

async function main() {
  const executablePath = fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
    : undefined;
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage();

  for (const [density, size] of Object.entries(LEGACY_SIZES)) {
    const common = { size, bg: BG_COLOR, locoColor: LOCO_COLOR, locoShade: LOCO_SHADE };
    const square = await renderPng(page, { ...common, round: false, transparent: false });
    const round = await renderPng(page, { ...common, round: true, transparent: false });
    const dir = path.join(resDir, `mipmap-${density}`);
    fs.writeFileSync(path.join(dir, "ic_launcher.png"), square);
    fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), round);
    console.log(`wrote mipmap-${density}/ic_launcher{,_round}.png (${size}x${size})`);
  }

  for (const [density, size] of Object.entries(FOREGROUND_SIZES)) {
    const foreground = await renderPng(page, {
      size,
      round: false,
      transparent: true,
      bg: BG_COLOR,
      locoColor: LOCO_COLOR,
      locoShade: LOCO_SHADE,
    });
    const dir = path.join(resDir, `mipmap-${density}`);
    fs.writeFileSync(path.join(dir, "ic_launcher_foreground.png"), foreground);
    console.log(`wrote mipmap-${density}/ic_launcher_foreground.png (${size}x${size})`);
  }

  await browser.close();

  const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG_COLOR}</color>\n</resources>\n`;
  fs.writeFileSync(path.join(resDir, "values/ic_launcher_background.xml"), backgroundXml);
  console.log("updated values/ic_launcher_background.xml");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
