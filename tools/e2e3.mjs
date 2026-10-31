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
  const font = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontFamily, rubik: document.fonts.check('16px "Tiny5"') }));
  const overflow = await page.evaluate(() => { const t = document.querySelector('.topbar') ?? document.querySelector('#hud'); return t ? t.scrollWidth - t.clientWidth : -1; });
  log(w, font, 'topbar overflow', overflow);
  if (!font.rubik) errors.push(`${w}: Tiny5 не завантажено`);
  if (overflow > 2) errors.push(`${w}: верхня панель вилазить на ${overflow}px`);
  await page.screenshot({ path: `${out}v12-game-${w}.png` });
  if (w === 915) {
    await page.evaluate(() => { const c = window.__app.cam; c.setZoom(0.1); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}v12-zoomout.png` });
    await page.evaluate(() => { const c = window.__app.cam; c.setZoom(4); c.focus(300, 230); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}v12-zoomin.png` });
  }
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
await page.click('[data-act="schedAll"]:last-of-type'); // гравець сам додає ще чергу, поки не вкладеться
await page.waitForTimeout(400);
const fit = await page.evaluate(async () => {
  const { plannedMW, limitMW } = await import('/src/sim/grid.ts');
  const s = window.__app.s;
  return { planned: Math.round(plannedMW(s)), limit: limitMW(s), queues: JSON.stringify(s.schedule.queues) };
});
log('fit', fit);
if (fit.planned > fit.limit) errors.push('3 черги не вклалися в ліміт');
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
  for (let i = 0; i < 40 && !(sfx.musicBufs && sfx.musicBufs.main); i++) await new Promise((r) => setTimeout(r, 250));
  return { bufs: Object.keys(sfx.musicBufs ?? {}), playing: sfx.musicSrc?.name ?? null, phase: window.__app.s.phase };
});
log('music', music);
if (!music.bufs.includes('main')) errors.push('музика не декодувалась');
if (music.playing !== 'main') errors.push('музика не грає');

// панель району з добовим профілем
await page.evaluate(() => { const a = window.__app; a.select({ kind: 'district', id: 'desnianskyi' }); });
await page.waitForTimeout(500);
await page.screenshot({ path: out + 'v13-district.png' });

// налаштування: повзунки й шрифт
await page.evaluate(() => window.__app.showPauseMenu());
await page.waitForTimeout(300);
const setRange = (key, v) => page.evaluate(([key, v]) => {
  const el = document.querySelector(`input[data-set="${key}"]`);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, [key, v]);
await setRange('musicPct', 30);
await setRange('sfxPct', 0);
await setRange('fontScale', 120);
await page.click('[data-act="setFont"][data-arg="handjet"]');
await page.waitForTimeout(600);
const st = await page.evaluate(async () => {
  const { sfx } = await import('/src/core/audio.ts');
  const p = JSON.parse(localStorage.getItem('svitlo:progress:v1'));
  return { saved: p.settings, musicVol: sfx.musicVolume, sfxOn: sfx.enabled, fs: getComputedStyle(document.documentElement).getPropertyValue('--fs'), font: getComputedStyle(document.body).fontFamily };
});
log('settings', st);
if (st.saved.musicPct !== 30 || st.saved.sfxPct !== 0 || st.saved.fontScale !== 120 || st.saved.font !== 'handjet') errors.push('налаштування не збереглися');
if (Math.abs(st.musicVol - 0.3) > 0.01 || st.sfxOn) errors.push('гучність не застосувалась');
if (!st.font.includes('Handjet') || Math.abs(Number(st.fs) - 1.25 * 1.2) > 0.01) errors.push('шрифт або розмір не застосувались');
await page.screenshot({ path: out + 'v13-pause-handjet.png' });

await browser.close();
log('errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
