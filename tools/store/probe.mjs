import { launch, openBusyGame } from "./lib.mjs";
const b = await launch();
const { page } = await openBusyGame(b, { width: 960, height: 540 }, 2);
console.log(await page.evaluate(() => JSON.stringify({c: window.__game.camera.getCenter(), z: window.__game.camera.getZoom(), st: window.__game.getStations().slice(0,5).map(s=>[s.x,s.y,s.type]), w: window.__game.getMap().width, tr: window.__game.getTrains().slice(0,3).map(t=>[t.x,t.y,t.renderX,t.renderY])})));
await b.close();
