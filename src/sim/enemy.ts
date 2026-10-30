// Штучний інтелект ворога: вибір цілей і маршрути з обходом відомої ППО.
import { SPAWNS } from '../data/mapData';
import { DEFS, THREATS } from '../data/specs';
import { DIFF } from '../data/balance';
import { rnd, rndRange } from '../core/rng';
import { W, H } from './geo';
import type { GameState, PObj, Threat, ThreatType, WavePolicy } from './types';
import { newId, objById } from './init';
import { availableGen, objAvail } from './grid';

const POLICIES: WavePolicy[] = ['mixed', 'generation', 'ring', 'imports', 'distribution', 'finish'];

const TARGETABLE = new Set(['tpp', 'tes', 'hpp', 'pspp', 'sub750', 'sub330', 'sub110', 'kgu', 'gtu', 'bess', 'ses', 'decoy', 'import']);

export function spawnPoint(s: GameState, dir: string): [number, number] {
  const seg = SPAWNS[dir] ?? SPAWNS.N;
  const t = rnd(s);
  return [seg[0] + (seg[2] - seg[0]) * t, seg[1] + (seg[3] - seg[1]) * t];
}

function objValue(s: GameState, o: PObj, policy: WavePolicy, cls: string, intelFresh: boolean): number {
  if (!o.built || !TARGETABLE.has(o.kind)) return 0;
  const f = o.hp / o.maxHp;
  let v = 0;
  switch (o.kind) {
    case 'tpp': case 'tes': case 'hpp': case 'pspp': v = 90 + o.cap * 0.12 * Math.max(0.3, objAvail(o)) + availableGen(s, o) * 0.08; break;
    case 'sub750': v = 200 + o.out * 0.4; break;
    case 'sub330': v = 90 + o.out * 0.35; break;
    case 'sub110': v = 60 + o.out * 0.7; break;
    case 'import': v = 30; break;
    case 'bess': v = 90; break;
    case 'kgu': case 'gtu': v = 25 + o.cap; break;
    case 'ses': v = 12; break;
    case 'decoy': v = intelFresh ? 0 : 120; break;
  }
  const plant = o.kind === 'tpp' || o.kind === 'tes' || o.kind === 'hpp' || o.kind === 'pspp';
  const sub = o.kind === 'sub330' || o.kind === 'sub750';
  switch (policy) {
    case 'generation': v *= plant ? 3 : o.kind === 'bess' ? 2 : 0.6; break;
    case 'ring': v *= sub ? 3 : 0.7; break;
    case 'imports': v *= o.kind === 'sub750' ? 5 : sub ? 1.5 : 0.6; break;
    case 'distribution': v *= o.kind === 'sub110' ? 3 : 0.7; break;
    case 'finish': v *= f < 0.75 && f >= 0.25 ? 2.5 : 1; break;
  }
  if (cls !== 'drone') v *= plant || sub ? 1.5 : o.kind === 'sub110' ? 0.6 : 0.2;
  if (f < 0.25) v *= 0.15;
  v *= 1 - 0.12 * o.prot;
  return v;
}

export function chooseTarget(s: GameState, type: ThreatType): string {
  const policy = POLICIES[s.flags.wavePolicy ?? 0] ?? 'mixed';
  const cls = THREATS[type].cls;
  const intelFresh = !!s.enemyIntel && s.t - s.enemyIntel.at < 3 * 1440;
  const D = DIFF[s.difficulty];
  // повторний удар по ремонтниках
  if (cls === 'drone' && rnd(s) < D.doubleTap) {
    const working = s.crews.filter((c) => c.state === 'work' && c.job && !c.job.startsWith('L:'));
    if (working.length) return working[Math.floor(rnd(s) * working.length)].job!;
  }
  const scored: [string, number][] = [];
  for (const o of s.objs) {
    const v = objValue(s, o, policy, cls, intelFresh);
    if (v > 0) scored.push([o.id, v * (0.6 + rnd(s) * 0.8)]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const top = scored.slice(0, 8);
  const sum = top.reduce((a, b) => a + b[1], 0);
  let r = rnd(s) * sum;
  for (const [id, v] of top) {
    r -= v;
    if (r <= 0) return id;
  }
  return top[0]?.[0] ?? 'tec5';
}

function exposure(s: GameState, path: number[]): number {
  if (!s.enemyIntel) return 0;
  const ad = s.enemyIntel.ad;
  let e = 0;
  for (let k = 0; k + 3 < path.length; k += 2) {
    const x1 = path[k], y1 = path[k + 1], x2 = path[k + 2], y2 = path[k + 3];
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 10);
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n, y = y1 + ((y2 - y1) * i) / n;
      for (let j = 0; j < ad.length; j += 3) {
        const dx = x - ad[j], dy = y - ad[j + 1];
        if (dx * dx + dy * dy < ad[j + 2] * ad[j + 2]) e++;
      }
    }
  }
  return e;
}

export function makeRoute(s: GameState, type: ThreatType, sx: number, sy: number, tx: number, ty: number): number[] {
  const cls = THREATS[type].cls;
  if (cls === 'ballistic') return [tx, ty];
  const tries = s.enemyIntel ? 6 : 1;
  let best: number[] = [];
  let bestE = Infinity;
  const L = Math.hypot(tx - sx, ty - sy) || 1;
  const nx = -(ty - sy) / L, ny = (tx - sx) / L;
  const spread = cls === 'cruise' ? 110 : 75;
  for (let k = 0; k < tries; k++) {
    const o1 = rndRange(s, -spread, spread), o2 = rndRange(s, -spread * 0.7, spread * 0.7);
    const p1x = sx + (tx - sx) * 0.35 + nx * o1, p1y = sy + (ty - sy) * 0.35 + ny * o1;
    const p2x = sx + (tx - sx) * 0.72 + nx * o2, p2y = sy + (ty - sy) * 0.72 + ny * o2;
    const path = [clampX(p1x), clampY(p1y), clampX(p2x), clampY(p2y), tx, ty];
    const e = exposure(s, [sx, sy, ...path]);
    if (e < bestE) {
      bestE = e;
      best = path;
    }
  }
  return best;
}

function clampX(x: number): number { return Math.max(10, Math.min(W - 10, x)); }
function clampY(y: number): number { return Math.max(10, Math.min(H - 10, y)); }

export function spawnThreat(s: GameState, type: ThreatType, dir: string, target: string): Threat {
  const [sx, sy] = spawnPoint(s, dir);
  let tx: number, ty: number, path: number[];
  if (type === 'recon') {
    const pts: number[] = [];
    for (let i = 0; i < 3; i++) pts.push(rndRange(s, 240, 470), rndRange(s, 120, 290));
    const exit = spawnPoint(s, ['N', 'E', 'S', 'NW', 'SW'][Math.floor(rnd(s) * 5)]);
    path = [...pts, exit[0], exit[1]];
    tx = exit[0];
    ty = exit[1];
  } else {
    const o = objById(s, target);
    tx = o ? o.x : 350;
    ty = o ? o.y : 200;
    path = makeRoute(s, type, sx, sy, tx, ty);
  }
  const th: Threat = {
    id: newId(s), type, x: sx, y: sy, path, pi: 0, target, tx, ty, heading: Math.atan2(path[1] - sy, path[0] - sx),
    lost: 0, jammed: false, reserved: 0, identified: !!s.tech.identify && type === 'gerbera', prog: 0,
    dist0: Math.hypot(tx - sx, ty - sy),
  };
  s.threats.push(th);
  s.stats.launched[type] = (s.stats.launched[type] ?? 0) + 1;
  if (s.waveStats && type !== 'recon') s.waveStats.launched++;
  return th;
}

/** Знімок ППО для ворога (після вдалої розвідки). */
export function snapshotAD(s: GameState): number[] {
  const ad: number[] = [];
  for (const d of s.defs) {
    const spec = DEFS[d.type];
    if (spec.kind === 'sensor') continue;
    ad.push(d.x, d.y, spec.range);
  }
  return ad;
}
