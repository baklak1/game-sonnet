import { newGame, step } from '../src/sim/sim';
import { fmtTime, dayOf } from '../src/sim/demand';
const lvl = process.argv[2] || 'c1';
const diff = (process.argv[3] || 'normal') as any;
const s = newGame(lvl, diff, 12345);
const t0 = Date.now();
let lastDay = 0;
let steps = 0;
while (!s.over && s.t < 20 * 1440) {
  step(s, 1);
  steps++;
  if (s.choice) { s.choice = null; }
  const d = dayOf(s.t);
  if (d !== lastDay) {
    lastDay = d;
    console.log(`day ${d} ${fmtTime(s.t)} money=${s.money.toFixed(1)} trust=${s.trust.toFixed(1)} gen=${s.genTotal.toFixed(0)} dem=${s.demandTotal.toFixed(0)} served=${s.servedTotal.toFixed(0)} waves=${s.stats.wavesDone} hits=${s.stats.hits} downed=${JSON.stringify(s.stats.downed)} launched=${JSON.stringify(s.stats.launched)}`);
  }
}
console.log('over', s.over, 'steps', steps, 'ms', Date.now() - t0);
for (const tt of s.toasts.slice(-12)) console.log(' toast', tt.kind, tt.text);
console.log('districts', s.districts.map((d) => `${d.name}:${(d.frac*100).toFixed(0)}%`).join(' '));
