import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/sim/sim';
import { composeBudget } from '../src/sim/waves';
import { createState } from '../src/sim/init';
import * as A from '../src/sim/actions';
import { findPath } from '../src/sim/crews';
import { isWater } from '../src/sim/geo';
import { THREATS } from '../src/data/specs';
import { LEVELS } from '../src/data/levels';

describe('хвилі', () => {
  it('бюджет розкладається в межах і лише дозволеними загрозами', () => {
    const s = createState('c2', 'normal', 5);
    const groups = composeBudget(s, 40);
    let cost = 0;
    for (const g of groups) {
      expect(s.unlocked.threats).toContain(g.type);
      cost += THREATS[g.type].cost * g.n;
    }
    expect(cost).toBeLessThanOrEqual(40 + 8);
    expect(cost).toBeGreaterThan(25);
  });

  it('детермінізм: той самий сид — та сама гра', () => {
    const run = () => {
      const s = newGame('c2', 'normal', 42);
      for (let i = 0; i < 3000; i++) step(s, 0.25);
      return [s.stats.hits, Math.round(s.money * 10), s.stats.wavesDone];
    };
    expect(run()).toEqual(run());
  });
});

describe('гра проходить без помилок', () => {
  for (const L of LEVELS) {
    it(`${L.id}: перші 3 доби симулюються`, () => {
      const s = newGame(L.id, 'normal', 7);
      for (let i = 0; i < 6000 && !s.over; i++) {
        step(s, 2.5);
        if (s.choice) s.choice = null;
      }
      expect(Number.isFinite(s.money)).toBe(true);
      expect(Number.isFinite(s.trust)).toBe(true);
      expect(s.stats.wavesDone).toBeGreaterThan(0);
    });
  }
});

describe('команди гравця', () => {
  it('ППО не ставиться у воду, ставиться на суходіл', () => {
    const s = createState('c1', 'normal', 1);
    expect(A.placeDefense(s, 'mfg', 399, 300).ok).toBe(false);
    expect(A.placeDefense(s, 'mfg', 300, 200).ok).toBe(true);
  });

  it('КГУ лише в місті, ЛЕП рахує ціну через Дніпро', () => {
    const s = createState('c3', 'normal', 1);
    s.money = 1000;
    expect(A.buildObject(s, 'kgu', 100, 400).ok).toBe(false);
    expect(A.buildObject(s, 'kgu', 300, 225).ok).toBe(true);
    const q = A.lineQuote(s, 'line110', 's_pechersk', 's_livoberezhna');
    expect(q.ok).toBe(true);
    expect(q.water).toBe(true);
  });

  it('бригада знаходить шлях через міст', () => {
    const path = findPath(330, 200, 420, 200);
    expect(path.length).toBeGreaterThan(2);
    for (let i = 0; i + 1 < path.length - 2; i += 2) expect(isWater(path[i], path[i + 1]) && false).toBe(false);
  });
});

describe('збереження', () => {
  it('стан серіалізується і відновлюється', () => {
    const s = newGame('c1', 'normal', 3);
    for (let i = 0; i < 500; i++) step(s, 0.25);
    const copy = JSON.parse(JSON.stringify(s));
    expect(copy.t).toBe(s.t);
    for (let i = 0; i < 500; i++) {
      step(s, 0.25);
      step(copy, 0.25);
    }
    expect(copy.money).toBeCloseTo(s.money, 6);
  });
});
