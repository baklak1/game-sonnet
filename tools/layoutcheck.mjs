// Проверка вёрстки: для каждого шрифта и ширины экрана открывает все панели, меню паузы, настройки
// и ищет элементы, у которых содержимое шире блока или вылезает за экран.
// node tools/layoutcheck.mjs [url] [fontId|all] [shots]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:5173/';
const only = process.argv[3] || 'all';
const shots = process.argv[4] === 'shots';
const SCALE = Number(process.argv[5] || 100);
const FONTS = ['tiny5', 'ps2p', 'handjet', 'pixelify', 'jetbrains', 'rubik', 'system'];
const SIZES = [[640, 360], [740, 360], [915, 412], [1280, 720]];
const out = 'tools/out/layout/';
require('node:fs').mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let total = 0;

const probe = () => {
  const bad = [];
  const vw = innerWidth, vh = innerHeight;
  const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} «${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}»`;
  for (const el of document.querySelectorAll('#ui *, #screen *, #modal *')) {
    if (el.closest('#ticker') || el.closest('.hidden') || el.tagName === 'IMG' || el.tagName === 'INPUT' || el.tagName === 'CANVAS') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    // прокручиваемые контейнеры по вертикали — норма
    const scrollY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !(scrollY && el.scrollWidth <= el.clientWidth + 1)) bad.push(`шире блока на ${el.scrollWidth - el.clientWidth}px: ${desc(el)}`);
    if (el.closest('#screen') || el.closest('#modal .box') || el.closest('#panel')) continue; // эти прокручиваются
    if (r.right > vw + 1 || r.bottom > vh + 1) bad.push(`за экраном (${Math.round(r.right)}×${Math.round(r.bottom)}): ${desc(el)}`);
  }
  // короткие значения не должны переноситься на вторую строку
  for (const el of document.querySelectorAll('.row > span:last-child, .row > b:last-child, .stat, .price, .tag, button')) {
    if (el.closest('.hidden') || el.closest('#ticker') || el.closest('.fontpick')) continue;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 22) continue;
    if (el.querySelector('img, small, br, button')) continue;
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const tops = new Set([...rg.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top / 4)));
    if (tops.size > 1) bad.push(`переносится: ${desc(el)}`);
  }
  // шапка: все элементы должны помещаться
  const tb = document.querySelector('#topbar');
  if (tb && !tb.closest('.hidden')) {
    const R = tb.getBoundingClientRect();
    for (const c of tb.querySelectorAll('*')) {
      const r = c.getBoundingClientRect();
      if (r.width && r.right > R.right + 1) { bad.push(`шапка обрезает: ${desc(c)}`); break; }
    }
  }
  return [...new Set(bad)];
};

for (const fid of FONTS) {
  if (only !== 'all' && only !== fid) continue;
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.addInitScript((f) => {
      try { localStorage.setItem('svitlo:progress:v1', JSON.stringify({ stars: { c1: 3, c2: 3, c3: 3, c4: 3, c5: 3, c6: 3, c7: 3, c8: 3, c9: 3 }, diffDone: {}, best: {}, bestWaves: {}, tutorialDone: true, settings: { font: f[0], fontScale: f[1] } })); } catch {}
    }, [fid, SCALE]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    const report = {};
    const check = async (name) => {
      await page.waitForTimeout(150);
      const b = await page.evaluate(probe);
      if (b.length) report[name] = b;
      if (shots) await page.screenshot({ path: `${out}${fid}-${w}-${name}.png` });
    };
    await check('menu');
    await page.click('[data-act="settings"]').catch(() => page.evaluate(() => window.__app.showScreen('settings')));
    await check('settings');
    await page.evaluate(() => window.__app.showScreen('campaign', false));
    await check('campaign');
    await page.click('[data-act="brief"][data-arg="c9"]');
    await check('brief');
    await page.click('[data-act="start"]');
    await page.waitForFunction(() => window.__app.s, null, { timeout: 5000 }).catch(() => page.evaluate(() => window.__app.handle('start', 'c9')));
    await page.waitForFunction(() => window.__app.s, null, { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const a = window.__app; if (!a.s) a.handle('start', 'c9'); });
    await page.waitForFunction(() => window.__app.s, null, { timeout: 5000 });
    await page.evaluate(() => { const a = window.__app; a.handle('tutorSkip', ''); a.s.money = 9999; a.s.toasts.length = 0; });
    await check('game');
    for (const p of ['build', 'def', 'crews', 'grid', 'sched', 'tech', 'hq']) {
      await page.evaluate((p) => { const a = window.__app; a.panel = null; a.handle('panel', p); }, p);
      await check('panel-' + p);
      if (p === 'build') for (const tab of ['grid', 'sup']) {
        await page.evaluate((t) => window.__app.handle('buildTab', t), tab);
        await check('panel-build-' + tab);
      }
    }
    await page.evaluate(() => { const a = window.__app; a.panel = null; a.handle('panel', 'hq'); a.handle('panel', 'hq'); a.select({ kind: 'obj', id: a.s.objs.find((o) => o.kind === 'tpp').id }); });
    await check('obj');
    await page.evaluate(() => { const a = window.__app; a.select({ kind: 'district', id: a.s.districts[0].id }); });
    await check('district');
    await page.evaluate(() => window.__app.showPauseMenu());
    await check('pause');
    const n = Object.values(report).reduce((a, b) => a + b.length, 0);
    total += n;
    console.log(`\n=== ${fid}@${SCALE}% ${w}×${h}: ${n ? n + ' проблем' : 'ок'}${errs.length ? ' ОШИБКИ: ' + errs.join('; ') : ''}`);
    for (const [k, v] of Object.entries(report)) for (const x of v.slice(0, 6)) console.log(`  [${k}] ${x}`);
    await ctx.close();
  }
}
await browser.close();
console.log('\nвсего проблем:', total);
