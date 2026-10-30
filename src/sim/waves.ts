// Хвилі атак: сценарні та бюджетні (для кампанії й безкінечного режиму), прогноз розвідки.
import { B, DIFF } from '../data/balance';
import { ENDLESS_UNLOCKS, levelById, type WaveDef, type WaveGroupDef } from '../data/levels';
import { THREATS } from '../data/specs';
import { rnd, rndInt, pick } from '../core/rng';
import { dayOf, minuteOfDay } from './demand';
import type { GameState, PendingSpawn, ThreatType, WavePolicy } from './types';
import { toast } from './economy';

const DRONE_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'NW'];
const CRUISE_DIRS: Record<string, string[]> = { kh101: ['E', 'SE', 'NE'], kalibr: ['S', 'SE'] };
const BALLISTIC_DIRS = ['NE', 'N', 'S', 'E'];
const POLICIES: WavePolicy[] = ['mixed', 'generation', 'ring', 'imports', 'distribution', 'finish'];

export function dayStart(day: number): number {
  return (day - 1) * 1440;
}

export function endlessBudget(wave: number): number {
  return 25 * Math.pow(1.16, wave);
}

/** Розкладає бюджет на групи загроз. */
export function composeBudget(s: GameState, budget: number): WaveGroupDef[] {
  const allowed = s.unlocked.threats;
  const has = (t: ThreatType) => allowed.includes(t);
  const missilesAllowed = has('kh101') || has('kalibr') || has('iskander');
  const groups: WaveGroupDef[] = [];
  let droneB = missilesAllowed ? budget * (0.45 + rnd(s) * 0.15) : budget;
  let missileB = budget - droneB;

  // балістика
  if (has('iskander') && missileB > 9) {
    const ballB = missileB * (0.2 + rnd(s) * 0.15);
    let left = ballB;
    const types: ThreatType[] = ['iskander'];
    if (has('kinzhal')) types.push('kinzhal');
    if (has('zircon')) types.push('zircon');
    let at = 390 + rndInt(s, 0, 60);
    while (left >= 9) {
      const t = pick(s, types);
      const n = Math.max(1, Math.min(4, Math.floor(left / THREATS[t].cost)));
      groups.push({ at, type: t, n, dir: pick(s, BALLISTIC_DIRS), every: 1 });
      left -= n * THREATS[t].cost;
      at += rndInt(s, 5, 25);
    }
    missileB -= ballB - left;
  }
  // крилаті
  if (missileB >= 6) {
    const types: ThreatType[] = [];
    if (has('kh101')) types.push('kh101');
    if (has('kalibr')) types.push('kalibr');
    let at = 370 + rndInt(s, 0, 40);
    while (missileB >= 6 && types.length) {
      const t = pick(s, types);
      const n = Math.max(1, Math.min(5, Math.floor(missileB / THREATS[t].cost / 2) || 1));
      groups.push({ at, type: t, n, dir: pick(s, CRUISE_DIRS[t]), every: 2 });
      missileB -= n * THREATS[t].cost;
      at += rndInt(s, 10, 30);
    }
  }
  droneB += Math.max(0, missileB);
  // дрони
  let at = 20 + rndInt(s, 0, 20);
  while (droneB >= 1) {
    let t: ThreatType = 'shahed';
    const r = rnd(s);
    if (has('jet') && r < 0.12 && droneB >= 3) t = 'jet';
    else if (has('gerbera') && r < 0.4) t = 'gerbera';
    const n = Math.max(1, Math.min(8, Math.floor(rndInt(s, 3, 8))));
    const cost = THREATS[t].cost * n;
    if (cost > droneB + 0.01) {
      const nn = Math.floor(droneB / THREATS[t].cost);
      if (nn < 1) break;
      groups.push({ at, type: t, n: nn, dir: pick(s, DRONE_DIRS), every: 3 });
      break;
    }
    groups.push({ at, type: t, n, dir: pick(s, DRONE_DIRS), every: 3 });
    droneB -= cost;
    at += rndInt(s, 20, 55);
    if (at > 340) at = 30 + rndInt(s, 0, 300);
  }
  return groups;
}

export function waveForDay(s: GameState, day: number): WaveDef | null {
  if (s.mode === 'endless') {
    if (!s.waveDays.includes(day)) return null;
    const w = s.waveIndex + 1;
    return { day, budget: endlessBudget(w), policy: POLICIES[(w * 7 + day) % POLICIES.length] };
  }
  const L = levelById(s.levelId);
  return L.waves.find((w) => w.day === day) ?? null;
}

/** Готує розклад пусків на сьогоднішню ніч (викликається о 07:00/08:00). */
export function prepareDay(s: GameState): void {
  const day = dayOf(s.t);
  const w = waveForDay(s, day);
  s.forecast = null;
  if (!w) return;
  if (s.pending.some((p) => p.at >= dayStart(day))) return;
  const D = DIFF[s.difficulty];
  const start = dayStart(day) + B.alertMin;
  s.alertStart = start;
  let groups: WaveGroupDef[];
  if (w.groups) {
    groups = w.groups.map((g) => ({ ...g, n: Math.max(1, Math.round(g.n * (g.target ? Math.min(1, D.budget + 0.2) : D.budget))) }));
  } else {
    groups = composeBudget(s, (w.budget ?? 30) * D.budget);
  }
  let gid = (s.flags.groupSeq ?? 0) + 1;
  const pend: PendingSpawn[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.n; i++) {
      pend.push({ at: start + g.at + i * (g.every ?? 2), type: g.type, dir: g.dir, target: g.target ?? '', group: gid });
    }
    gid++;
  }
  // розвідник увечері
  if (s.unlocked.threats.includes('recon') && rnd(s) < 0.65) {
    pend.push({ at: start - 200 + rndInt(s, 0, 90), type: 'recon', dir: pick(s, DRONE_DIRS), target: 'recon', group: gid++ });
  }
  s.flags.groupSeq = gid;
  pend.sort((a, b) => a.at - b.at);
  s.pending.push(...pend);
  s.flags.wavePolicy = POLICIES.indexOf(w.policy ?? 'mixed');
  s.flags.waveDay = day;

  // прогноз
  let drones = 0, missiles = 0, ballistic = 0;
  const dirs = new Set<string>();
  for (const p of pend) {
    const cls = THREATS[p.type].cls;
    if (p.type === 'recon') continue;
    if (cls === 'drone') drones++;
    else if (cls === 'cruise') missiles++;
    else ballistic++;
    dirs.add(p.dir);
  }
  const err = D.intelErr;
  if (err >= 0) {
    const f = (n: number) => Math.max(0, Math.round(n * (1 + (rnd(s) * 2 - 1) * err)));
    s.forecast = {
      drones: f(drones), missiles: f(missiles), ballistic: f(ballistic),
      dirs: err >= 0.5 ? [] : [...dirs], policy: w.policy ?? 'mixed', day,
    };
  } else {
    s.forecast = { drones: -1, missiles: -1, ballistic: -1, dirs: [], policy: w.policy ?? 'mixed', day };
  }
}

/** Безкінечний режим: після хвилі планує наступну й відкриває нове. */
export function endlessAfterWave(s: GameState): void {
  const w = s.stats.wavesDone;
  const startedDay = dayOf(s.t) - (minuteOfDay(s.t) < 12 * 60 ? 1 : 0);
  const gap = w < 4 ? 2 : w < 12 ? (rnd(s) < 0.5 ? 1 : 2) : 1;
  s.waveDays.push(startedDay + gap);
  for (const u of ENDLESS_UNLOCKS) {
    if (u.wave !== w + 1) continue;
    if (u.threats) for (const t of u.threats) if (!s.unlocked.threats.includes(t)) s.unlocked.threats.push(t);
    if (u.defs) for (const d of u.defs) if (!s.unlocked.defs.includes(d)) s.unlocked.defs.push(d);
    if (u.prot) s.unlocked.prot = Math.max(s.unlocked.prot, u.prot);
    if (u.techs) for (const t of u.techs) if (!s.unlocked.techs.includes(t)) s.unlocked.techs.push(t);
    toast(s, u.text, 'warn');
  }
}
