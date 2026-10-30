// Ремонтні бригади: пошук шляху по плитках (мости важливі), вибір робіт, ремонт, втома.
import { B, DIFF, hpAvail } from '../data/balance';
import { CREWS } from '../data/specs';
import { getGeo, TILE, TW, TH } from './geo';
import { minuteOfDay } from './demand';
import type { Crew, GameState, Line, PObj } from './types';
import { objById } from './init';
import { toast } from './economy';

const KIND_W: Record<string, number> = {
  tpp: 10, tes: 9, hpp: 9, pspp: 6, sub750: 10, sub330: 7, sub110: 5, import: 3, kgu: 4, gtu: 4, bess: 5, ses: 2, boiler: 3,
  pn: 2, base: 2, depot: 2, decoy: 0.3, crit: 8,
};

export function findPath(x0: number, y0: number, x1: number, y1: number): number[] {
  const g = getGeo();
  const sx = clampT(Math.floor(x0 / TILE), TW), sy = clampT(Math.floor(y0 / TILE), TH);
  const tx = clampT(Math.floor(x1 / TILE), TW), ty = clampT(Math.floor(y1 / TILE), TH);
  const N = TW * TH;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const start = sy * TW + sx, goal = ty * TW + tx;
  gScore[start] = 0;
  // проста бінарна купа
  const heap: [number, number][] = [[0, start]];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const h = (i: number) => Math.hypot((i % TW) - tx, ((i / TW) | 0) - ty);
  let found = false;
  while (heap.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    if (cur === goal) {
      found = true;
      break;
    }
    closed[cur] = 1;
    const cx = cur % TW, cy = (cur / TW) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= TW || ny >= TH) continue;
        const ni = ny * TW + nx;
        const p = g.pass[ni];
        if (p === 0 && ni !== goal) continue;
        if (dx && dy && (g.pass[cy * TW + nx] === 0 || g.pass[ny * TW + cx] === 0)) continue;
        const cost = (dx && dy ? 1.414 : 1) * (p === 2 ? 0.8 : p === 3 ? 0.55 : 1);
        const ng = gScore[cur] + cost;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          push(ng + h(ni), ni);
        }
      }
    }
  }
  if (!found) return [x1, y1];
  const tiles: number[] = [];
  for (let c = goal; c !== -1 && c !== start; c = came[c]) tiles.push(c);
  tiles.reverse();
  const path: number[] = [];
  for (let k = 0; k < tiles.length - 1; k++) {
    const i = tiles[k];
    path.push((i % TW) * TILE + TILE / 2, ((i / TW) | 0) * TILE + TILE / 2);
  }
  path.push(x1, y1);
  return path;
}

function clampT(v: number, max: number): number {
  return Math.max(0, Math.min(max - 1, v));
}

export interface JobTarget { id: string; x: number; y: number; obj?: PObj; line?: Line }

export function jobTarget(s: GameState, id: string): JobTarget | null {
  if (id.startsWith('L:')) {
    const l = s.lines.find((ll) => ll.id === id.slice(2));
    if (!l) return null;
    const a = objById(s, l.a), b = objById(s, l.b);
    if (!a || !b) return null;
    return { id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, line: l };
  }
  const o = objById(s, id);
  return o ? { id, x: o.x, y: o.y + 4, obj: o } : null;
}

export function canFix(c: Crew, jt: JobTarget): boolean {
  const spec = CREWS[c.type];
  if (jt.line) return spec.lines.includes(jt.line.kv);
  return !!jt.obj && spec.fixes.includes(jt.obj.kind);
}

export function needsProject(o: PObj): boolean {
  return (o.kind === 'tpp' || o.kind === 'tes' || o.kind === 'hpp' || o.kind === 'pspp') && o.hp < o.maxHp * 0.25;
}

function jobDamaged(jt: JobTarget): boolean {
  if (jt.line) return jt.line.built && jt.line.hp < jt.line.maxHp - 0.01;
  const o = jt.obj!;
  return o.built && o.hp < o.maxHp - 0.01 && !needsProject(o);
}

function findJob(s: GameState, c: Crew): string | null {
  let best: string | null = null;
  let bestScore = 0;
  const count = new Map<string, number>();
  for (const cc of s.crews) if (cc.job) count.set(cc.job, (count.get(cc.job) ?? 0) + 1);
  const consider = (jt: JobTarget, weight: number, missing: number, prio: boolean) => {
    if (!canFix(c, jt) || !jobDamaged(jt)) return;
    const n = count.get(jt.id) ?? 0;
    if (n >= 3) return;
    const dist = Math.hypot(jt.x - c.x, jt.y - c.y);
    const score = (weight * missing * (prio ? 3 : 1)) / (1 + dist / 250) / (1 + n * 0.8);
    if (score > bestScore) {
      bestScore = score;
      best = jt.id;
    }
  };
  for (const o of s.objs) {
    if (!o.built || o.hp >= o.maxHp - 0.01) continue;
    const jt = { id: o.id, x: o.x, y: o.y + 4, obj: o };
    consider(jt, KIND_W[o.kind] ?? 1, 1 - o.hp / o.maxHp + (o.hp / o.maxHp < 0.75 ? 0.5 : 0), !!o.priority);
  }
  for (const l of s.lines) {
    if (!l.built || l.hp >= l.maxHp - 0.01) continue;
    const jt = jobTarget(s, 'L:' + l.id);
    if (jt) consider(jt, l.kv === 110 ? 3 : 5, 1 - l.hp / l.maxHp + (l.hp < l.maxHp * 0.75 ? 0.5 : 0), false);
  }
  return best;
}

function nearestBase(s: GameState, x: number, y: number): PObj | null {
  let best: PObj | null = null, bd = Infinity;
  for (const o of s.objs) {
    if (o.kind !== 'base' || !o.built || o.hp <= 0) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function sendCrew(s: GameState, c: Crew, jobId: string, manual = false): boolean {
  const jt = jobTarget(s, jobId);
  if (!jt || !canFix(c, jt)) return false;
  c.job = jobId;
  c.manual = manual;
  c.path = findPath(c.x, c.y, jt.x, jt.y);
  c.pi = 0;
  c.state = 'move';
  return true;
}

function goHome(s: GameState, c: Crew): void {
  const b = nearestBase(s, c.x, c.y);
  c.job = null;
  c.manual = false;
  if (!b) {
    c.state = 'rest';
    return;
  }
  if (Math.hypot(b.x - c.x, b.y - c.y) < 6) {
    c.state = 'rest';
    return;
  }
  c.path = findPath(c.x, c.y, b.x, b.y + 5);
  c.pi = 0;
  c.state = 'move';
}

function workRate(s: GameState, c: Crew, jt: JobTarget): number {
  const spec = CREWS[c.type];
  let r = spec.speed * DIFF[s.difficulty].repair;
  if (s.tech.training) r *= 1.25;
  if (c.type === 'hv' && s.tech.remote) r *= 1.15;
  if (jt.line && jt.line.kv === 110 && s.tech.remote) r *= 1.3;
  if (c.stamina < 30) r *= 0.6;
  if (s.salaryLate) r *= 0.7;
  const m = minuteOfDay(s.t);
  if (m < 6 * 60 || m > 22 * 60) r *= B.nightRepairMult;
  // складання кількох бригад
  const same = s.crews.filter((cc) => cc.state === 'work' && cc.job === c.job);
  const rank = same.indexOf(c);
  r *= rank <= 0 ? 1 : rank === 1 ? 0.8 : 0.6;
  // склад поруч прискорює ВН-ремонт
  if (c.type === 'hv' && s.objs.some((o) => o.kind === 'depot' && o.built && Math.hypot(o.x - jt.x, o.y - jt.y) < 90)) r *= 1.2;
  return r;
}

export function crewsStep(s: GameState, dtMin: number): void {
  const h = dtMin / 60;
  const alert = s.phase === 'alert' || s.threats.length > 0;
  for (const c of s.crews) {
    if (c.state === 'injured') {
      if (s.t >= c.injuredUntil) {
        c.state = 'idle';
        toast(s, `${CREWS[c.type].name} повернулася до роботи`, 'good');
      }
      continue;
    }
    if (alert && !s.crewRisk && (c.state === 'work' || c.state === 'move')) {
      c.state = 'shelter';
      continue;
    }
    if (c.state === 'shelter') {
      if (alert && !s.crewRisk) continue;
      c.state = c.job ? 'move' : 'idle';
    }
    if (c.state === 'rest') {
      c.stamina = Math.min(100, c.stamina + B.staminaRest * h);
      if (c.stamina >= 95 || (c.stamina >= 50 && s.autoRepair && !alert && findJob(s, c))) c.state = 'idle';
      else continue;
    }
    if (c.state === 'idle') {
      if (alert && !s.crewRisk) continue;
      if (s.autoRepair && c.stamina > 20) {
        const job = findJob(s, c);
        if (job) {
          sendCrew(s, c, job);
          continue;
        }
      }
      if (c.stamina < 70) goHome(s, c);
      continue;
    }
    if (c.state === 'move') {
      let step = B.crewSpeed * dtMin;
      c.stamina = Math.max(0, c.stamina - B.staminaMove * h);
      while (step > 0 && c.pi < c.path.length) {
        const px = c.path[c.pi], py = c.path[c.pi + 1];
        const d = Math.hypot(px - c.x, py - c.y);
        if (d <= step) {
          c.x = px;
          c.y = py;
          step -= d;
          c.pi += 2;
        } else {
          c.x += ((px - c.x) / d) * step;
          c.y += ((py - c.y) / d) * step;
          step = 0;
        }
      }
      if (c.pi >= c.path.length) {
        if (c.job) c.state = 'work';
        else c.state = 'rest';
      }
      continue;
    }
    if (c.state === 'work') {
      const jt = c.job ? jobTarget(s, c.job) : null;
      if (!jt || !jobDamaged(jt)) {
        c.job = null;
        c.manual = false;
        c.state = 'idle';
        continue;
      }
      const o = jt.obj;
      if (o && o.fireUntil > s.t) continue; // чекаємо, поки ДСНС загасить
      if (o && (o.kind === 'sub110' || o.kind === 'sub330' || o.kind === 'sub750') && o.hp < o.maxHp * 0.25) {
        if (s.transformers <= 0) {
          if ((s.flags[`trw_${o.id}`] ?? 0) < s.t - 600) {
            toast(s, `${o.name}: потрібен трансформатор! Купіть або дочекайтеся поставки.`, 'warn', o.id);
            s.flags[`trw_${o.id}`] = s.t;
          }
          continue;
        }
        s.transformers--;
        o.hp = o.maxHp * 0.3;
        s.gridDirty = true;
        toast(s, `${o.name}: встановлено новий трансформатор`, 'info', o.id);
      }
      const rate = workRate(s, c, jt);
      const kindKey = jt.line ? 'line' : o && ['kgu', 'gtu', 'ses', 'bess', 'boiler', 'pn', 'base', 'depot', 'decoy', 'crit', 'import'].includes(o.kind) ? 'small' : o!.kind;
      const maxHp = jt.line ? jt.line.maxHp : o!.maxHp;
      const hpNow = jt.line ? jt.line.hp : o!.hp;
      const gain = Math.min(rate * h, maxHp - hpNow);
      const cost = gain * (B.matCost[kindKey] ?? 0.2);
      if (s.money < cost) {
        if ((s.flags.noMoneyToast ?? 0) < s.t - 300) {
          toast(s, 'Немає коштів на матеріали для ремонту!', 'bad');
          s.flags.noMoneyToast = s.t;
        }
        continue;
      }
      s.money -= cost;
      s.flags.repairSpend = (s.flags.repairSpend ?? 0) + cost;
      const before = jt.line ? hpAvail(jt.line.hp, jt.line.maxHp) : hpAvail(o!.hp, o!.maxHp);
      if (jt.line) jt.line.hp = Math.min(jt.line.maxHp, jt.line.hp + gain);
      else o!.hp = Math.min(o!.maxHp, o!.hp + gain);
      s.stats.repairsHp += gain;
      const after = jt.line ? hpAvail(jt.line.hp, jt.line.maxHp) : hpAvail(o!.hp, o!.maxHp);
      if (after !== before) s.gridDirty = true;
      c.stamina = Math.max(0, c.stamina - B.staminaWork * h);
      if ((jt.line ? jt.line.hp >= jt.line.maxHp - 0.01 : o!.hp >= o!.maxHp - 0.01)) {
        if (o && o.hp / o.maxHp >= 0.999 && (o.kind === 'tpp' || o.kind === 'sub330' || o.kind === 'sub750' || o.kind === 'tes' || o.kind === 'hpp')) {
          toast(s, `${o.name} повністю відремонтовано`, 'good', o.id);
        }
        c.job = null;
        c.manual = false;
        c.state = 'idle';
      } else if (c.stamina < 12 && !c.manual) {
        goHome(s, c);
      }
    }
  }
}
