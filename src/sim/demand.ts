// Температура, попит, сонце, темрява.
import { B } from '../data/balance';
import { DISTRICTS, type DistrictDef } from '../data/objects';
import type { GameState, Season } from './types';

export const SUN: Record<Season, [number, number]> = {
  winter: [8 * 60, 16 * 60 + 30],
  autumn: [7 * 60, 18 * 60],
  spring: [6 * 60, 19 * 60 + 30],
  summer: [5 * 60, 21 * 60],
};

export function minuteOfDay(t: number): number {
  return ((t % 1440) + 1440) % 1440;
}

export function dayOf(t: number): number {
  return Math.floor(t / 1440) + 1;
}

export function temperature(s: GameState, t = s.t): number {
  const m = minuteOfDay(t);
  // найтепліше о 14:00, найхолодніше о 05:00
  const wave = Math.cos(((m - 14 * 60) / 1440) * Math.PI * 2) * 3;
  let mod = 0;
  for (const tm of s.tempMods) if (tm.until > t) mod += tm.d;
  return s.baseTemp + wave + mod;
}

export function dayCurve(t: number): number {
  const m = minuteOfDay(t) / 60;
  const h0 = Math.floor(m) % 24, h1 = (h0 + 1) % 24, f = m - Math.floor(m);
  return B.dayCurve[h0] * (1 - f) + B.dayCurve[h1] * f;
}

export function demandFactor(s: GameState, t = s.t): number {
  const T = temperature(s, t);
  let k = 1 + B.tempK * Math.max(0, B.tempRef - T) + B.acK * Math.max(0, T - B.acRef);
  return dayCurve(t) * k;
}

// ---------- попит районів: тип району змінює форму доби, а не загальне споживання Києва

export type DistrictType = DistrictDef['type'];

export const DTYPE: Record<DistrictType, { name: string; note: string; shape: number[]; ac: number; weekend: number; comm: number }> = {
  sleep: {
    name: 'Спальний',
    note: 'Удень порожньо — люди на роботі; пік уранці й особливо ввечері (19–22).',
    shape: [0.98, 0.98, 0.98, 0.98, 1.0, 1.05, 1.12, 1.15, 1.05, 0.88, 0.84, 0.84, 0.85, 0.85, 0.85, 0.87, 0.92, 1.02, 1.12, 1.18, 1.2, 1.18, 1.1, 1.02],
    ac: 0.85, weekend: 1.08, comm: 0.1,
  },
  center: {
    name: 'Діловий центр',
    note: 'Офіси, урядові будівлі, ТРЦ: пік з 9 до 18, уночі тихо. Кондиціонери — влітку жере більше. Більше бізнес-споживачів — більше грошей.',
    shape: [0.78, 0.76, 0.75, 0.75, 0.76, 0.8, 0.88, 1.0, 1.18, 1.28, 1.3, 1.3, 1.28, 1.28, 1.28, 1.27, 1.22, 1.12, 1.02, 0.96, 0.92, 0.88, 0.84, 0.8],
    ac: 1.5, weekend: 0.8, comm: 0.45,
  },
  mixed: {
    name: 'Змішаний',
    note: 'Житло, заводи, вокзали й ринки: попит рівніший протягом доби.',
    shape: [0.94, 0.93, 0.93, 0.93, 0.94, 0.98, 1.03, 1.06, 1.06, 1.04, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.05, 1.07, 1.08, 1.07, 1.04, 1.0, 0.96],
    ac: 1.0, weekend: 1.0, comm: 0.25,
  },
};

const DEF_BY_ID = new Map<string, DistrictDef>(DISTRICTS.map((d) => [d.id, d]));
const W_TOTAL = DISTRICTS.reduce((a, d) => a + d.pop * d.k, 0);
const WEIGHT = new Map(DISTRICTS.map((d) => [d.id, (d.pop * d.k) / W_TOTAL]));
const heatK = (d: DistrictDef) => (d.type === 'center' ? 0.8 : 0.85 + 1.3 * d.priv);
const avg = (f: (d: DistrictDef) => number) => DISTRICTS.reduce((a, d) => a + WEIGHT.get(d.id)! * f(d), 0);
const HEAT_AVG = avg(heatK);
const AC_AVG = avg((d) => DTYPE[d.type].ac);
const WEEKEND_AVG = avg((d) => DTYPE[d.type].weekend);
const COMM_AVG = avg((d) => 1 + (B.businessTariff - 1) * DTYPE[d.type].comm);
const SHAPE_NORM = Array.from({ length: 24 }, (_, h) => avg((d) => DTYPE[d.type].shape[h]));

export function districtDef(id: string): DistrictDef | undefined {
  return DEF_BY_ID.get(id);
}

/** Вихідні: 6-й і 7-й день кожного тижня гри. */
export function isWeekend(t: number): boolean {
  const d = (dayOf(t) - 1) % 7;
  return d === 5 || d === 6;
}

/** Множник попиту району відносно середнього по Києву (добова форма, мороз, спека, вихідні). */
export function districtFactor(s: GameState, id: string, t = s.t): number {
  const d = DEF_BY_ID.get(id);
  if (!d) return demandFactor(s, t);
  const ty = DTYPE[d.type];
  const m = minuteOfDay(t) / 60;
  const h0 = Math.floor(m) % 24, h1 = (h0 + 1) % 24, f = m - Math.floor(m);
  const shape = (ty.shape[h0] / SHAPE_NORM[h0]) * (1 - f) + (ty.shape[h1] / SHAPE_NORM[h1]) * f;
  const wk = isWeekend(t) ? ty.weekend / WEEKEND_AVG : 1;
  const T = temperature(s, t);
  const k = 1 + B.tempK * (heatK(d) / HEAT_AVG) * Math.max(0, B.tempRef - T) + B.acK * (ty.ac / AC_AVG) * Math.max(0, T - B.acRef);
  return dayCurve(t) * shape * wk * k;
}

/** Множник виручки з МВт·год району: бізнес-споживачі платять більше (середнє по місту = 1). */
export function districtRevenueK(id: string): number {
  const d = DEF_BY_ID.get(id);
  return d ? (1 + (B.businessTariff - 1) * DTYPE[d.type].comm) / COMM_AVG : 1;
}

export function isHeatingSeason(s: GameState): boolean {
  return temperature(s) < B.heatTemp;
}

export function solarFactor(s: GameState, t = s.t): number {
  const [rise, set] = SUN[s.season];
  const m = minuteOfDay(t);
  if (m <= rise || m >= set) return 0;
  const x = (m - rise) / (set - rise);
  const seasonK = s.season === 'summer' ? 1 : s.season === 'spring' ? 0.8 : s.season === 'autumn' ? 0.55 : 0.3;
  return Math.sin(x * Math.PI) * seasonK;
}

/** 0 — день, 1 — глибока ніч. */
export function darkness(s: GameState, t = s.t): number {
  const [rise, set] = SUN[s.season];
  const m = minuteOfDay(t);
  const tr = 70;
  if (m >= rise + tr && m <= set - tr) return 0;
  if (m > rise - tr && m < rise + tr) return 1 - (m - (rise - tr)) / (2 * tr);
  if (m > set - tr && m < set + tr) return (m - (set - tr)) / (2 * tr);
  return 1;
}

export function isPeakHour(t: number): boolean {
  const h = Math.floor(minuteOfDay(t) / 60);
  return (h >= 7 && h < 11) || (h >= 17 && h < 23);
}

export function isNightCharge(t: number): boolean {
  const h = Math.floor(minuteOfDay(t) / 60);
  return h >= 23 || h < 6;
}

export function fmtTime(t: number): string {
  const m = minuteOfDay(t);
  const hh = Math.floor(m / 60), mm = Math.floor(m % 60);
  return `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
}
