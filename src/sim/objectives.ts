// Цілі глав, перемога/поразка, зірки та рахунок.
import { B, hpAvail } from '../data/balance';
import { levelById } from '../data/levels';
import type { GameState } from './types';
import { availableGen } from './grid';
import { dayStart } from './waves';

export function avgServed(s: GameState): number {
  return s.stats.hoursAcc > 0 ? s.stats.servedAcc / s.stats.hoursAcc : 1;
}

export function distributedMW(s: GameState, onlyBess = false): number {
  let mw = 0;
  for (const o of s.objs) {
    if (!o.built) continue;
    if (onlyBess ? o.kind === 'bess' : o.kind === 'kgu' || o.kind === 'gtu' || o.kind === 'ses' || o.kind === 'bess') mw += o.cap;
  }
  return mw;
}

export function genAvailable(s: GameState): number {
  let mw = 0;
  for (const o of s.objs) {
    if (o.kind === 'tpp' || o.kind === 'tes' || o.kind === 'hpp' || o.kind === 'pspp' || o.kind === 'kgu' || o.kind === 'gtu') {
      mw += o.kind === 'hpp' || o.kind === 'pspp' ? o.cap * hpAvail(o.hp, o.maxHp) : availableGen(s, o);
    }
  }
  return mw;
}

export interface GoalStatus { text: string; progress: string; ok: boolean }

export function goalStatus(s: GameState): GoalStatus {
  const L = levelById(s.levelId);
  const g = L.goal;
  switch (g.type) {
    case 'survive':
      return { text: `Дожити до ранку ${L.days + 1}-го дня, довіра не нижче ${g.minTrust}`, progress: `Довіра ${Math.round(s.trust)}`, ok: s.trust >= g.minTrust };
    case 'heat': {
      const h = s.stats.heatHours ? s.stats.heatAcc / s.stats.heatHours : 1;
      return { text: `Середнє теплопостачання ≥ ${Math.round(g.min * 100)}%`, progress: `Зараз ${Math.round(h * 100)}%`, ok: h >= g.min };
    }
    case 'protect': {
      const ok = g.ids.every((id) => {
        const o = s.objs.find((oo) => oo.id === id);
        return o && o.hp / o.maxHp >= g.min;
      });
      const names = g.ids.map((id) => s.objs.find((o) => o.id === id)?.name ?? id).join(' і ');
      return { text: `Наприкінці ${names} мають бути цілі хоча б на ${Math.round(g.min * 100)}%`, progress: ok ? 'Поки що тримаються' : 'Під загрозою!', ok };
    }
    case 'gen': {
      const mw = genAvailable(s);
      return { text: `Наприкінці мати ≥ ${g.mw} МВт робочої генерації`, progress: `Зараз ${Math.round(mw)} МВт`, ok: mw >= g.mw };
    }
    case 'avg': {
      const a = avgServed(s);
      return { text: `Середнє забезпечення світлом ≥ ${Math.round(g.min * 100)}%`, progress: `Зараз ${Math.round(a * 100)}%`, ok: a >= g.min };
    }
    case 'bess': {
      const mw = distributedMW(s, true);
      return { text: `Мати ≥ ${g.mw} МВт батарей (BESS) і вистояти`, progress: `Зараз ${mw} МВт`, ok: mw >= g.mw };
    }
    case 'distributed': {
      const mw = distributedMW(s);
      return { text: `Збудувати ≥ ${g.mw} МВт розподіленої генерації`, progress: `Зараз ${mw} МВт`, ok: mw >= g.mw };
    }
    case 'endless':
      return { text: 'Протриматися якомога довше', progress: `Відбито хвиль: ${s.stats.wavesDone}`, ok: true };
  }
}

export function stars(s: GameState): number {
  const L = levelById(s.levelId);
  const a = avgServed(s);
  let st = 1;
  if (a >= L.stars[0]) st = 2;
  if (a >= L.stars[1] && s.stats.critOutageMax <= 0) st = 3;
  return st;
}

export function score(s: GameState): number {
  return Math.round(s.stats.wavesDone * 1000 + avgServed(s) * 1000);
}

/** Перевірка кінця гри. Викликається щогодини. */
export function checkEnd(s: GameState): void {
  if (s.over) return;
  if (s.stats.blackStreak >= B.blackoutHours) {
    s.over = { win: false, reason: 'Київ у темряві: місто понад 12 годин майже повністю без світла.', stars: 0, score: score(s) };
    return;
  }
  if (s.trust <= 0) {
    s.over = { win: false, reason: 'Довіра киян вичерпана. Вас відсторонено від керування штабом.', stars: 0, score: score(s) };
    return;
  }
  if (s.mode === 'endless') return;
  const L = levelById(s.levelId);
  const end = dayStart(L.days + 1) + B.dayStartMin;
  if (s.t >= end && s.phase === 'day' && s.threats.length === 0) {
    const g = goalStatus(s);
    if (g.ok) s.over = { win: true, reason: 'Ви втримали світло в Києві!', stars: stars(s), score: score(s) };
    else s.over = { win: false, reason: `Мету не виконано: ${g.text}. ${g.progress}.`, stars: 0, score: score(s) };
  }
}
