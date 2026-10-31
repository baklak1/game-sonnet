// Команди гравця. Їх викликають і UI, і бот-балансер. Кожна повертає {ok, msg}.
import { B } from '../data/balance';
import { AMMO_PACK, BUILDS, CREWS, DEFS, LINE_SPECS, MAX_LINE_PX, PROT_COST, PROT_DAYS, PROT_NAMES, PX_PER_KM, TECH_BY_ID, WATER_LINE_MULT, protClass } from '../data/specs';
import { crossesWater, districtAt, getGeo, isWater, W, H } from './geo';
import type { AmmoType, BuildJob, CrewType, DefType, FirePolicy, GameState, PObj } from './types';
import { crewPeople, makeBuiltObj, makeCrew, makeDefense, newId, objById } from './init';
import { needsProject, sendCrew } from './crews';
import { toast } from './economy';
import { reloadAll } from './combat';
import { dispatch, updateHeat } from './grid';

export interface Res { ok: boolean; msg?: string }
const OK: Res = { ok: true };
const fail = (msg: string): Res => ({ ok: false, msg });

export function fmtMoney(m: number): string {
  return `${m >= 100 ? Math.round(m) : m.toFixed(1)} млн ₴`;
}

function busyContractors(s: GameState): number {
  return s.builds.filter((b) => b.kind === 'obj' || b.kind === 'line' || b.kind === 'prot' || b.kind === 'project').length;
}

export function maxContractors(s: GameState): number {
  return (s.flags.maxContractors ?? 2) + (s.tech.contractor ? 1 : 0);
}

function addJob(s: GameState, kind: BuildJob['kind'], ref: string, minutes: number, label: string, level?: number): void {
  s.builds.push({ id: newId(s), kind, ref, start: s.t, until: s.t + minutes, label, level });
}

export function buildCost(s: GameState, id: string): number {
  const spec = BUILDS[id];
  let c = spec.cost;
  if (s.tech.decentral && (id === 'kgu' || id === 'gtu' || id === 'ses')) c *= 0.75;
  return c;
}

export function buildDays(s: GameState, id: string): number {
  const spec = BUILDS[id];
  let d = spec.days;
  if (s.tech.decentral && (id === 'kgu' || id === 'gtu' || id === 'ses')) d = Math.max(0.5, d - 1);
  return d;
}

export function canPlaceAt(s: GameState, x: number, y: number, minDist = 5): Res {
  if (x < 4 || y < 4 || x > W - 4 || y > H - 4) return fail('За межами карти');
  if (isWater(x, y)) return fail('Не можна будувати на воді');
  for (const o of s.objs) if (Math.hypot(o.x - x, o.y - y) < minDist) return fail('Занадто близько до іншого об’єкта');
  return OK;
}

export function placeDefense(s: GameState, type: DefType, x: number, y: number, free = false): Res {
  const spec = DEFS[type];
  if (!free && !s.unlocked.defs.includes(type)) return fail('Ще недоступно');
  if (!free && s.money < spec.cost) return fail('Недостатньо коштів');
  if (isWater(x, y)) return fail('Не можна ставити на воду');
  for (const d of s.defs) if (Math.hypot(d.x - x, d.y - y) < 3) return fail('Тут уже стоїть ППО');
  if (!free) s.money -= spec.cost;
  const d = makeDefense(s, type, x, y, false);
  s.defs.push(d);
  addJob(s, 'def', String(d.id), spec.deployH * 60, `Розгортання: ${spec.short}`);
  return OK;
}

export function moveDefense(s: GameState, id: number, x: number, y: number): Res {
  const d = s.defs.find((dd) => dd.id === id);
  if (!d) return fail('Немає');
  if (isWater(x, y)) return fail('Не можна на воду');
  d.tx = x;
  d.ty = y;
  return OK;
}

export function sellDefense(s: GameState, id: number): Res {
  const i = s.defs.findIndex((d) => d.id === id);
  if (i < 0) return fail('Немає');
  const d = s.defs[i];
  const spec = DEFS[d.type];
  s.money += spec.cost * 0.4;
  if (spec.ammo && spec.mag < 9999) s.stock[spec.ammo] += d.ammo;
  s.defs.splice(i, 1);
  s.builds = s.builds.filter((b) => !(b.kind === 'def' && b.ref === String(id)));
  return OK;
}

export function setPolicy(s: GameState, id: number, policy: FirePolicy): Res {
  const d = s.defs.find((dd) => dd.id === id);
  if (!d) return fail('Немає');
  d.policy = policy;
  return OK;
}

export function buildObject(s: GameState, id: string, x: number, y: number): Res {
  const spec = BUILDS[id];
  if (!spec || !s.unlocked.builds.includes(id)) return fail('Ще недоступно');
  const cost = buildCost(s, id);
  if (s.money < cost) return fail('Недостатньо коштів');
  if (busyContractors(s) >= maxContractors(s)) return fail('Усі підрядники зайняті');
  const pl = canPlaceAt(s, x, y, id === 'sub330' ? 10 : 5);
  if (!pl.ok) return pl;
  const di = districtAt(x, y);
  if (spec.inCity && di < 0) return fail('Це треба ставити в межах міста (у районі)');
  if (spec.outside && (di >= 0 || getGeo().town[Math.floor(y) * W + Math.floor(x)])) return fail('Вітряки ставлять лише за містом, у полях');
  if (spec.outside && getGeo().forest[Math.floor(y) * W + Math.floor(x)]) return fail('Тут ліс — оберіть поле');
  if (id === 'pn' && di >= 0) {
    const dist = s.districts[di];
    const inBuild = s.builds.filter((b) => b.kind === 'obj' && b.ref.startsWith('pn_') && objById(s, b.ref)?.district === dist.id).length;
    if (dist.pn + inBuild >= 3) return fail('У районі вже 3 пункти незламності');
  }
  s.money -= cost;
  const o = makeBuiltObj(s, id, x, y, false);
  s.objs.push(o);
  addJob(s, 'obj', o.id, buildDays(s, id) * 1440, `Будівництво: ${spec.name}`);
  return OK;
}

const LINE_ENDS_110 = new Set(['sub110', 'sub330', 'tpp', 'tes', 'hpp', 'pspp', 'wes']);
const LINE_ENDS_330 = new Set(['sub330', 'sub750', 'tpp', 'tes', 'hpp', 'pspp', 'wes']);

export function lineQuote(s: GameState, specId: string, aId: string, bId: string): Res & { cost?: number; days?: number; km?: number; water?: boolean } {
  const spec = LINE_SPECS[specId];
  const a = objById(s, aId), b = objById(s, bId);
  if (!spec || !a || !b) return fail('Оберіть два об’єкти');
  if (aId === bId) return fail('Оберіть інший кінець');
  const ends = spec.kv === 110 ? LINE_ENDS_110 : LINE_ENDS_330;
  if (!ends.has(a.kind) || !ends.has(b.kind)) return fail(spec.kv === 110 ? 'ЛЕП 110 з’єднує ПС 110/330, станції та ВЕС' : 'ЛЕП 330 з’єднує ПС 330/750, станції та ВЕС');
  if (a.kind === 'sub110' && b.kind === 'sub110' && spec.kv === 330) return fail('Не той клас напруги');
  if (s.lines.some((l) => (l.a === aId && l.b === bId) || (l.a === bId && l.b === aId))) return fail('Така лінія вже є');
  const px = Math.hypot(a.x - b.x, a.y - b.y);
  if (px > MAX_LINE_PX) return fail('Задовга лінія (макс. ~17 км)');
  const km = px / PX_PER_KM;
  const water = crossesWater(a.x, a.y, b.x, b.y);
  const cost = km * spec.costKm * (water ? WATER_LINE_MULT : 1);
  const days = Math.max(0.5, km / spec.kmPerDay) * (water ? 1.5 : 1);
  return { ok: true, cost, days, km, water };
}

export function buildLine(s: GameState, specId: string, aId: string, bId: string): Res {
  if (!s.unlocked.builds.includes(specId)) return fail('Ще недоступно');
  const q = lineQuote(s, specId, aId, bId);
  if (!q.ok) return q;
  if (s.money < q.cost!) return fail('Недостатньо коштів');
  if (busyContractors(s) >= maxContractors(s)) return fail('Усі підрядники зайняті');
  const spec = LINE_SPECS[specId];
  s.money -= q.cost!;
  const id = `${aId}-${bId}-${newId(s)}`;
  s.lines.push({ id, a: aId, b: bId, kv: spec.kv, cap: spec.cap, hp: spec.hp, maxHp: spec.hp, cable: spec.cable, built: false, flow: 0 });
  addJob(s, 'line', id, q.days! * 1440, `Будівництво: ${spec.name}`);
  return OK;
}

export function protQuote(s: GameState, o: PObj): { level: number; cost: number | null; days: number; name: string } | null {
  const cls = protClass(o.kind);
  if (!cls) return null;
  const level = o.prot + 1;
  if (level > 3) return null;
  const cost = PROT_COST[cls][level - 1];
  return { level, cost, days: PROT_DAYS[level - 1], name: PROT_NAMES[level] };
}

export function protect(s: GameState, objId: string): Res {
  const o = objById(s, objId);
  if (!o || !o.built) return fail('Немає об’єкта');
  const q = protQuote(s, o);
  if (!q || q.cost === null) return fail('Максимальний захист для цього об’єкта');
  if (q.level > s.unlocked.prot) return fail('Цей рівень захисту ще недоступний');
  if (s.builds.some((b) => b.kind === 'prot' && b.ref === objId)) return fail('Захист уже будується');
  if (s.money < q.cost) return fail('Недостатньо коштів');
  if (busyContractors(s) >= maxContractors(s)) return fail('Усі підрядники зайняті');
  s.money -= q.cost;
  addJob(s, 'prot', objId, q.days * 1440, `${q.name}: ${o.name}`, q.level);
  return OK;
}

export function projectCost(o: PObj): number {
  return B.projectCostPerHp * o.maxHp * 0.6;
}

export function startProject(s: GameState, objId: string): Res {
  const o = objById(s, objId);
  if (!o || !needsProject(o)) return fail('Проєкт не потрібен');
  if (s.builds.some((b) => b.kind === 'project' && b.ref === objId)) return fail('Проєкт уже триває');
  const cost = projectCost(o);
  if (s.money < cost) return fail('Недостатньо коштів');
  if (busyContractors(s) >= maxContractors(s)) return fail('Усі підрядники зайняті');
  s.money -= cost;
  addJob(s, 'project', objId, B.projectDays * 1440, `Відновлення: ${o.name}`);
  return OK;
}

export function research(s: GameState, techId: string): Res {
  const t = TECH_BY_ID[techId];
  if (!t || !s.unlocked.techs.includes(techId)) return fail('Ще недоступно');
  if (s.tech[techId]) return fail('Вже є');
  if (s.money < t.cost) return fail('Недостатньо коштів');
  s.money -= t.cost;
  s.tech[techId] = true;
  if (techId === 'training') s.staff += 10;
  if (techId === 'trreserve') s.transformers += 2;
  if (techId === 'mobilesub') for (const o of s.objs) if (o.kind === 'sub110') o.tempSub = true;
  s.gridDirty = true;
  return OK;
}

export function hireCrew(s: GameState, type: CrewType): Res {
  const spec = CREWS[type];
  if (s.money < spec.hire) return fail('Недостатньо коштів');
  if (s.staff - crewPeople(s) < spec.people) return fail(`Потрібно ${spec.people} вільних людей у штаті`);
  s.money -= spec.hire;
  s.crews.push(makeCrew(s, type));
  return OK;
}

export function disbandCrew(s: GameState, id: number): Res {
  const i = s.crews.findIndex((c) => c.id === id);
  if (i < 0) return fail('Немає');
  s.crews.splice(i, 1);
  return OK;
}

export function hireStaff(s: GameState): Res {
  if (s.money < B.hireCost) return fail('Недостатньо коштів');
  s.money -= B.hireCost;
  s.staffPending.push({ n: B.hireN, at: s.t + B.hireDelayMin });
  return OK;
}

export function ammoPackCost(type: AmmoType): number {
  const def = (Object.keys(DEFS) as DefType[]).find((d) => DEFS[d].ammo === type)!;
  return DEFS[def].ammoCost * AMMO_PACK[type];
}

export function buyAmmo(s: GameState, type: AmmoType): Res {
  const cost = ammoPackCost(type);
  if (s.money < cost) return fail('Недостатньо коштів');
  s.money -= cost;
  s.stock[type] += AMMO_PACK[type];
  if (s.phase !== 'alert') reloadAll(s);
  return OK;
}

export function transformerPrice(s: GameState): number {
  return B.transformerCost * (s.tech.trreserve ? 0.7 : 1) * (s.objs.some((o) => o.kind === 'depot' && o.built) ? 0.85 : 1);
}

export function buyTransformer(s: GameState): Res {
  const c = transformerPrice(s);
  if (s.money < c) return fail('Недостатньо коштів');
  s.money -= c;
  const depot = s.objs.some((o) => o.kind === 'depot' && o.built);
  s.trDeliveries.push({ n: 1, at: s.t + B.transformerDelayMin - (depot ? 1440 : 0) });
  return OK;
}

export function togglePriority(s: GameState, districtId: string): Res {
  const d = s.districts.find((dd) => dd.id === districtId);
  if (!d) return fail('Немає');
  if (!d.priority && s.districts.filter((dd) => dd.priority).length >= 2) return fail('Пріоритет можна дати лише двом районам');
  d.priority = !d.priority;
  s.gridDirty = true;
  return OK;
}

export function toggleRepairPriority(s: GameState, objId: string): Res {
  const o = objById(s, objId);
  if (!o) return fail('Немає');
  o.priority = !o.priority;
  return OK;
}

export function assignCrew(s: GameState, crewId: number, jobId: string): Res {
  const c = s.crews.find((cc) => cc.id === crewId);
  if (!c) return fail('Немає');
  if (c.state === 'injured') return fail('Бригада поранена');
  return sendCrew(s, c, jobId, true) ? OK : fail('Ця бригада не може це ремонтувати');
}

/** Відправити найближчу вільну придатну бригаду. */
export function dispatchNearest(s: GameState, jobId: string): Res {
  const free = s.crews.filter((c) => c.state === 'idle' || c.state === 'rest' || (c.state === 'move' && !c.job));
  const all = free.length ? free : s.crews.filter((c) => c.state !== 'injured' && !c.manual);
  for (const c of all.sort((a, b) => a.stamina > 20 && b.stamina <= 20 ? -1 : 0)) {
    if (sendCrew(s, c, jobId, true)) return OK;
  }
  return fail('Немає вільної бригади потрібного типу');
}

export function sellObject(s: GameState, objId: string): Res {
  const i = s.objs.findIndex((o) => o.id === objId);
  if (i < 0) return fail('Немає');
  const o = s.objs[i];
  if (o.fixed) return fail('Цей об’єкт не можна демонтувати');
  const spec = Object.values(BUILDS).find((b) => b.kind === o.kind);
  s.money += (spec?.cost ?? 0) * 0.3;
  s.objs.splice(i, 1);
  s.lines = s.lines.filter((l) => l.a !== objId && l.b !== objId);
  s.builds = s.builds.filter((b) => b.ref !== objId);
  if (o.kind === 'pn' && o.district) {
    const d = s.districts.find((dd) => dd.id === o.district);
    if (d && o.built) d.pn = Math.max(0, d.pn - 1);
  }
  s.gridDirty = true;
  return OK;
}

export const F16_COST = 8;

export function f16Available(s: GameState): boolean {
  return !!s.flags.f16Unlocked && (s.flags.f16Day ?? -1) !== Math.floor((s.t - 6 * 60) / 1440);
}

/** Патруль F-16: півгодини збиває крилаті ракети над точкою. Раз на ніч. */
export function callF16(s: GameState, x: number, y: number): Res {
  if (!s.flags.f16Unlocked) return fail('F-16 ще недоступні');
  if (!f16Available(s)) return fail('F-16 вже літали цієї ночі');
  if (s.money < F16_COST) return fail('Недостатньо коштів');
  s.money -= F16_COST;
  s.flags.f16Day = Math.floor((s.t - 6 * 60) / 1440);
  s.flags.f16Until = s.t + 30;
  s.flags.f16X = x;
  s.flags.f16Y = y;
  toast(s, 'F-16 вилетіли на патрулювання', 'good');
  return OK;
}

// ---------- графіки відключень

export function setScheduleMode(s: GameState, mode: 'auto' | 'manual'): Res {
  s.schedule.mode = mode;
  s.gridDirty = true;
  return OK;
}

export function setDistrictQueues(s: GameState, id: string, k: number): Res {
  if (!(id in s.schedule.queues)) return fail('Немає району');
  s.schedule.mode = 'manual';
  s.schedule.queues[id] = Math.max(0, Math.min(6, Math.round(k)));
  s.gridDirty = true;
  return OK;
}

export function setAllQueues(s: GameState, k: number): Res {
  s.schedule.mode = 'manual';
  for (const id of Object.keys(s.schedule.queues)) s.schedule.queues[id] = Math.max(0, Math.min(6, Math.round(k)));
  s.gridDirty = true;
  return OK;
}

export function toggleEmergency(s: GameState, id: string): Res {
  if (!s.districts.some((d) => d.id === id)) return fail('Немає району');
  const i = s.emergencyOff.indexOf(id);
  if (i >= 0) s.emergencyOff.splice(i, 1);
  else {
    s.emergencyOff.push(id);
    const d = s.districts.find((dd) => dd.id === id)!;
    toast(s, `${d.name} район екстрено знеструмлено. Водоканал і метро на окремих фідерах працюють.`, 'warn');
  }
  s.gridDirty = true;
  return OK;
}

export function toggleIndustryOff(s: GameState): Res {
  s.flags.indOff = s.flags.indOff ? 0 : 1;
  s.gridDirty = true;
  return OK;
}

/** Завершення будівництв. */
export function processBuilds(s: GameState): void {
  const done = s.builds.filter((b) => b.until <= s.t);
  if (!done.length) return;
  s.builds = s.builds.filter((b) => b.until > s.t);
  for (const b of done) {
    if (b.kind === 'def') {
      const d = s.defs.find((dd) => dd.id === Number(b.ref));
      if (d) {
        d.built = true;
        toast(s, `${DEFS[d.type].short} розгорнуто і готово до бою`, 'good');
      }
    } else if (b.kind === 'obj') {
      const o = objById(s, b.ref);
      if (o) {
        o.built = true;
        if (o.kind === 'pn' && o.district) {
          const d = s.districts.find((dd) => dd.id === o.district);
          if (d) d.pn++;
        }
        if (o.kind === 'depot') s.transformers += 2;
        toast(s, `Збудовано: ${o.name}`, 'good', o.id);
      }
    } else if (b.kind === 'line') {
      const l = s.lines.find((ll) => ll.id === b.ref);
      if (l) {
        l.built = true;
        toast(s, `Лінію введено в роботу`, 'good');
      }
    } else if (b.kind === 'prot') {
      const o = objById(s, b.ref);
      if (o && b.level) {
        o.prot = Math.max(o.prot, b.level);
        toast(s, `${o.name}: ${PROT_NAMES[o.prot]} готовий`, 'good', o.id);
      }
    } else if (b.kind === 'project') {
      const o = objById(s, b.ref);
      if (o) {
        o.hp = Math.max(o.hp, o.maxHp * 0.26);
        toast(s, `${o.name}: проєкт відновлення завершено, бригади можуть ремонтувати`, 'good', o.id);
      }
    }
    s.gridDirty = true;
  }
}

/** Переміщення ППО. */
export function moveDefs(s: GameState, dtMin: number): void {
  for (const d of s.defs) {
    if (d.tx === undefined || d.ty === undefined) continue;
    const spec = DEFS[d.type];
    const dx = d.tx - d.x, dy = d.ty - d.y;
    const dist = Math.hypot(dx, dy);
    const step = spec.moveSpeed * dtMin;
    if (dist <= step) {
      d.x = d.tx;
      d.y = d.ty;
      d.tx = undefined;
      d.ty = undefined;
      const heavy = spec.deployH >= 6;
      if (heavy) {
        d.built = false;
        addJob(s, 'def', String(d.id), 120, `Перерозгортання: ${spec.short}`);
      }
    } else {
      d.x += (dx / dist) * step;
      d.y += (dy / dist) * step;
    }
  }
}

export function forceDispatch(s: GameState): void {
  dispatch(s);
  updateHeat(s);
}
