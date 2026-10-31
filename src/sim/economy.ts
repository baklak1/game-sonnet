// Гроші, довіра, критичні споживачі, блекаут. Тік — кожен крок, підсумки — щогодини та щодня.
import { B, DIFF } from '../data/balance';
import { CREWS, DEFS } from '../data/specs';
import { isHeatingSeason } from './demand';
import { limitMW, metroFactor as metroFactorNow, plannedMW } from './grid';
import type { GameState } from './types';
import { crewPeople } from './init';

const GEN_COST_KEY: Record<string, string> = { tpp: 'tpp', tes: 'tes', kgu: 'kgu', gtu: 'gtu', sub750: 'import', import: 'edge', hpp: 'hppPeak' };

export function toast(s: GameState, text: string, kind: 'info' | 'bad' | 'good' | 'warn' = 'info', obj?: string): void {
  s.toasts.push({ text, kind, obj });
  if (s.toasts.length > 30) s.toasts.splice(0, s.toasts.length - 30);
}

export function news(s: GameState, text: string): void {
  s.news.push(text);
  if (s.news.length > 20) s.news.splice(0, s.news.length - 20);
}

/** Запланована частка району: за ручним графіком або знімок поточної години. */
export function planFor(s: GameState, id: string, frac: number): number {
  if (s.emergencyOff.includes(id)) return s.schedule.mode === 'manual' ? 1 - (s.schedule.queues[id] ?? 0) / 6 : 1;
  if (s.schedule.mode === 'manual') return 1 - (s.schedule.queues[id] ?? 0) / 6;
  return frac;
}

export function collection(s: GameState): number {
  return B.collectBase + (1 - B.collectBase) * (s.trust / 100);
}

export function economyTick(s: GameState, dtMin: number): void {
  const h = dtMin / 60;
  const D = DIFF[s.difficulty];
  const homes = Math.max(0, s.servedTotal - s.industryServed);
  const revenue = (homes * collection(s) + s.industryServed * B.businessTariff) * h * B.tariff * D.income;
  let fuel = 0;
  for (const o of s.objs) {
    if (o.out <= 0) continue;
    const key = GEN_COST_KEY[o.kind];
    if (!key) continue;
    const c = Math.max(0, B.genCost[key]);
    fuel += o.out * h * c * B.fuelK;
  }
  s.money += revenue - fuel;
  for (const d of s.districts) {
    d.accFrac += d.frac * dtMin;
    d.accEmerg += Math.max(0, d.plan - d.frac) * dtMin;
    d.accMin += dtMin;
  }
}

/** Щогодинні підсумки: довіра, дизель критичних споживачів, блекаут, статистика. */
export function hourly(s: GameState): void {
  const D = DIFF[s.difficulty];
  let good = 0, bad = 0;
  let popAll = 0, servedW = 0, heatW = 0;
  const pnK = s.tech.pn2 ? 1.5 : 1;
  for (const d of s.districts) {
    const m = Math.max(1, d.accMin);
    const frac = d.accFrac / m;
    const emerg = Math.min(1 - frac, d.accEmerg / m);
    const planned = Math.max(0, 1 - frac - emerg);
    const mit = Math.min(3, d.pn) * B.pnMitigation * pnK;
    const w = d.pop;
    popAll += w;
    servedW += frac * w;
    heatW += d.noHeat * w;
    const autoK = s.schedule.mode === 'auto' && (s.flags.limitUntil ?? 0) > s.t ? 1.1 : 1;
    const emergK = s.emergencyOff.includes(d.id) && (s.phase === 'alert' || s.threats.length) ? 0.5 : 1;
    bad += w * (B.trustPlanned * planned * (1 - mit) * autoK + B.trustEmerg * emerg * (1 - 0.5 * mit) * (s.tech.ufls ? 0.5 : 1) * emergK);
    d.accFrac = 0;
    d.accEmerg = 0;
    d.accMin = 0;
    d.plan = planFor(s, d.id, d.frac);
  }
  const S = servedW / popAll;
  bad /= popAll;
  if (S >= 0.95) good += B.trustGood;
  if (s.trust < 45 && S >= 0.8) good += 0.08;
  const heating = isHeatingSeason(s);
  if (heating) {
    bad += B.trustHeat * (heatW / popAll);
    s.stats.heatAcc += 1 - heatW / popAll;
    s.stats.heatHours += 1;
  }

  // критичні споживачі та дизель
  let critOff = 0;
  for (const o of s.objs) {
    if (o.kind !== 'crit') continue;
    const need = o.cap * 0.9;
    if ((o.critServed ?? 0) >= need) {
      o.backupLeft = Math.min(6, (o.backupLeft ?? 6) + 1);
    } else if ((o.backupLeft ?? 0) > 0) {
      o.backupLeft = (o.backupLeft ?? 0) - 1;
      if (o.backupLeft === 0) toast(s, `${o.name}: закінчилося пальне в генераторах!`, 'bad', o.id);
    } else critOff++;
  }
  bad += B.trustCrit * critOff;
  // метро: зупинені лінії злять киян (у години роботи)
  const mHour = Math.floor((((s.t % 1440) + 1440) % 1440) / 60);
  if (mHour >= 6) {
    let need = 0, got = 0;
    for (const o of s.objs) if (o.kind === 'metro') { need += o.cap; got += Math.min(o.cap, (o.critServed ?? 0) / Math.max(0.2, metroFactorNow(s.t))); }
    if (need > 0) bad += B.trustMetro * Math.max(0, 1 - got / need);
  }
  if (critOff > 0) {
    s.stats.critOutage++;
    s.stats.critOutageMax = Math.max(s.stats.critOutageMax, s.stats.critOutage);
  } else s.stats.critOutage = 0;

  s.trust = Math.max(0, Math.min(100, s.trust + good - bad * D.trustLoss));
  s.stats.minTrust = Math.min(s.stats.minTrust, s.trust);
  s.stats.servedAcc += S;
  s.stats.hoursAcc += 1;

  const totalFrac = s.demandTotal > 0 ? s.servedTotal / s.demandTotal : 1;
  if (totalFrac < B.blackoutFrac) {
    s.stats.blackStreak++;
    s.stats.blackStreakMax = Math.max(s.stats.blackStreakMax, s.stats.blackStreak);
    if (s.stats.blackStreak === 6) toast(s, 'Київ майже повністю знеструмлено вже 6 годин! Ще 6 — і кінець.', 'bad');
  } else s.stats.blackStreak = 0;

  // наказ Укренерго закінчився — ручний графік знімається, щоб не тримати місто без світла даремно
  if (s.flags.limitUntil !== undefined && s.flags.limitUntil <= s.t) {
    delete s.flags.limitUntil;
    delete s.flags.limitMW;
    if (s.schedule.mode === 'manual' && Object.values(s.schedule.queues).some((k) => k > 0)) {
      for (const id of Object.keys(s.schedule.queues)) s.schedule.queues[id] = 0;
      s.schedule.mode = 'auto';
      s.gridDirty = true;
      toast(s, 'Наказ Укренерго завершився: ручний графік знято, мережа знову на автоматі.', 'good', '#sched');
    }
  }

  // порушення ліміту Укренерго в ручному режимі
  if (s.schedule.mode === 'manual' && (s.flags.limitUntil ?? 0) > s.t && plannedMW(s) > limitMW(s) * 1.02) {
    s.money = Math.max(0, s.money - 2);
    toast(s, `Перевищено ліміт Укренерго на ${Math.round(plannedMW(s) - limitMW(s))} МВт: застосовано ГАВ і штраф 2 млн. Посильте графік!`, 'bad', '#sched');
  }

  // пожежі (у екстрено знеструмлених районах підстанції без навантаження горять слабше)
  const fireMul = s.tech.firefight ? 0.5 : 1;
  for (const o of s.objs) {
    if (o.fireUntil > s.t) {
      const unloaded = o.district && s.emergencyOff.includes(o.district) ? 0.5 : 1;
      o.hp = Math.max(0, o.hp - B.fireDmgPerHour * fireMul * unloaded);
      s.gridDirty = true;
    }
  }
}

export function dailyCosts(s: GameState): void {
  const D = DIFF[s.difficulty];
  let cost = crewPeople(s) * B.salary + s.crews.length * B.vehicleUpkeep;
  const idleStaff = Math.max(0, s.staff - crewPeople(s));
  cost += idleStaff * B.salary * 0.5;
  for (const d of s.defs) cost += DEFS[d.type].upkeep;
  const grant = B.grantBase * (0.5 + s.trust / 100) * D.income;
  s.money += grant;
  if (s.money >= cost) {
    s.money -= cost;
    if (s.salaryLate) toast(s, 'Зарплати виплачено. Бригади знову працюють на повну.', 'good');
    s.salaryLate = false;
  } else {
    s.money = 0;
    s.salaryLate = true;
    s.trust = Math.max(0, s.trust - 2);
    toast(s, 'Затримка зарплат! Бригади працюють на 30% повільніше.', 'bad');
  }
  toast(s, `Ранок: грант +${grant.toFixed(1)} млн, зарплати й утримання −${cost.toFixed(1)} млн`, 'info');
}

export function processDeliveries(s: GameState): void {
  for (const p of s.staffPending.filter((p) => p.at <= s.t)) {
    s.staff += p.n;
    toast(s, `До штату приєдналися ${p.n} енергетиків`, 'good');
  }
  s.staffPending = s.staffPending.filter((p) => p.at > s.t);
  for (const d of s.trDeliveries.filter((d) => d.at <= s.t)) {
    s.transformers += d.n;
    toast(s, `Доставлено трансформатор (${d.n})`, 'good');
  }
  s.trDeliveries = s.trDeliveries.filter((d) => d.at > s.t);
  for (const c of s.compensation.filter((c) => c.at <= s.t)) {
    s.money += c.amount;
    toast(s, `Фонд підтримки енергетики компенсував ${c.amount.toFixed(1)} млн`, 'good');
  }
  s.compensation = s.compensation.filter((c) => c.at > s.t);
}

export function freeStaff(s: GameState): number {
  return s.staff - crewPeople(s);
}

export function hireCost(type: keyof typeof CREWS): number {
  return CREWS[type].hire;
}
