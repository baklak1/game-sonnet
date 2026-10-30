// Скриншоти мапи в грі: node tools/mapshot.mjs [url] [level] [зум] [x y] [ніч 0/1] [out]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [url = 'http://localhost:5173/', level = 'c1', zoom = '3', x = '350', y = '205', night = '0', out = 'tools/out/map.png'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(([level, zoom, x, y, night]) => {
  const app = window.__app;
  app.progress.tutorialDone = true;
  app.chosenDiff = 'normal';
  app.startLevel(level);
  app.s.paused = true;
  if (night === '1') app.s.t = 23 * 60;
  app.cam.zoom = Number(zoom);
  app.cam.focus(Number(x), Number(y));
  app.cam.setZoom(Number(zoom));
  document.getElementById('toasts').innerHTML = '';
}, [level, zoom, x, y, night]);
await page.waitForTimeout(800);
await page.screenshot({ path: out });
await browser.close();
