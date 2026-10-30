// Температура, попит, сонце, темрява.
import { B } from '../data/balance';
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
