import { describe, expect, it } from 'vitest';
import { FlowNet, dispatch, districtDemand, limitMW, plannedMW } from '../src/sim/grid';
import { createState, objById } from '../src/sim/init';
import { autoFitSchedule, setAllQueues, setDistrictQueues, toggleEmergency } from '../src/sim/actions';
import { economyTick, hourly } from '../src/sim/economy';

describe('FlowNet (min-cost flow з відʼємними вартостями)', () => {
  it('віддає перевагу дешевшому джерелу', () => {
    const n = new FlowNet();
    const S = n.addNode(), T = n.addNode(), a = n.addNode(), b = n.addNode(), load = n.addNode();
    const cheap = n.addArc(S, a, 100, 1);
    const dear = n.addArc(S, b, 100, 5);
    n.addArc(a, load, 1000, 0);
    n.addArc(b, load, 1000, 0);
    n.addArc(load, T, 120, -100);
    n.solve(S, T);
    expect(cheap.flow).toBeCloseTo(100);
    expect(dear.flow).toBeCloseTo(20);
  });

  it('ділить дефіцит чергами порівну між районами', () => {
    const n = new FlowNet();
    const S = n.addNode(), T = n.addNode(), d1 = n.addNode(), d2 = n.addNode();
    n.addArc(S, d1, 1e6, 0);
    const gen = n.addArc(S, d2, 1e6, 0);
    void gen;
    // спільне джерело на 120 МВт через вузол
    const n2 = new FlowNet();
    const S2 = n2.addNode(), T2 = n2.addNode(), hub = n2.addNode(), x = n2.addNode(), y = n2.addNode();
    n2.addArc(S2, hub, 120, 0);
    n2.addArc(hub, x, 1e6, 0);
    n2.addArc(hub, y, 1e6, 0);
    const qx: ReturnType<typeof n2.addArc>[] = [], qy: ReturnType<typeof n2.addArc>[] = [];
    const vals = [100, 96, 92, 88, 84, 80];
    for (const v of vals) {
      qx.push(n2.addArc(x, T2, 100 / 6, -v));
      qy.push(n2.addArc(y, T2, 100 / 6, -v));
    }
    n2.solve(S2, T2);
    const fx = qx.reduce((a, q) => a + q.flow, 0), fy = qy.reduce((a, q) => a + q.flow, 0);
    expect(fx + fy).toBeCloseTo(120);
    expect(Math.abs(fx - fy)).toBeLessThan(100 / 6 + 0.01);
    void S; void T; void d1;
  });
});

describe('енергосистема Києва', () => {
  it('ціла система покриває попит', () => {
    const s = createState('c1', 'normal', 1);
    dispatch(s);
    expect(s.servedTotal / s.demandTotal).toBeGreaterThan(0.99);
    for (const d of s.districts) expect(d.frac).toBeGreaterThan(0.98);
  });

  it('знищення обох ПС 110 району гасить його, а КГУ дає острів', () => {
    const s = createState('c3', 'normal', 1);
    for (const id of ['s_pechersk', 's_zvirynets']) objById(s, id)!.hp = 0;
    dispatch(s);
    const pech = s.districts.find((d) => d.id === 'pecherskyi')!;
    expect(pech.frac).toBeLessThan(0.05);
    s.objs.push({ id: 'k1', kind: 'gtu', name: 'ГТУ', x: 362, y: 222, hp: 70, maxHp: 70, prot: 0, cap: 25, district: 'pecherskyi', built: true, fireUntil: 0, out: 0 });
    dispatch(s);
    const metro = s.objs.filter((o) => o.kind === 'metro' && o.district === 'pecherskyi').reduce((a, o) => a + (o.critServed ?? 0), 0);
    expect(pech.served + metro).toBeGreaterThan(20);
    expect(metro).toBeGreaterThan(0);
  });

  it('ліміт Укренерго обмежує побутове споживання, але не критичне', () => {
    const s = createState('c1', 'normal', 1);
    s.flags.indOff = 1;
    s.flags.limitMW = 0.7 * s.districts.reduce((a, d) => a + districtDemand(s, d.share), 0);
    s.flags.limitUntil = s.t + 600;
    dispatch(s);
    const dist = s.districts.reduce((a, d) => a + d.served, 0);
    const dem = s.districts.reduce((a, d) => a + d.demand, 0);
    expect(dist / dem).toBeCloseTo(0.7, 1);
    for (const o of s.objs.filter((oo) => oo.kind === 'crit')) expect(o.critServed).toBeGreaterThan(o.cap * 0.8);
  });

  it('втрата імпорту і ТЕЦ створює дефіцит', () => {
    const s = createState('c3', 'normal', 1);
    s.importMods.push({ mult: 0, until: s.t + 600 });
    for (const id of ['tec5', 'tec6', 'darn', 'tryp']) objById(s, id)!.hp = 0;
    dispatch(s);
    expect(s.servedTotal / s.demandTotal).toBeLessThan(0.7);
  });
});

describe('графіки відключень і екстрені відключення', () => {
  it('ручний графік: 2 черги з 6 → район отримує ~67%', () => {
    const s = createState('c1', 'normal', 1);
    setDistrictQueues(s, 'obolonskyi', 2);
    dispatch(s);
    const d = s.districts.find((dd) => dd.id === 'obolonskyi')!;
    expect(d.frac).toBeCloseTo(4 / 6, 1);
    for (const o of s.districts.filter((dd) => dd.id !== 'obolonskyi')) expect(o.frac).toBeGreaterThan(0.98);
  });

  it('графік для всього Києва вимикає однакову частку всюди', () => {
    const s = createState('c1', 'normal', 1);
    setAllQueues(s, 3);
    dispatch(s);
    for (const d of s.districts) expect(d.frac).toBeCloseTo(0.5, 1);
  });

  it('екстрене відключення гасить район, але водоканал і метро живі', () => {
    const s = createState('c3', 'normal', 1);
    toggleEmergency(s, 'pecherskyi');
    dispatch(s);
    const d = s.districts.find((dd) => dd.id === 'pecherskyi')!;
    expect(d.frac).toBeLessThan(0.01);
    for (const o of s.objs.filter((oo) => oo.kind === 'crit')) expect(o.critServed).toBeGreaterThan(o.cap * 0.8);
    const metro = s.objs.filter((o) => o.kind === 'metro' && o.district === 'pecherskyi');
    expect(metro.reduce((a, o) => a + (o.critServed ?? 0), 0)).toBeGreaterThan(0);
    // аварійне знеструмлення рахується як аварійне для довіри
    hourly(s);
    economyTick(s, 60);
    expect(d.accEmerg).toBeGreaterThan(0);
    toggleEmergency(s, 'pecherskyi');
    dispatch(s);
    expect(d.frac).toBeGreaterThan(0.98);
  });

  it('графік понад ліміт — Укренерго ріже аварійно', () => {
    const s = createState('c1', 'normal', 1);
    s.flags.indOff = 1;
    s.flags.limitMW = 0.6 * plannedMW(s);
    s.flags.limitUntil = s.t + 600;
    setAllQueues(s, 1); // 83% > 60%
    hourly(s); // план = 1 − 1/6
    dispatch(s);
    const dist = s.districts.reduce((a, d) => a + d.served, 0);
    expect(dist).toBeLessThanOrEqual(limitMW(s) + 1);
    economyTick(s, 60);
    expect(s.districts.reduce((a, d) => a + d.accEmerg, 0)).toBeGreaterThan(0);
  });

  it('«Підібрати під ліміт» вкладає графік у наказ', () => {
    const s = createState('c1', 'normal', 1);
    s.flags.limitMW = 0.65 * plannedMW(s);
    s.flags.limitUntil = s.t + 600;
    const r = autoFitSchedule(s);
    expect(r.ok).toBe(true);
    expect(plannedMW(s)).toBeLessThanOrEqual(limitMW(s));
    expect(s.schedule.mode).toBe('manual');
  });

  it('після завершення наказу ручний графік знімається', () => {
    const s = createState('c1', 'normal', 1);
    s.flags.limitMW = 600;
    s.flags.limitUntil = s.t + 60;
    setAllQueues(s, 3);
    s.t += 61;
    hourly(s);
    expect(s.schedule.mode).toBe('auto');
    expect(Object.values(s.schedule.queues).every((k) => k === 0)).toBe(true);
    expect(s.flags.limitUntil).toBeUndefined();
    dispatch(s);
    for (const d of s.districts) expect(d.frac).toBeGreaterThan(0.98);
  });
});
