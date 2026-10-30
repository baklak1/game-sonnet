// E2E-2: будівництво, ЛЕП, захист, технології, найм, збереження, безкінечний режим, підсумки, стрес FPS.
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
const log = (...a) => console.log(...a);
await page.goto(url);
await page.waitForFunction(() => window.__ready === true);
const scr = (x, y) => page.evaluate(([x, y]) => window.__app.cam.toScreen(x, y), [x, y]);
const S = () => page.evaluate(() => { const s = window.__app.s; return { money: s.money, builds: s.builds.length, lines: s.lines.length, defs: s.defs.length, crews: s.crews.length, staffP: s.staffPending.length, tech: Object.keys(s.tech).length, phase: s.phase, t: s.t }; });

// глава 3 (зима)
await page.click('[data-act="campaign"]');
await page.evaluate(() => { window.__app.progress.stars.c1 = 3; window.__app.progress.stars.c2 = 2; window.__app.showScreen('campaign', false); });
await page.click('[data-act="brief"][data-arg="c3"]');
await page.click('[data-act="start"]');
await page.waitForTimeout(800);
await page.evaluate(() => { window.__app.s.money = 900; });
log('start', await S());
// КГУ
await page.click('#tb_build');
await page.click('[data-act="placeBuild"][data-arg="kgu"]');
let [x, y] = await scr(305, 228);
await page.mouse.click(x, y);
await page.waitForTimeout(150);
await page.click('[data-act="confirmMode"]');
log('after kgu', await S());
// ЛЕП Печерськ — Лівобережна (через Дніпро)
await page.click('#tb_build');
await page.click('[data-act="buildTab"][data-arg="grid"]');
await page.click('[data-act="placeLine"][data-arg="line110"]');
[x, y] = await scr(360, 212); await page.mouse.click(x, y);
[x, y] = await scr(390, 204); await page.mouse.click(x, y);
await page.waitForTimeout(150);
await page.screenshot({ path: out + 'e2e2-1-line.png' });
await page.click('[data-act="confirmMode"]');
log('after line', await S());
// ТЕЦ-5: панель і захист
[x, y] = await scr(378, 246); await page.mouse.click(x, y);
await page.waitForTimeout(200);
await page.screenshot({ path: out + 'e2e2-2-tec5.png' });
await page.click('[data-act="protect"]');
log('after protect', await S());
// технологія
await page.click('#tb_tech');
await page.click('[data-act="research"][data-arg="searchlights"]');
// найм
await page.click('#tb_crews');
await page.click('[data-act="hireStaff"]');
await page.click('[data-act="hireCrew"][data-arg="city"]');
log('after tech/hire', await S());
await page.screenshot({ path: out + 'e2e2-3-crews.png' });
// пройти день до атаки і після
await page.evaluate(() => { const s = window.__app.s; let n = 0; while (s.t < 2 * 1440 + 23 * 60 && n++ < 100000) window.__sim.step(s, 0.5); });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__app.closeModal());
await page.screenshot({ path: out + 'e2e2-4-winter-night.png' });
// зберегти й вийти, потім продовжити
await page.evaluate(() => { const s = window.__app.s; let n = 0; while ((s.phase === 'alert' || s.threats.length) && n++ < 100000) window.__sim.step(s, 0.5); });
await page.evaluate(() => window.__app.closeModal());
await page.click('[data-act="pauseMenu"]');
await page.click('[data-act="quitToMenu"]');
await page.waitForTimeout(300);
const hasCont = await page.$('[data-act="continue"]');
log('continue button:', !!hasCont);
await page.click('[data-act="continue"]');
await page.waitForTimeout(500);
log('after continue', await S());
// підсумки
await page.evaluate(() => { const s = window.__app.s; s.over = { win: true, reason: 'Тест', stars: 2, score: 1234 }; });
await page.waitForTimeout(500);
await page.screenshot({ path: out + 'e2e2-5-results.png' });
// безкінечний режим + стрес
await page.click('[data-act="toMenu"]');
await page.click('[data-act="endlessMenu"]');
await page.click('[data-act="start"]');
await page.waitForTimeout(800);
const fps = await page.evaluate(async () => {
  const app = window.__app, s = app.s;
  s.t = 22 * 60;
  const dirs = ['N', 'NE', 'E', 'S', 'SE'];
  for (let i = 0; i < 200; i++) s.pending.push({ at: s.t + i * 0.5, type: i % 10 === 0 ? 'kh101' : 'shahed', dir: dirs[i % 5], target: '', group: 9000 + Math.floor(i / 5) });
  s.pending.sort((a, b) => a.at - b.at);
  s.speed = 2;
  await new Promise((r) => setTimeout(r, 4000));
  let frames = 0; const t0 = performance.now();
  await new Promise((r) => { const f = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  return { fps: frames / 3, threats: s.threats.length };
});
log('stress', fps);
await page.screenshot({ path: out + 'e2e2-6-stress.png' });
log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
