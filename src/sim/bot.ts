// Евристичний бот для балансування: грає «середнього» гравця через ті самі команди, що й UI.
import { DEFS, BUILDS, CREWS, AMMO_PACK } from '../data/specs';
import { levelById } from '../data/levels';
import type { AmmoType, DefType, GameState, PObj } from './types';
import * as A from './actions';
import { needsProject } from './crews';
import { minuteOfDay } from './demand';
import { districtAt, isWater } from './geo';
import { distributedMW } from './objectives';

const PRIORITY: Record<string, number> = { tpp: 10, tes: 6, hpp: 8, pspp: 5, sub750: 9, sub330: 6, sub110: 3 };

function value(o: PObj): number {
  return (PRIORITY[o.kind] ?? 0) * (o.kind === 'tpp' ? o.cap / 300 : 1);
}

function coveredByGun(s: GameState, x: number, y: number): number {
  let n = 0;
  for (const d of s.defs) {
    const spec = DEFS[d.type];
    if (spec.kind !== 'gun' && d.type !== 'interceptor' && d.type !== 'manpads') continue;
    if (Math.hypot(d.x - x, d.y - y) < spec.range * 0.9) n++;
  }
  return n;
}

function spotNear(s: GameState, o: PObj, k: number): [number, number] | null {
  for (let i = 0; i < 12; i++) {
    const a = (k * 2.4 + i * 0.9) % (Math.PI * 2);
    const r = 9 + (i % 3) * 3;
    const x = Math.round(o.x + Math.cos(a) * r), y = Math.round(o.y + Math.sin(a) * r);
    if (!isWater(x, y) && !s.defs.some((d) => Math.hypot(d.x - x, d.y - y) < 4)) return [x, y];
  }
  return null;
}

export function botAct(s: GameState, aggressive = 1): void {
  if (s.phase === 'alert' || s.threats.length) return;
  const L = levelById(s.levelId);
  const reserve = 15 + s.crews.length * 1.5;
  const spend = () => s.money - reserve;

  // цілі глав — у першу чергу
  const g0 = L.goal;
  if (g0.type === 'bess' && s.unlocked.builds.includes('bess') && s.money > A.buildCost(s, 'bess') + 5) placeInDistrict(s, 'bess', 380 + Math.random() * 40, 200 + Math.random() * 40);
  if (g0.type === 'distributed') {
    const id = s.money > A.buildCost(s, 'gtu') + 5 ? 'gtu' : 'kgu';
    const d = s.districts[Math.floor(Math.random() * s.districts.length)];
    if (s.money > A.buildCost(s, id) + 5) placeInDistrict(s, id, d.cx, d.cy);
  }

  // проєкти відновлення
  for (const o of s.objs) if (needsProject(o) && spend() > A.projectCost(o)) A.startProject(s, o.id);

  // трансформатори
  if (s.transformers + s.trDeliveries.length < 2 && spend() > A.transformerPrice(s)) A.buyTransformer(s);

  // персонал і бригади
  const damaged = s.objs.filter((o) => o.built && o.hp < o.maxHp * 0.7).length + s.lines.filter((l) => l.hp < l.maxHp * 0.7).length;
  if (damaged > s.crews.length && spend() > 10) {
    const free = s.staff - s.crews.reduce((a, c) => a + CREWS[c.type].people, 0);
    const needPlant = s.objs.some((o) => (o.kind === 'tpp' || o.kind === 'hpp' || o.kind === 'tes') && o.hp < o.maxHp * 0.7);
    const t = needPlant && s.crews.filter((c) => c.type === 'plant').length < 4 ? 'plant' : s.crews.filter((c) => c.type === 'hv').length < s.crews.filter((c) => c.type === 'city').length / 2 ? 'hv' : 'city';
    if (free >= CREWS[t].people) A.hireCrew(s, t);
    else if (s.staffPending.length === 0) A.hireStaff(s);
  }

  // боєприпаси
  for (const a of ['patriot', 'irist', 'nasams', 'gepard', 'interceptor', 'manpads'] as AmmoType[]) {
    const owners = s.defs.filter((d) => DEFS[d.type].ammo === a).length;
    if (owners && s.stock[a] < AMMO_PACK[a] * owners && spend() > A.ammoPackCost(a) + 10) A.buyAmmo(s, a);
  }

  const goalBusy = L.goal.type === 'distributed' && distributedMW(s) < L.goal.mw;
  if (goalBusy && s.defs.length >= 6) return;
  // ППО біля найцінніших цілей
  const targets = s.objs.filter((o) => PRIORITY[o.kind] && o.built).sort((a, b) => value(b) - value(a));
  let k = 0;
  for (const o of targets.slice(0, 10 + Math.floor(aggressive * 6))) {
    k++;
    const cov = coveredByGun(s, o.x, o.y);
    const want = o.kind === 'tpp' || o.kind === 'sub750' ? 2 : 1;
    if (cov >= want) continue;
    let type: DefType = 'mfg';
    if (s.unlocked.defs.includes('gepard') && spend() > 80 && (o.kind === 'tpp' || o.kind === 'sub750' || o.kind === 'tes')) type = 'gepard';
    else if (s.unlocked.defs.includes('interceptor') && spend() > 40 && k % 2 === 0) type = 'interceptor';
    if (spend() < DEFS[type].cost) break;
    const p = spotNear(s, o, k);
    if (p) A.placeDefense(s, type, p[0], p[1]);
  }
  // балістика: Patriot біля центру, якщо можна купити
  if (s.unlocked.threats.includes('iskander') && s.unlocked.defs.includes('patriot') && !s.defs.some((d) => d.type === 'patriot') && spend() > DEFS.patriot.cost) {
    A.placeDefense(s, 'patriot', 345, 225);
  }
  if (s.unlocked.threats.includes('kh101') && s.unlocked.defs.includes('irist') && s.defs.filter((d) => d.type === 'irist' || d.type === 'nasams').length < 2 && spend() > DEFS.irist.cost + 60) {
    A.placeDefense(s, 'irist', 330, 170);
  }
  if (s.unlocked.threats.includes('gerbera') && s.unlocked.defs.includes('radar') && !s.defs.some((d) => d.type === 'radar') && spend() > 50) A.placeDefense(s, 'radar', 352, 182);

  // захист
  for (const o of targets.slice(0, 8)) {
    const q = A.protQuote(s, o);
    if (!q || q.cost === null || q.level > s.unlocked.prot) continue;
    if (spend() > q.cost + 20) A.protect(s, o.id);
  }

  // технології
  for (const t of ['searchlights', 'training', 'firefight', 'reservation', 'ufls', 'pn2', 'thermal', 'decentral', 'identify']) {
    if (s.unlocked.techs.includes(t) && !s.tech[t]) {
      const cost = { searchlights: 15, training: 45, firefight: 25, reservation: 20, ufls: 30, pn2: 20, thermal: 25, decentral: 40, identify: 30 }[t] ?? 50;
      if (spend() > cost + 40) A.research(s, t);
    }
  }

  // пункти незламності й тепло
  for (const d of s.districts) {
    if (d.frac < 0.85 && d.pn < 2 && s.unlocked.builds.includes('pn') && spend() > 10) placeInDistrict(s, 'pn', d.cx, d.cy);
    if (d.noHeat > 0.3 && s.unlocked.builds.includes('boiler') && s.money > 10) placeInDistrict(s, 'boiler', d.cx, d.cy);
  }

  // цілі глав
  const g = L.goal;
  if (g.type === 'bess' && s.unlocked.builds.includes('bess') && spend() > BUILDS.bess.cost) placeInDistrict(s, 'bess', 380 + Math.random() * 40, 200 + Math.random() * 40);
  if (g.type === 'distributed') {
    const id = spend() > BUILDS.bess.cost + 20 ? 'bess' : spend() > BUILDS.gtu.cost ? 'gtu' : 'kgu';
    const d = s.districts[Math.floor(Math.random() * s.districts.length)];
    if (spend() > A.buildCost(s, id)) placeInDistrict(s, id, d.cx, d.cy);
  }
  if (aggressive > 1 && s.unlocked.builds.includes('kgu') && spend() > 60) {
    const d = s.districts.slice().sort((a, b) => a.frac - b.frac)[0];
    placeInDistrict(s, 'kgu', d.cx, d.cy);
  }
  void minuteOfDay;
}

function placeInDistrict(s: GameState, id: string, cx: number, cy: number): boolean {
  for (let i = 0; i < 25; i++) {
    const x = Math.round(cx + (Math.random() - 0.5) * 40), y = Math.round(cy + (Math.random() - 0.5) * 30);
    if (districtAt(x, y) < 0) continue;
    if (A.buildObject(s, id, x, y).ok) return true;
  }
  return false;
}
