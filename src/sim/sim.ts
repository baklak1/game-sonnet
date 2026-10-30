// Головний крок симуляції. Час гри йде з різною швидкістю: спокій — швидко, бій — повільно.
import { B } from '../data/balance';
import { levelById } from '../data/levels';
import { DEFS } from '../data/specs';
import { dayOf, minuteOfDay } from './demand';
import type { Difficulty, GameState } from './types';
import { createState, makeDefense, objById } from './init';
import { chooseTarget, spawnThreat } from './enemy';
import { combatStep, reloadAll } from './combat';
import { dispatch, updateHeat } from './grid';
import { dailyCosts, economyTick, hourly, processDeliveries, toast, news } from './economy';
import { crewsStep } from './crews';
import { moveDefs, processBuilds } from './actions';
import { dailyEvents, SCRIPTED, ukrLimit } from './events';
import { rnd } from '../core/rng';
import { checkEnd } from './objectives';
import { endlessAfterWave, prepareDay, waveForDay } from './waves';
import { avgServed } from './objectives';

export function newGame(levelId: string, difficulty: Difficulty, seed = (Math.random() * 1e9) | 0): GameState {
  const s = createState(levelId, difficulty, seed);
  morningGifts(s, 1);
  const L = levelById(levelId);
  toast(s, `${L.period}. ${L.title}`, 'info');
  return s;
}

function morningGifts(s: GameState, day: number): void {
  const L = levelById(s.levelId);
  for (const g of L.gifts ?? []) {
    if (g.day !== day) continue;
    const d = makeDefense(s, g.def, g.x, g.y, true);
    d.policy = 'smart';
    s.defs.push(d);
    toast(s, g.text, 'good');
    news(s, `${DEFS[g.def].name}: новий комплекс захищає небо Києва`);
  }
}

export function timeScale(s: GameState): number {
  if (s.threats.length > 0 || s.projs.length > 0) return B.scaleTactical;
  if (s.phase === 'alert') return B.scaleAlertIdle;
  if (s.flags.skip) return B.scaleDay * 6;
  return B.scaleDay;
}

export function step(s: GameState, dtReal: number): void {
  if (s.over || s.paused || s.choice) return;
  let left = dtReal;
  let guard = 0;
  while (left > 1e-6 && guard++ < 400) {
    const scale = timeScale(s);
    const busy = s.threats.length > 0 || s.projs.length > 0;
    const maxChunk = busy ? 0.25 : 2;
    const dtGame = Math.min(left * scale, maxChunk);
    stepGame(s, dtGame);
    left -= dtGame / scale;
    if (s.over || s.choice) break;
  }
}

function startAlert(s: GameState): void {
  s.phase = 'alert';
  s.waveStats = { launched: 0, downed: 0, hits: 0, missilesSpent: 0, adCost: 0, mwLost: 0 };
  s.fx.push({ t: 'siren', on: true });
  reloadAll(s);
  const w = waveForDay(s, dayOf(s.t));
  toast(s, `Повітряна тривога!${w?.title ? ' ' + w.title + '.' : ''} Ворог атакує енергетику.`, 'bad');
  s.flags.skip = 0;
}

function endAlert(s: GameState): void {
  s.phase = 'day';
  s.fx.push({ t: 'siren', on: false });
  const day = (s.flags.waveDay as number) || dayOf(s.t);
  if (s.waveStats) s.lastWaveReport = { ...s.waveStats, day };
  s.stats.wavesDone++;
  s.waveIndex++;
  toast(s, 'Відбій тривоги. Час рахувати збитки й відновлювати.', 'info');
  s.flags.quickCheckAt = s.t + 240;
  reloadAll(s);
  const w = s.mode === 'campaign' ? levelById(s.levelId).waves.find((ww) => ww.day === day) : null;
  if (w?.after) SCRIPTED[w.after]?.(s);
  else if (rnd(s) < 0.45) ukrLimit(s, 0.72 + rnd(s) * 0.18, 12 + Math.floor(rnd(s) * 18));
  if (s.mode === 'endless') endlessAfterWave(s);
  s.waveStats = null;
}

function onHour(s: GameState, tHour: number): void {
  const m = minuteOfDay(tHour);
  hourly(s);
  processDeliveries(s);
  s.tempMods = s.tempMods.filter((t) => t.until > s.t);
  s.importMods = s.importMods.filter((t) => t.until > s.t);
  if (s.flags.promiseAt && s.t >= s.flags.promiseAt) {
    const frac = s.demandTotal > 0 ? s.servedTotal / s.demandTotal : 1;
    if (frac < 0.9) {
      s.trust = Math.max(0, s.trust - 8);
      toast(s, 'Обіцянку світла не виконано. Кияни це запамʼятали: довіра −8', 'bad');
    }
    s.flags.promiseAt = 0;
  }
  if (s.flags.quickCheckAt && s.t >= s.flags.quickCheckAt) {
    const frac = s.demandTotal > 0 ? s.servedTotal / s.demandTotal : 1;
    if (frac >= 0.9) {
      s.trust = Math.min(100, s.trust + B.trustQuick);
      toast(s, 'Світло швидко повернули після атаки: довіра +3', 'good');
    }
    s.flags.quickCheckAt = 0;
  }
  if (m === 0) {
    s.flags.hppLeft = 440 * B.hppDailyHours;
    s.lastDay = dayOf(tHour);
  }
  if (m === 7 * 60) {
    prepareDay(s);
    morningGifts(s, dayOf(tHour));
    s.flags.autosave = 1;
  }
  if (m === 8 * 60) {
    dailyCosts(s);
    if ((s.flags.repairSpend ?? 0) > 1) {
      s.compensation.push({ amount: (s.flags.repairSpend ?? 0) * B.compensationShare, at: s.t + B.compensationDelayMin });
      s.flags.repairSpend = 0;
    }
    dailyEvents(s);
  }
  checkEnd(s);
}

export function stepGame(s: GameState, dt: number): void {
  const prevT = s.t;
  s.t += dt;
  // годинні межі
  const h0 = Math.floor(prevT / 60), h1 = Math.floor(s.t / 60);
  for (let h = h0 + 1; h <= h1; h++) {
    onHour(s, h * 60);
    if (s.over) return;
  }
  if (s.flags.skip && (minuteOfDay(s.t) >= 20 * 60 + 50 || s.threats.length)) s.flags.skip = 0;

  // пуски
  while (s.pending.length && s.pending[0].at <= s.t) {
    const p = s.pending.shift()!;
    if (!p.target) {
      p.target = chooseTarget(s, p.type);
      for (const q of s.pending) if (q.group === p.group && !q.target) q.target = p.target;
    }
    if (p.type !== 'recon' && s.phase === 'day') startAlert(s);
    if (p.type === 'recon') {
      toast(s, 'Увага! Над Київщиною ворожий розвідувальний БпЛА.', 'warn');
      s.fx.push({ t: 'sound', s: 'alarm' });
    }
    spawnThreat(s, p.type, p.dir, p.target);
  }

  if (s.threats.length || s.projs.length) combatStep(s, dt * B.csPerMin);

  if (s.phase === 'alert' && !s.pending.length && !s.threats.length && !s.projs.length) endAlert(s);

  // накопичувачі та вода ГЕС
  const hrs = dt / 60;
  for (const o of s.objs) {
    if ((o.kind === 'pspp' || o.kind === 'bess') && o.socMax) {
      const before = o.soc ?? 0;
      o.soc = Math.max(0, Math.min(o.socMax, before - o.out * hrs));
      if ((before > 0.5 && o.soc <= 0.5) || (before < o.socMax - 0.5 && o.soc >= o.socMax - 0.5)) s.gridDirty = true;
    } else if (o.kind === 'hpp' && o.out > 0) {
      const before = s.flags.hppLeft ?? 0;
      s.flags.hppLeft = Math.max(0, before - o.out * hrs);
      if (before > 1 && s.flags.hppLeft <= 1) s.gridDirty = true;
    }
  }

  if (s.gridDirty || s.t - s.lastDispatch >= B.dispatchEveryMin) {
    dispatch(s);
    updateHeat(s);
  }
  economyTick(s, dt);
  crewsStep(s, dt);
  moveDefs(s, dt);
  processBuilds(s);
  if (s.fx.length > 600) s.fx.splice(0, s.fx.length - 600);
}

export function skipToEvening(s: GameState): void {
  if (s.threats.length || s.phase === 'alert') return;
  s.flags.skip = 1;
}

export function liveSummary(s: GameState) {
  const frac = s.demandTotal > 0 ? s.servedTotal / s.demandTotal : 1;
  return { frac, avg: avgServed(s) };
}

export { objById };
