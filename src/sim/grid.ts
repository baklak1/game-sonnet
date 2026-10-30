// Розрахунок енергосистеми: min-cost flow (послідовні найкоротші шляхи, SPFA).
// Навантаження району розбите на 6 черг зі спадною цінністю — дефіцит ділиться чесно,
// як графіки відключень. Критичні споживачі мають найвищу цінність.
import { B, hpAvail } from '../data/balance';
import { demandFactor, isHeatingSeason, isNightCharge, isPeakHour, solarFactor } from './demand';
import type { GameState, PObj } from './types';

interface Arc { to: number; cap: number; cost: number; flow: number; rev: number }

export class FlowNet {
  adj: Arc[][] = [];
  addNode(): number {
    this.adj.push([]);
    return this.adj.length - 1;
  }
  addArc(u: number, v: number, cap: number, cost: number): Arc {
    const a: Arc = { to: v, cap, cost, flow: 0, rev: this.adj[v].length };
    const b: Arc = { to: u, cap: 0, cost: -cost, flow: 0, rev: this.adj[u].length };
    this.adj[u].push(a);
    this.adj[v].push(b);
    return a;
  }
  /** Штовхає потік, поки шлях S→T має від’ємну вартість. */
  solve(s: number, t: number, maxIter = 4000): void {
    const n = this.adj.length;
    const dist = new Float64Array(n);
    const inq = new Uint8Array(n);
    const prevNode = new Int32Array(n);
    const prevArc = new Int32Array(n);
    for (let iter = 0; iter < maxIter; iter++) {
      dist.fill(Infinity);
      prevNode.fill(-1);
      dist[s] = 0;
      const q: number[] = [s];
      inq.fill(0);
      inq[s] = 1;
      let head = 0;
      while (head < q.length) {
        const u = q[head++];
        inq[u] = 0;
        const du = dist[u];
        const arcs = this.adj[u];
        for (let k = 0; k < arcs.length; k++) {
          const a = arcs[k];
          if (a.cap - a.flow <= 1e-7) continue;
          const nd = du + a.cost;
          if (nd < dist[a.to] - 1e-9) {
            dist[a.to] = nd;
            prevNode[a.to] = u;
            prevArc[a.to] = k;
            if (!inq[a.to]) {
              inq[a.to] = 1;
              q.push(a.to);
            }
          }
        }
        if (q.length > 200000) break;
      }
      if (!(dist[t] < -1e-9)) return;
      let f = Infinity;
      for (let v = t; v !== s; v = prevNode[v]) {
        const a = this.adj[prevNode[v]][prevArc[v]];
        f = Math.min(f, a.cap - a.flow);
      }
      if (!(f > 1e-7)) return;
      for (let v = t; v !== s; v = prevNode[v]) {
        const a = this.adj[prevNode[v]][prevArc[v]];
        a.flow += f;
        this.adj[a.to][a.rev].flow -= f;
      }
    }
  }
}

export function isGen(o: PObj): boolean {
  return o.kind === 'tpp' || o.kind === 'tes' || o.kind === 'hpp' || o.kind === 'pspp' || o.kind === 'import' ||
    o.kind === 'kgu' || o.kind === 'gtu' || o.kind === 'ses' || o.kind === 'bess' || o.kind === 'wte' || o.kind === 'wes';
}

/** Попит метро: нічна перерва 00:00–05:30, пікові години трохи вище. */
export function metroFactor(t: number): number {
  const m = ((t % 1440) + 1440) % 1440;
  if (m < 5 * 60 + 30) return 0.2;
  const h = m / 60;
  return (h >= 7 && h < 10) || (h >= 17 && h < 20) ? 1.1 : 0.9;
}

/** Попит промзон: робочий день вище, ніч — половина. */
export function industryFactor(t: number): number {
  const h = (((t % 1440) + 1440) % 1440) / 60;
  return h >= 8 && h < 19 ? 1 : h >= 6 && h < 22 ? 0.8 : 0.5;
}

export function isSub(o: PObj): boolean {
  return o.kind === 'sub110' || o.kind === 'sub330' || o.kind === 'sub750';
}

export function isLocalGen(o: PObj): boolean {
  return o.kind === 'kgu' || o.kind === 'gtu' || o.kind === 'ses' || o.kind === 'bess' || o.kind === 'wte';
}

export function objAvail(o: PObj): number {
  if (!o.built) return 0;
  let a = hpAvail(o.hp, o.maxHp);
  if (a === 0 && o.kind === 'sub110' && o.tempSub) a = 0.5;
  return a;
}

export function importMult(s: GameState): number {
  let m = 1;
  for (const im of s.importMods) if (im.until > s.t) m *= im.mult;
  return m;
}

/** Доступна генерація об’єкта зараз, МВт (без урахування мережі). */
export function availableGen(s: GameState, o: PObj): number {
  const av = objAvail(o) * (o.fireUntil > s.t ? 0.5 : 1);
  switch (o.kind) {
    case 'tpp': case 'tes': return o.cap * av * (s.season === 'summer' ? 0.55 : 1);
    case 'wte': return o.cap * av;
    case 'wes': return o.cap * av * Math.max(0.05, s.flags.wind ?? 0.5);
    case 'kgu': case 'gtu': return o.cap * av;
    case 'hpp': return Math.min(o.cap * av, Math.max(0, s.flags.hppLeft ?? 0));
    case 'ses': return o.cap * av * solarFactor(s);
    case 'pspp': case 'bess': return Math.min(o.cap * av, Math.max(0, o.soc ?? 0) * 1.0);
    case 'import': return o.cap * av * importMult(s);
    case 'sub750': return Math.min(s.importBase * importMult(s), o.cap) * av;
    default: return 0;
  }
}

function genCost(s: GameState, o: PObj): number {
  const c = B.genCost;
  switch (o.kind) {
    case 'tpp': return c.tpp;
    case 'tes': return c.tes;
    case 'hpp': return isPeakHour(s.t) ? c.hppPeak : c.hppOff;
    case 'kgu': return c.kgu;
    case 'gtu': return c.gtu;
    case 'ses': return c.ses;
    case 'pspp': case 'bess': return isPeakHour(s.t) ? c.storPeak : c.storOff;
    case 'import': return c.edge;
    case 'wte': case 'wes': return 0;
    case 'sub750': return c.import;
    default: return 1;
  }
}

export function districtDemand(s: GameState, share: number): number {
  return B.kyivBaseMW * share * demandFactor(s);
}

export interface DispatchResult {
  genTotal: number;
  demandTotal: number;
  servedTotal: number;
  importUsed: number;
}

export function dispatch(s: GameState): DispatchResult {
  const net = new FlowNet();
  const S = net.addNode();
  const T = net.addNode();
  const byId = new Map<string, PObj>();
  for (const o of s.objs) byId.set(o.id, o);

  const busNode = new Map<string, number>();
  const lvNode = new Map<string, number>();
  const distNode = new Map<string, number>();
  for (const d of s.districts) distNode.set(d.id, net.addNode());

  const genArcs: { o: PObj; arcs: Arc[]; charge?: Arc }[] = [];
  const subArcs: { o: PObj; arc: Arc }[] = [];
  const critArcs: { o: PObj; arc: Arc }[] = [];
  const heating = isHeatingSeason(s);
  const night = isNightCharge(s.t);

  for (const o of s.objs) {
    if (!o.built) continue;
    if (isSub(o)) {
      const bus = net.addNode();
      busNode.set(o.id, bus);
      const av = objAvail(o);
      if (o.kind === 'sub110') {
        const dn = o.district ? distNode.get(o.district) : undefined;
        if (dn !== undefined) subArcs.push({ o, arc: net.addArc(bus, dn, o.cap * av, 0) });
        lvNode.set(o.id, bus);
      } else {
        const lv = net.addNode();
        lvNode.set(o.id, lv);
        subArcs.push({ o, arc: net.addArc(bus, lv, o.cap * av, 0) });
        if (o.kind === 'sub750') {
          const g = availableGen(s, o);
          genArcs.push({ o, arcs: [net.addArc(S, bus, g, genCost(s, o))] });
        }
      }
    } else if (isGen(o)) {
      const node = net.addNode();
      busNode.set(o.id, node);
      lvNode.set(o.id, node);
      const g = availableGen(s, o);
      const arcs: Arc[] = [];
      const storage = o.kind === 'pspp' || o.kind === 'bess';
      if (o.kind === 'tpp' && heating) {
        const must = g * B.mustRunFrac;
        arcs.push(net.addArc(S, node, must, B.genCost.mustRun));
        arcs.push(net.addArc(S, node, g - must, genCost(s, o)));
      } else if (storage && night) {
        // уночі накопичувачі лише заряджаються
      } else {
        arcs.push(net.addArc(S, node, g, genCost(s, o)));
      }
      let charge: Arc | undefined;
      if (storage && night && objAvail(o) > 0) {
        const room = Math.max(0, (o.socMax ?? 0) - (o.soc ?? 0));
        const p = Math.min(o.pump ?? o.cap, room);
        if (p > 0.1) charge = net.addArc(node, T, p, -B.chargeValue);
      }
      genArcs.push({ o, arcs, charge });
      if (isLocalGen(o) && o.district) {
        const dn = distNode.get(o.district);
        if (dn !== undefined) net.addArc(node, dn, 1e6, 0);
      }
    }
  }

  // ЛЕП
  const lineArcs: { li: number; ab: Arc; ba: Arc }[] = [];
  s.lines.forEach((l, li) => {
    if (!l.built) return;
    const a = byId.get(l.a), b = byId.get(l.b);
    if (!a || !b || !a.built || !b.built) return;
    const na = l.kv === 110 ? lvNode.get(a.id) : busNode.get(a.id);
    const nb = l.kv === 110 ? lvNode.get(b.id) : busNode.get(b.id);
    if (na === undefined || nb === undefined) return;
    const endA = isSub(a) ? objAvail(a) : 1;
    const endB = isSub(b) ? objAvail(b) : 1;
    const cap = l.cap * hpAvail(l.hp, l.maxHp) * Math.min(endA, endB);
    lineArcs.push({ li, ab: net.addArc(na, nb, cap, B.lineCost), ba: net.addArc(nb, na, cap, B.lineCost) });
  });

  // споживачі; ліміт Укренерго обмежує сумарне побутове споживання (критичні — поза лімітом)
  const queueArcs: Arc[][] = [];
  let demandTotal = 0;
  for (const d of s.districts) d.demand = districtDemand(s, d.share);
  const limited = (s.flags.limitUntil ?? 0) > s.t;
  let sink = T;
  if (limited) {
    sink = net.addNode();
    const tot = s.districts.reduce((a, d) => a + d.demand, 0);
    net.addArc(sink, T, tot * (s.flags.limitFrac ?? 1), 0);
  }
  for (const d of s.districts) {
    const dn = distNode.get(d.id)!;
    demandTotal += d.demand;
    const arcs: Arc[] = [];
    for (let k = 0; k < 6; k++) {
      const value = B.queueValue[k] + (d.priority ? B.priorityBonus : 0);
      arcs.push(net.addArc(dn, sink, d.demand / 6, -value));
    }
    queueArcs.push(arcs);
  }
  for (const o of s.objs) {
    if (!o.district) continue;
    let dem = 0, value = 0;
    if (o.kind === 'crit') { dem = o.cap * (0.85 + 0.15 * demandFactor(s)); value = B.critValue; }
    else if (o.kind === 'metro') { dem = o.cap * metroFactor(s.t); value = 900; }
    else if (o.kind === 'industry') { dem = o.cap * industryFactor(s.t) * (1 + 0.15 * Math.max(0, demandFactor(s) - 1)); value = s.flags.indPriority ? 105 : 60; }
    else continue;
    const dn = distNode.get(o.district)!;
    demandTotal += dem;
    critArcs.push({ o, arc: net.addArc(dn, o.kind === 'industry' ? sink : T, dem, -value) });
  }

  net.solve(S, T);

  // результати
  let genTotal = 0, importUsed = 0;
  for (const o of s.objs) o.out = 0;
  for (const g of genArcs) {
    let f = 0;
    for (const a of g.arcs) f += a.flow;
    if (g.charge) f -= g.charge.flow;
    g.o.out = f;
    if (f > 0) genTotal += f;
    if (g.o.kind === 'sub750' || g.o.kind === 'import') importUsed += Math.max(0, f);
  }
  for (const sa of subArcs) {
    if (sa.o.kind !== 'sub750') sa.o.out = sa.arc.flow;
  }
  // транзит через шини 330/750 (для оцінки цінності цілей ворогом)
  for (const o of s.objs) {
    if (o.kind !== 'sub330' && o.kind !== 'sub750') continue;
    const bus = busNode.get(o.id);
    if (bus === undefined) continue;
    let through = 0;
    for (const a of net.adj[bus]) if (a.flow > 0) through += a.flow;
    o.out = Math.max(o.out, through);
  }
  for (const l of s.lines) l.flow = 0;
  for (const la of lineArcs) s.lines[la.li].flow = la.ab.flow - la.ba.flow;

  let servedTotal = 0;
  s.districts.forEach((d, i) => {
    let served = 0;
    for (const a of queueArcs[i]) served += a.flow;
    d.served = served;
    d.frac = d.demand > 0 ? Math.min(1, served / d.demand) : 1;
    d.queuesOff = Math.max(0, Math.min(6, Math.round((1 - d.frac) * 6)));
    servedTotal += served;
  });
  let industryServed = 0;
  for (const c of critArcs) {
    c.o.critServed = c.arc.flow;
    c.o.out = c.arc.flow;
    servedTotal += c.arc.flow;
    if (c.o.kind === 'industry') industryServed += c.arc.flow;
  }
  s.industryServed = industryServed;

  s.genTotal = genTotal;
  s.demandTotal = demandTotal;
  s.servedTotal = servedTotal;
  s.importUsed = importUsed;
  s.gridDirty = false;
  s.lastDispatch = s.t;
  return { genTotal, demandTotal, servedTotal, importUsed };
}

/** Тепло: частка району без опалення (0..1). */
export function updateHeat(s: GameState): void {
  const heating = isHeatingSeason(s);
  for (const d of s.districts) {
    if (!heating) {
      d.noHeat = 0;
      continue;
    }
    const src = s.objs.find((o) => o.id === d.heatSrc);
    const av = src ? objAvail(src) : 0;
    let cov = av > 0 ? Math.min(1, av + 0.3) * (src && src.fireUntil > s.t ? 0.6 : 1) : 0;
    for (const o of s.objs) {
      const near = o.district === d.id || (o.kind === 'wte' && d.id === 'dniprovskyi');
      if (!near || !o.built || objAvail(o) === 0) continue;
      if (o.kind === 'boiler') cov += 0.5;
      else if (o.kind === 'kgu') cov += 0.2;
      else if (o.kind === 'gtu') cov += 0.3;
      else if (o.kind === 'wte') cov += 0.35;
    }
    d.noHeat = Math.max(0, 1 - Math.min(1, cov));
  }
}
