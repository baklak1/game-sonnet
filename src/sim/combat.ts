// Бій: рух загроз, РЕБ, РЛС, вогонь ППО, ракети/перехоплювачі, влучання й уламки.
import { B, DIFF, hpAvail } from '../data/balance';
import { DEFS, PROT_MULT, THREATS, protClass } from '../data/specs';
import { rnd, rndRange } from '../core/rng';
import { districtAt } from './geo';
import { darkness } from './demand';
import type { Defense, DefType, GameState, Threat, ThreatType } from './types';
import { newId, objById } from './init';
import { snapshotAD } from './enemy';
import { toast } from './economy';

function inRadar(s: GameState, x: number, y: number): boolean {
  for (const d of s.defs) {
    if (d.type !== 'radar' || !d.built || d.hp <= 0) continue;
    const r = DEFS.radar.range;
    if ((d.x - x) ** 2 + (d.y - y) ** 2 < r * r) return true;
  }
  return false;
}

function defPowered(s: GameState, d: Defense): boolean {
  if (!DEFS[d.type].needsPower) return true;
  const di = districtAt(d.x, d.y);
  if (di < 0) return true;
  return s.districts[di].frac > 0.3;
}

export function pkFor(s: GameState, d: Defense, type: ThreatType): number {
  const spec = DEFS[d.type];
  let pk = spec.pk[type] ?? 0;
  if (pk <= 0) return 0;
  if (d.type === 'mfg' && s.tech.searchlights && darkness(s) > 0.5) pk *= 1.5;
  if (spec.kind === 'gun' && s.tech.acoustic) pk += 0.1;
  if (spec.kind === 'missile' && s.tech.airforce && d.type !== 'interceptor') pk += 0.08;
  if (d.type === 'interceptor' && type === 'jet' && s.tech.interceptor2) pk += 0.2;
  if (inRadar(s, d.x, d.y)) pk += B.radarPkBonus;
  return Math.min(0.97, pk);
}

export function defRange(s: GameState, d: Defense): number {
  const spec = DEFS[d.type];
  return spec.range * ((d.type === 'mfg' || d.type === 'gepard') && s.tech.thermal ? 1.25 : 1);
}

function allowedByPolicy(s: GameState, d: Defense, th: Threat): boolean {
  const spec = DEFS[d.type];
  const cls = THREATS[th.type].cls;
  if (th.lost > 0) return false;
  if (spec.kind === 'gun' || d.type === 'manpads' || d.type === 'interceptor') return true;
  switch (d.policy) {
    case 'all': return true;
    case 'ballistic': return cls === 'ballistic';
    case 'missiles': return cls !== 'drone';
    case 'smart': {
      if (cls !== 'drone') return true;
      if (th.type === 'gerbera' && th.identified) return false;
      if (th.type === 'jet') return true;
      // по дронах — лише на підльоті до цілі, коли гармати не прикривають
      const dt = Math.hypot(th.tx - th.x, th.ty - th.y);
      if (dt > 26) return false;
      for (const g of s.defs) {
        const gs = DEFS[g.type];
        if (gs.kind !== 'gun' || !g.built || g.hp <= 0) continue;
        if ((g.x - th.x) ** 2 + (g.y - th.y) ** 2 < defRange(s, g) ** 2) return false;
      }
      return true;
    }
  }
  return true;
}

function killThreat(s: GameState, th: Threat, idx: number): void {
  const cls = THREATS[th.type].cls;
  s.fx.push({ t: 'kill', x: th.x, y: th.y, cls });
  s.stats.downed[th.type] = (s.stats.downed[th.type] ?? 0) + 1;
  if (s.waveStats && th.type !== 'recon') s.waveStats.downed++;
  s.threats.splice(idx, 1);
  // уламки
  if (cls !== 'ballistic' || rnd(s) < 0.5) {
    if (rnd(s) < B.debrisChance && districtAt(th.x, th.y) >= 0) debris(s, th.x, th.y);
  }
}

function debris(s: GameState, x: number, y: number): void {
  s.fx.push({ t: 'boom', x, y, size: 1, ground: true });
  const r2 = B.debrisRadius * B.debrisRadius;
  for (const o of s.objs) {
    if (!o.built || o.prot >= 1 || protClass(o.kind) === null) continue;
    if ((o.x - x) ** 2 + (o.y - y) ** 2 < r2) {
      damageObj(s, o.id, B.debrisDmg, false, false);
    }
  }
  for (const l of s.lines) {
    if (l.cable || !l.built || l.kv !== 110) continue;
    if (distToLine(s, l.a, l.b, x, y) < 3) {
      l.hp = Math.max(0, l.hp - 12);
      s.gridDirty = true;
    }
  }
}

export function distToLine(s: GameState, aId: string, bId: string, x: number, y: number): number {
  const a = objById(s, aId), b = objById(s, bId);
  if (!a || !b) return 999;
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1;
  let t = ((x - a.x) * dx + (y - a.y) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}

export function damageObj(s: GameState, id: string, dmg: number, missile: boolean, canFire: boolean): number {
  const o = objById(s, id);
  if (!o || !o.built) return 0;
  const mult = PROT_MULT[o.prot][missile ? 1 : 0];
  const before = o.hp;
  const availBefore = hpAvail(o.hp, o.maxHp);
  o.hp = Math.max(0, o.hp - dmg * mult);
  const lost = before - o.hp;
  if (lost > 0) {
    s.fx.push({ t: 'hit', id });
    if (canFire && rnd(s) < (missile ? B.fireChanceMissile : B.fireChanceDrone)) {
      const hours = rndRange(s, B.fireHours[0], B.fireHours[1]) * (s.tech.firefight ? 0.5 : 1);
      o.fireUntil = Math.max(o.fireUntil, s.t + hours * 60);
    }
    if (hpAvail(o.hp, o.maxHp) !== availBefore) s.gridDirty = true;
  }
  return lost;
}

function impact(s: GameState, th: Threat, idx: number): void {
  const spec = THREATS[th.type];
  s.threats.splice(idx, 1);
  if (spec.recon) {
    s.enemyIntel = { ad: snapshotAD(s), at: s.t };
    toast(s, 'Ворожий розвідник пролетів над містом: ворог знає, де стоїть ваша ППО. Перемістіть мобільні групи!', 'warn');
    return;
  }
  if (spec.decoy) {
    s.fx.push({ t: 'boom', x: th.x, y: th.y, size: 1, ground: true });
    return;
  }
  const D = DIFF[s.difficulty];
  const intelFresh = !!s.enemyIntel && s.t - s.enemyIntel.at < 3 * 1440;
  let acc = spec.acc + D.acc + (intelFresh ? B.reconAccBonus : 0) - (th.jammed ? B.ewCruiseAccPenalty : 0);
  acc = Math.max(0.2, Math.min(0.98, acc));
  const missile = spec.cls !== 'drone';
  const hit = rnd(s) < acc;
  let x = th.tx, y = th.ty;
  if (!hit) {
    const a = rnd(s) * Math.PI * 2, r = rndRange(s, B.missRadius[0], B.missRadius[1]);
    x += Math.cos(a) * r;
    y += Math.sin(a) * r;
  }
  s.fx.push({ t: 'boom', x, y, size: missile ? 3 : 2, ground: true });
  s.stats.hits++;
  if (s.waveStats) s.waveStats.hits++;
  const target = objById(s, th.target);
  if (hit && target) {
    const capBefore = target.cap * hpAvail(target.hp, target.maxHp);
    const lost = damageObj(s, target.id, spec.dmg, missile, true);
    const capAfter = target.cap * hpAvail(target.hp, target.maxHp);
    if (s.waveStats) s.waveStats.mwLost += Math.max(0, capBefore - capAfter);
    if (lost > 0) {
      const pct = Math.round((target.hp / target.maxHp) * 100);
      toast(s, `Влучання: ${target.name} — ${pct}%${target.hp / target.maxHp < 0.25 ? ' (виведено з ладу)' : ''}`, 'bad', target.id);
    }
  }
  // осколки поруч
  const r2 = B.splashRadius * B.splashRadius;
  for (const o of s.objs) {
    if (!o.built || (hit && o.id === th.target) || protClass(o.kind) === null && o.kind !== 'pn' && o.kind !== 'base' && o.kind !== 'depot') continue;
    if ((o.x - x) ** 2 + (o.y - y) ** 2 < r2) damageObj(s, o.id, spec.dmg * (hit ? 0.4 : 0.5), missile, false);
  }
  for (const l of s.lines) {
    if (l.cable || !l.built) continue;
    if (distToLine(s, l.a, l.b, x, y) < 3) {
      l.hp = Math.max(0, l.hp - (missile ? 30 : 15));
      s.gridDirty = true;
    }
  }
  for (const d of s.defs) {
    if ((d.x - x) ** 2 + (d.y - y) ** 2 < 25) d.hp = Math.max(0, d.hp - (missile ? 25 : 12));
  }
  // бригади поруч
  for (const c of s.crews) {
    if (c.state !== 'work' && c.state !== 'move') continue;
    if ((c.x - x) ** 2 + (c.y - y) ** 2 < B.injuryRadius * B.injuryRadius) {
      if (rnd(s) < B.injuryChance * (s.tech.shelters ? 0.3 : 1)) {
        c.state = 'injured';
        c.injuredUntil = s.t + rndRange(s, 3, 5) * 1440;
        c.job = null;
        c.path = [];
        toast(s, 'Повторний удар! Бригаду поранено — вона вибуває на кілька днів.', 'bad');
      }
    }
  }
}

function findTarget(s: GameState, d: Defense, range: number): Threat | null {
  let best: Threat | null = null;
  let bestScore = -1;
  const missileKind = DEFS[d.type].kind === 'missile';
  for (const th of s.threats) {
    const dx = th.x - d.x, dy = th.y - d.y;
    if (dx * dx + dy * dy > range * range) continue;
    if (pkFor(s, d, th.type) <= 0) continue;
    if (!allowedByPolicy(s, d, th)) continue;
    const cls = THREATS[th.type].cls;
    if (missileKind) {
      const maxRes = d.type === 'patriot' && cls === 'ballistic' ? 2 : 1;
      if (th.reserved >= maxRes) continue;
    }
    const w = cls === 'ballistic' ? 4 : cls === 'cruise' ? 2.5 : th.type === 'jet' ? 1.6 : th.type === 'recon' ? 1.3 : 1;
    const toT = Math.hypot(th.tx - th.x, th.ty - th.y);
    const score = w * (1 + 60 / (toT + 10));
    if (score > bestScore) {
      bestScore = score;
      best = th;
    }
  }
  return best;
}

function fire(s: GameState, d: Defense, th: Threat): void {
  const spec = DEFS[d.type];
  d.shots++;
  if (spec.kind === 'gun') {
    s.fx.push({ t: 'tracer', x1: d.x, y1: d.y - 2, x2: th.x + rndRange(s, -2, 2), y2: th.y + rndRange(s, -2, 2), color: d.type === 'gepard' ? 1 : 0 });
    if (spec.mag < 9999) d.ammo--;
    if (rnd(s) < pkFor(s, d, th.type)) {
      d.kills++;
      killThreat(s, th, s.threats.indexOf(th));
    }
  } else {
    d.ammo--;
    th.reserved++;
    s.stats.missiles++;
    s.stats.adCost += spec.ammoCost;
    if (s.waveStats) {
      s.waveStats.missilesSpent++;
      s.waveStats.adCost += spec.ammoCost;
    }
    s.projs.push({ id: newId(s), def: d.type, x: d.x, y: d.y - 2, tid: th.id, speed: spec.projSpeed, pk: pkFor(s, d, th.type), life: 12, heading: Math.atan2(th.y - d.y, th.x - d.x) });
    s.fx.push({ t: 'launch', x: d.x, y: d.y, def: d.type });
  }
}

function reload(s: GameState, d: Defense): void {
  const spec = DEFS[d.type];
  if (!spec.ammo || spec.mag >= 9999) return;
  const mag = spec.mag + (d.type === 'interceptor' && s.tech.interceptor2 ? 2 : 0);
  const need = mag - d.ammo;
  if (need <= 0) return;
  const take = Math.min(need, s.stock[spec.ammo]);
  if (take <= 0) return;
  s.stock[spec.ammo] -= take;
  d.ammo += take;
}

export function reloadAll(s: GameState): void {
  for (const d of s.defs) if (d.built) reload(s, d);
}

export function combatStep(s: GameState, dtCs: number): void {
  // рух загроз
  for (let i = s.threats.length - 1; i >= 0; i--) {
    const th = s.threats[i];
    const spec = THREATS[th.type];
    if (th.lost > 0) {
      th.lost -= dtCs;
      th.heading += rndRange(s, -0.6, 0.6) * dtCs;
      th.x += Math.cos(th.heading) * spec.speed * 0.7 * dtCs;
      th.y += Math.sin(th.heading) * spec.speed * 0.7 * dtCs;
      if (th.lost <= 0) {
        s.threats.splice(i, 1);
        s.fx.push({ t: 'boom', x: th.x, y: th.y, size: 1, ground: true });
        s.stats.downed[th.type] = (s.stats.downed[th.type] ?? 0) + 1;
        if (s.waveStats) s.waveStats.downed++;
        if (districtAt(th.x, th.y) >= 0 && rnd(s) < 0.4) debris(s, th.x, th.y);
      }
      continue;
    }
    const px = th.path[th.pi], py = th.path[th.pi + 1];
    const dx = px - th.x, dy = py - th.y;
    const dist = Math.hypot(dx, dy);
    const stepLen = spec.speed * dtCs;
    th.heading = Math.atan2(dy, dx);
    if (dist <= stepLen) {
      th.x = px;
      th.y = py;
      th.pi += 2;
      if (th.pi >= th.path.length) {
        impact(s, th, i);
        continue;
      }
    } else {
      th.x += (dx / dist) * stepLen;
      th.y += (dy / dist) * stepLen;
    }
    if (spec.cls === 'ballistic') th.prog = 1 - Math.hypot(th.tx - th.x, th.ty - th.y) / (th.dist0 || 1);
  }

  // РЕБ і РЛС
  for (const d of s.defs) {
    if (!d.built || d.hp <= 0 || d.tx !== undefined) continue;
    if (d.type === 'ew' && defPowered(s, d)) {
      const r2 = DEFS.ew.range ** 2;
      for (const th of s.threats) {
        if ((th.x - d.x) ** 2 + (th.y - d.y) ** 2 > r2) continue;
        const cls = THREATS[th.type].cls;
        if (cls === 'drone' && th.lost <= 0) {
          const chance = B.ewLoseChance * (th.type === 'jet' ? 0.5 : 1) * dtCs;
          if (rnd(s) < chance) th.lost = rndRange(s, 2, 4);
        } else if (cls === 'cruise') th.jammed = true;
      }
    } else if (d.type === 'radar') {
      const r2 = DEFS.radar.range ** 2;
      for (const th of s.threats) if (th.type === 'gerbera' && (th.x - d.x) ** 2 + (th.y - d.y) ** 2 < r2) th.identified = true;
    }
  }

  // вогонь ППО
  for (const d of s.defs) {
    const spec = DEFS[d.type];
    if (!d.built || d.hp <= 0 || d.tx !== undefined) continue;
    if (spec.kind === 'aura' || spec.kind === 'sensor') continue;
    d.cd -= dtCs;
    if (d.cd > 0) continue;
    const range = defRange(s, d);
    const th = d.ammo > 0 ? findTarget(s, d, range) : null;
    if (!th) {
      d.idle += dtCs;
      if (d.idle > B.reloadIdleCs) {
        reload(s, d);
        d.idle = 0;
      }
      d.cd = 0.2;
      continue;
    }
    d.idle = 0;
    fire(s, d, th);
    d.cd = 1 / spec.rate;
  }

  // ракети та перехоплювачі
  for (let i = s.projs.length - 1; i >= 0; i--) {
    const p = s.projs[i];
    p.life -= dtCs;
    const th = s.threats.find((t) => t.id === p.tid);
    if (!th || p.life <= 0) {
      if (th) th.reserved = Math.max(0, th.reserved - 1);
      s.projs.splice(i, 1);
      if (!th) s.fx.push({ t: 'boom', x: p.x, y: p.y, size: 0, ground: false });
      continue;
    }
    const dx = th.x - p.x, dy = th.y - p.y;
    const dist = Math.hypot(dx, dy);
    const step = p.speed * dtCs;
    p.heading = Math.atan2(dy, dx);
    if (dist <= step + 2) {
      s.projs.splice(i, 1);
      th.reserved = Math.max(0, th.reserved - 1);
      if (rnd(s) < p.pk) {
        const idx = s.threats.indexOf(th);
        const d = s.defs.find((dd) => dd.type === p.def);
        if (d) d.kills++;
        if (idx >= 0) killThreat(s, th, idx);
      } else {
        s.fx.push({ t: 'boom', x: th.x, y: th.y, size: 0, ground: false });
      }
      continue;
    }
    p.x += (dx / dist) * step;
    p.y += (dy / dist) * step;
  }
}

export function defIsMissile(t: DefType): boolean {
  return DEFS[t].kind === 'missile';
}
