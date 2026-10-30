// Безкоштовні об’єкти від подій (без циклічних імпортів з actions).
import { BUILDS } from '../data/specs';
import { rnd, rndRange } from '../core/rng';
import { districtAt, isWater } from './geo';
import type { GameState } from './types';
import { makeBuiltObj, newId } from './init';

export function buildObjectFree(s: GameState, id: string): boolean {
  const spec = BUILDS[id];
  for (let k = 0; k < 60; k++) {
    const d = s.districts[Math.floor(rnd(s) * s.districts.length)];
    const x = Math.round(d.cx + rndRange(s, -22, 22)), y = Math.round(d.cy + rndRange(s, -18, 18));
    if (isWater(x, y) || districtAt(x, y) < 0) continue;
    if (s.objs.some((o) => Math.hypot(o.x - x, o.y - y) < 6)) continue;
    const o = makeBuiltObj(s, id, x, y, false);
    s.objs.push(o);
    s.builds.push({ id: newId(s), kind: 'obj', ref: o.id, start: s.t, until: s.t + spec.days * 1440, label: `Монтаж: ${spec.name}` });
    return true;
  }
  return false;
}
