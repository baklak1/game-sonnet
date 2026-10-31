// Створення стану гри з опису рівня.
import { B, DIFF } from '../data/balance';
import { DISTRICTS, LINES, OBJECTS } from '../data/objects';
import { BUILDS, CREWS, DEFS } from '../data/specs';
import { levelById } from '../data/levels';
import { districtAt } from './geo';
import { DISTRICTS as DDEF } from '../data/objects';
import { METRO_LINES, stationPos } from '../data/metro';
import type { AmmoType, Crew, CrewType, Defense, DefType, Difficulty, DistrictId, GameState, PObj } from './types';
import { prepareDay } from './waves';
import { dispatch, updateHeat } from './grid';

export const SAVE_VERSION = 5;

export function objById(s: GameState, id: string): PObj | undefined {
  for (const o of s.objs) if (o.id === id) return o;
  return undefined;
}

export function newId(s: GameState): number {
  return s.nextId++;
}

export function makeDefense(s: GameState, type: DefType, x: number, y: number, built: boolean): Defense {
  const spec = DEFS[type];
  return {
    id: newId(s), type, x, y, ammo: spec.mag + (type === 'interceptor' && s.tech.interceptor2 ? 2 : 0), cd: 0,
    policy: spec.kind === 'missile' && type !== 'manpads' && type !== 'interceptor' ? 'smart' : 'all',
    hp: spec.hp, built, idle: 0, kills: 0, shots: 0,
  };
}

export function makeCrew(s: GameState, type: CrewType): Crew {
  const bases = s.objs.filter((o) => o.kind === 'base' && o.built);
  const b = bases[s.crews.length % Math.max(1, bases.length)] ?? { x: 320, y: 200 };
  return { id: newId(s), type, x: b.x, y: b.y + 4, path: [], pi: 0, state: 'idle', job: null, stamina: 100, injuredUntil: 0, manual: false };
}

export function makeBuiltObj(s: GameState, buildId: string, x: number, y: number, built: boolean): PObj {
  const spec = BUILDS[buildId];
  const di = districtAt(x, y);
  const o: PObj = {
    id: `${buildId}_${newId(s)}`, kind: spec.kind, name: spec.name, x, y, hp: spec.hp, maxHp: spec.hp, prot: 0, cap: spec.cap,
    district: di >= 0 ? DDEF[di].id : undefined, built, fireUntil: 0, out: 0,
  };
  if (spec.socMax) {
    o.socMax = spec.socMax;
    o.soc = spec.socMax * 0.5;
    o.pump = spec.cap;
  }
  if (spec.kind === 'sub110') {
    if (s.tech.mobilesub) o.tempSub = true;
    if (o.district) o.cap = sub110Cap(o.district);
  }
  return o;
}

/** Потужність ПС 110 залежить від району: одна підстанція тягне ~половину пікового попиту. */
export function sub110Cap(district: string): number {
  const totalW = DISTRICTS.reduce((a, d) => a + d.pop * d.k, 0);
  const d = DISTRICTS.find((dd) => dd.id === district);
  return d ? Math.round(((d.pop * d.k) / totalW) * 1000) : 100;
}

export function crewPeople(s: GameState): number {
  let n = 0;
  for (const c of s.crews) n += CREWS[c.type].people;
  return n;
}

export function createState(levelId: string, difficulty: Difficulty, seed: number): GameState {
  const L = levelById(levelId);
  const D = DIFF[difficulty];
  const totalW = DISTRICTS.reduce((a, d) => a + d.pop * d.k, 0);

  const objs: PObj[] = OBJECTS.map((d) => {
    const frac = L.objHp?.[d.id] ?? 1;
    const o: PObj = {
      id: d.id, kind: d.kind, name: d.name, x: d.x, y: d.y, hp: Math.round(d.hp * frac), maxHp: d.hp, prot: 0, cap: d.cap,
      district: d.district, built: true, fireUntil: 0, out: 0, fixed: true,
    };
    if (d.soc) {
      o.socMax = d.soc;
      o.soc = d.soc * 0.6;
      o.pump = d.pump;
    }
    if (d.kind === 'crit') o.backupLeft = 6;
    if (d.kind === 'sub110' && d.district) o.cap = sub110Cap(d.district);
    return o;
  });

  const lines = LINES.map((l) => {
    const hp = l.kv === 110 ? 30 : 50;
    return { id: `${l.a}-${l.b}`, a: l.a, b: l.b, kv: l.kv, cap: l.cap, hp, maxHp: hp, cable: false, built: true, flow: 0 };
  });

  const stock: Record<AmmoType, number> = { manpads: 0, gepard: 0, interceptor: 0, nasams: 0, irist: 0, patriot: 0 };
  for (const [k, v] of Object.entries(L.stock)) stock[k as AmmoType] = v ?? 0;

  const s: GameState = {
    version: SAVE_VERSION,
    mode: levelId === 'endless' ? 'endless' : 'campaign',
    levelId, difficulty, seed, rng: seed >>> 0,
    season: L.season, baseTemp: L.baseTemp, tempMods: [],
    t: B.dayStartMin, lastDay: 1, phase: 'day', alertStart: 0, tick: B.dayStartMin,
    money: Math.round(L.money * D.money), trust: B.trustStart, staff: L.staff, staffPending: [],
    transformers: L.transformers, trDeliveries: [], stock, importBase: L.importBase, importMods: [], compensation: [], salaryLate: false,
    objs, lines,
    districts: DISTRICTS.map((d) => ({
      id: d.id, name: d.name, pop: d.pop, share: (d.pop * d.k) / totalW, heatSrc: d.heat, priority: false,
      demand: 0, served: 0, frac: 1, plan: 1, queuesOff: 0, noHeat: 0, pn: 0, cx: d.lx, cy: d.ly, accFrac: 0, accEmerg: 0, accMin: 0,
    })),
    defs: [], threats: [], projs: [], crews: [], builds: [], pending: [], nextId: 1,
    tech: {},
    unlocked: { defs: [...L.unlock.defs], builds: [...L.unlock.builds], prot: L.unlock.prot, techs: [...L.unlock.techs], threats: [...L.unlock.threats] },
    enemyIntel: null,
    waveIndex: 0, waveDays: L.waves.map((w) => w.day), waveStats: null, lastWaveReport: null, forecast: null,
    schedule: { mode: 'auto', queues: Object.fromEntries(DISTRICTS.map((d) => [d.id, 0])) }, emergencyOff: [],
    autoRepair: true, crewRisk: false,
    gridDirty: true, lastDispatch: -999, genTotal: 0, demandTotal: 0, servedTotal: 0, importUsed: 0, industryServed: 0,
    fx: [], toasts: [], news: [], choice: null,
    stats: {
      downed: {}, launched: {}, hits: 0, missiles: 0, adCost: 0, servedAcc: 0, hoursAcc: 0, heatAcc: 0, heatHours: 0,
      minTrust: B.trustStart, critOutage: 0, critOutageMax: 0, blackStreak: 0, blackStreakMax: 0, wavesDone: 0, repairsHp: 0,
    },
    waveAcc: { t: 0 },
    flags: { hppLeft: 440 * B.hppDailyHours, maxContractors: 2 },
    over: null, speed: 2, paused: false,
  };

  // метро: тягове живлення кожної лінії розподілене по районах, де її станції
  for (const line of METRO_LINES) {
    const groups = new Map<string, [number, number][]>();
    for (const st of line.stations) {
      const [x, y] = stationPos(st);
      let di = districtAt(x, y);
      if (di < 0) {
        let bd = 1e9;
        DDEF.forEach((d, k) => { const dd = (d.lx - x) ** 2 + (d.ly - y) ** 2; if (dd < bd) { bd = dd; di = k; } });
      }
      const id = DDEF[di].id;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push([x, y]);
    }
    for (const [did, pts] of groups) {
      const x = pts.reduce((a, p) => a + p[0], 0) / pts.length, y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      s.objs.push({
        id: `metro_${line.id}_${did}`, kind: 'metro', name: `Метро ${line.id}: ${DDEF.find((d) => d.id === did)!.name}`,
        x, y, hp: 100, maxHp: 100, prot: 0, cap: (line.mw * pts.length) / line.stations.length, district: did as DistrictId,
        built: true, fireUntil: 0, out: 0, fixed: true, critServed: 0,
      });
    }
  }
  s.flags.wind = 0.5;

  for (const t of L.techs ?? []) s.tech[t] = true;
  for (const e of L.extraObjs ?? []) {
    const o = makeBuiltObj(s, e.build, e.x, e.y, true);
    o.fixed = true;
    s.objs.push(o);
  }
  for (const [type, x, y] of L.defs) s.defs.push(makeDefense(s, type, x, y, true));
  const [nc, nh, np] = L.crews;
  for (let i = 0; i < nc; i++) s.crews.push(makeCrew(s, 'city'));
  for (let i = 0; i < nh; i++) s.crews.push(makeCrew(s, 'hv'));
  for (let i = 0; i < np; i++) s.crews.push(makeCrew(s, 'plant'));
  s.staff = crewPeople(s) + 10;
  if (L.num >= 7) s.flags.f16Unlocked = 1;
  if (s.mode === 'endless') s.waveDays = [1];

  dispatch(s);
  updateHeat(s);
  for (const d of s.districts) d.plan = d.frac;
  prepareDay(s);
  return s;
}
