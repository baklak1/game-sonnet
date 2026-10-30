// E2E: проходить меню, запускає главу, проганяє ніч атаки, робить скриншоти.
// node tools/e2e.mjs [url]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:5173/';
const out = 'tools/out/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ws://')) errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: out + 'e2e-1-menu.png' });
await page.click('[data-act="campaign"]');
await page.waitForTimeout(200);
await page.screenshot({ path: out + 'e2e-2-campaign.png' });
await page.click('[data-act="brief"][data-arg="c1"]');
await page.waitForTimeout(200);
await page.screenshot({ path: out + 'e2e-3-brief.png' });
await page.click('[data-act="start"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: out + 'e2e-4-game.png' });
// ППО
await page.click('#tb_def');
await page.waitForTimeout(300);
await page.screenshot({ path: out + 'e2e-5-adpanel.png' });
await page.click('[data-act="placeDef"][data-arg="mfg"]');
await page.waitForTimeout(200);
await page.mouse.click(300, 250);
await page.waitForTimeout(200);
await page.screenshot({ path: out + 'e2e-6-place.png' });
await page.click('[data-act="confirmMode"]');
await page.waitForTimeout(200);
// перемотати до вечора
const fps = await page.evaluate(async () => {
  const app = window.__app;
  const s = app.s;
  app.handle('tutorSkip', '');
  // штучно — до 21:20
  while (s.t < 21 * 60 + 40) { window.__sim.step(s, 0.5); }
  return true;
});
await page.waitForTimeout(2500);
await page.screenshot({ path: out + 'e2e-7-night.png' });
// прискорити до кінця хвилі
await page.evaluate(async () => {
  const { step } = window.__sim;
  const s = window.__app.s;
  let n = 0;
  while (s.phase === 'alert' && n++ < 20000) step(s, 0.2);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'e2e-8-report.png' });
await page.evaluate(() => window.__app.handle('closeModal', ''));
await page.click('#tb_grid');
await page.waitForTimeout(400);
await page.screenshot({ path: out + 'e2e-9-grid.png' });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
