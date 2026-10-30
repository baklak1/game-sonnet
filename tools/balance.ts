// Бот-балансер: грає кожну главу на кожній складності з кількома сидами.
// npx vite-node tools/balance.ts [levelId|all] [seeds] [passive]
import { newGame, step } from '../src/sim/sim';
import { botAct } from '../src/sim/bot';
import { applyChoice } from '../src/sim/events';
import { LEVELS } from '../src/data/levels';
import { avgServed } from '../src/sim/objectives';
import type { Difficulty } from '../src/sim/types';

const which = process.argv[2] || 'all';
const seeds = Number(process.argv[3] || 3);
const passive = process.argv[4] === 'passive';
const diffs: Difficulty[] = ['easy', 'normal', 'hard', 'hell'];
const levels = which === 'all' ? LEVELS.map((l) => l.id) : which === 'endless' ? ['endless'] : which.split(',');

for (const lid of levels) {
  const line: string[] = [];
  for (const d of diffs) {
    let wins = 0, served = 0, trust = 0, money = 0, waves = 0, down = 0, launched = 0;
    const reasons: Record<string, number> = {};
    for (let k = 0; k < seeds; k++) {
      const s = newGame(lid, d, 1000 + k * 77);
      let lastHour = -1;
      let guard = 0;
      while (!s.over && guard++ < 400000) {
        step(s, 2.5);
        if (s.choice) applyChoice(s, s.choice.options[0].effect);
        const h = Math.floor(s.t / 60);
        if (h !== lastHour) {
          lastHour = h;
          if (!passive) botAct(s);
        }
        if (lid === 'endless' && s.stats.wavesDone >= 40) break;
      }
      if (s.over?.win) wins++;
      served += avgServed(s);
      trust += s.stats.minTrust;
      money += s.money;
      waves += s.stats.wavesDone;
      down += Object.values(s.stats.downed).reduce((a, b) => a + b, 0);
      launched += Object.values(s.stats.launched).reduce((a, b) => a + b, 0);
      const r = s.over ? (s.over.win ? 'win' : s.over.reason.slice(0, 18)) : 'timeout';
      reasons[r] = (reasons[r] ?? 0) + 1;
    }
    line.push(`${d}: ${wins}/${seeds} серв ${(served / seeds * 100).toFixed(0)}% мінДов ${(trust / seeds).toFixed(0)} гроші ${(money / seeds).toFixed(0)} хвилі ${(waves / seeds).toFixed(1)} збито ${launched ? Math.round(down / launched * 100) : 0}% ${JSON.stringify(reasons)}`);
  }
  console.log(`== ${lid}\n  ${line.join('\n  ')}`);
}
