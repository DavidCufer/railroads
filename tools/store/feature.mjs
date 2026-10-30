/** Feature graphic 1024x500 (Phase 71): the title over a crop of the real game map (needs docs/store/screenshots from
 * tools/store/screenshots.mjs and a running preview build for the game's fonts).  Run: node tools/store/feature.mjs */
import fs from "node:fs";
import path from "node:path";
import { BASE, launch, root } from "./lib.mjs";
import { drawLocoInPage } from "./draw.mjs";

const src = fs
  .readFileSync(path.join(root, "docs/store/screenshots/tablet10-1-busy-network.png"))
  .toString("base64");
const browser = await launch();
const page = await browser.newPage();
await page.goto(`${BASE}/`);
await page.addScriptTag({ content: `window.drawLoco = ${drawLocoInPage.toString()};` });
const url = await page.evaluate(async (src) => {
  await document.fonts.load('700 80px "Playfair Display"');
  await document.fonts.load('400 24px "Playfair Display"');
  const img = new Image();
  img.src = "data:image/png;base64," + src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 500;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 760, 560, 1480, 723, 0, 0, 1024, 500); // the map right of Milan: track, trains, forest
  const g = ctx.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, "rgba(10,28,20,0.96)");
  g.addColorStop(0.5, "rgba(10,28,20,0.82)");
  g.addColorStop(1, "rgba(10,28,20,0.15)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 500);
  ctx.fillStyle = "#E2B24A";
  ctx.fillRect(48, 150, 6, 200);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#F3EBD3";
  ctx.font = '700 92px "Playfair Display"';
  ctx.fillText("Iron & Steam", 76, 248);
  ctx.fillStyle = "#E2B24A";
  ctx.font = '400 30px "Playfair Display"';
  ctx.fillText("Build the line. Move the world.", 80, 300);
  ctx.fillStyle = "rgba(243,235,211,0.75)";
  ctx.font = '400 20px "Playfair Display"';
  ctx.fillText("A railway tycoon, from steam to electric", 80, 340);
  window.drawLoco(ctx, 700, 300, 2.6);
  return c.toDataURL("image/png");
}, src);
fs.writeFileSync(
  path.join(root, "docs/store/feature-graphic.png"),
  Buffer.from(url.split(",")[1], "base64"),
);
await browser.close();
