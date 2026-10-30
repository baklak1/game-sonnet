// Швидкий скриншот сторінки через встановлений Playwright: node tools/shot.mjs <url> <out.png> [w h]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [url, out, w = '1280', h = '1152'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('console:', m.type(), m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
await page.screenshot({ path: out });
await browser.close();
