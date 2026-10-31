// E2E-3 (v1.2): шрифт на різних екранах, вкладка «Графіки», екстрене відключення, музика.
// node tools/e2e3.mjs [url]   (потрібен dev-сервер vite)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:5173/';
const out = 'tools/out/';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const log = (...a) => console.log(...a);

async function open(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${w}: pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ws://')) errors.push(`${w}: console: ${m.text()}`); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  return page;
}

// шрифт: меню й гра на трьох ширинах; перевірка, що верхня панель не вилазить
for (const [w, h] of [[740, 360], [915, 412], [1280, 720]]) {
  const page = await open(w, h);
  await page.screenshot({ path: `${out}v12-menu-${w}.png` });
  await page.click('[data-act="campaign"]');
  await page.click('[data-act="brief"][data-arg="c1"]');
  await page.click('[data-act="start"]');
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__app.handle('tutorSkip', ''));
  await page.waitForTimeout(300);
  const font = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontFamily, rubik: document.fonts.check('600 12px "Rubik"') }));
  const overflow = await page.evaluate(() => { const t = document.querySelector('.topbar') ?? document.querySelector('#hud'); return t ? t.scrollWidth - t.clientWidth : -1; });
  log(w, font, 'topbar overflow', overflow);
  if (!font.rubik) errors.push(`${w}: Rubik не завантажено`);
  if (overflow > 2) errors.push(`${w}: верхня панель вилазить на ${overflow}px`);
  await page.screenshot({ path: `${out}v12-game-${w}.png` });
  await page.context().close();
}

// графіки й екстрені відключення
const page = await open(915, 412);
await page.click('[data-act="campaign"]');
await page.click('[data-act="brief"][data-arg="c1"]');
await page.click('[data-act="start"]');
await page.waitForTimeout(900);
await page.evaluate(() => window.__app.handle('tutorSkip', ''));
// наказ Укренерго
await page.evaluate(() => { const s = window.__app.s; s.flags.limitMW = 700; s.flags.limitUntil = s.t + 600; s.gridDirty = true; });
await page.click('#tb_sched');
await page.waitForTimeout(400);
await page.screenshot({ path: out + 'v12-sched-auto.png' });
await page.click('[data-act="schedAll"]:last-of-type');
await page.click('[data-act="schedAll"]:last-of-type');
await page.waitForTimeout(400);
const q = await page.evaluate(() => ({ ...window.__app.s.schedule }));
log('schedule after +2', q.mode, JSON.stringify(q.queues));
if (q.mode !== 'manual' || Object.values(q.queues).some((k) => k !== 2)) errors.push('«Для всього Києва» не виставило 2 черги');
await page.click('[data-act="schedFit"]');
await page.waitForTimeout(400);
const fit = await page.evaluate(async () => {
  const { plannedMW, limitMW } = await import('/src/sim/grid.ts');
  const s = window.__app.s;
  return { planned: Math.round(plannedMW(s)), limit: limitMW(s), queues: JSON.stringify(s.schedule.queues) };
});
log('fit', fit);
if (fit.planned > fit.limit) errors.push('«Підібрати під ліміт» не вклалося');
await page.screenshot({ path: out + 'v12-sched-manual.png' });
// екстрено вимкнути Оболонь
await page.click('[data-act="emerg"][data-arg="obolonskyi"]');
await page.evaluate(() => { const s = window.__app.s; while (s.t < 22 * 60 + 30) window.__sim.step(s, 0.5); });
await page.waitForTimeout(1500);
const ob = await page.evaluate(() => { const d = window.__app.s.districts.find((dd) => dd.id === 'obolonskyi'); return { frac: d.frac, off: window.__app.s.emergencyOff }; });
log('obolon', ob);
if (ob.frac > 0.01) errors.push('екстрено вимкнений район під напругою');
await page.evaluate(() => window.__app.handle('panel', 'sched'));
await page.waitForTimeout(300);
await page.evaluate(() => window.__app.handle('panel', 'sched'));
await page.waitForTimeout(800);
await page.screenshot({ path: out + 'v12-emergency-night.png' });
await page.evaluate(() => { const app = window.__app; app.handle('panel', 'sched'); const d = app.s.districts.find((dd) => dd.id === 'obolonskyi'); app.cam.focus(d.cx, d.cy); });
await page.waitForTimeout(800);
await page.screenshot({ path: out + 'v12-emergency-obolon.png' });
const sch = await page.evaluate(() => ({ mode: window.__app.s.schedule.mode, lim: window.__app.s.flags.limitUntil }));
log('schedule after order expiry', sch);
if (sch.mode !== 'auto') errors.push('ручний графік не знявся після завершення наказу');

// музика: після тапу декодується й грає тривожний трек під час атаки
const music = await page.evaluate(async () => {
  const { sfx } = await import('/src/core/audio.ts');
  for (let i = 0; i < 40 && !(sfx.musicBufs && sfx.musicBufs.alert); i++) await new Promise((r) => setTimeout(r, 250));
  return { bufs: Object.keys(sfx.musicBufs ?? {}), playing: sfx.musicSrc?.name ?? null, phase: window.__app.s.phase };
});
log('music', music);
if (music.bufs.length < 2) errors.push('музика не декодувалась');
if (music.phase === 'alert' && music.playing !== 'alert') errors.push('під час тривоги не грає тривожний трек');

await browser.close();
log('errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
