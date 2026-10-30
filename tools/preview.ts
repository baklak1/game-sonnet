// Превʼю масок карти та позицій обʼєктів (перевірка, що нічого не стоїть у воді).
import { getGeo, W, H } from '../src/sim/geo';
import { OBJECTS, DISTRICTS } from '../src/data/objects';
import { writePng } from './png';

const g = getGeo();
const S = 2;
const img = new Uint8Array(W * S * H * S * 4);
const pal = [[200,80,80],[80,200,80],[90,90,220],[200,200,80],[200,80,200],[80,200,200],[220,140,60],[140,60,220],[60,220,140],[230,230,230]];
function px(x: number, y: number, c: number[]) {
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
    const xx = x * S + dx, yy = y * S + dy;
    if (xx < 0 || yy < 0 || xx >= W * S || yy >= H * S) continue;
    const i = (yy * W * S + xx) * 4; img[i] = c[0]; img[i+1] = c[1]; img[i+2] = c[2]; img[i+3] = 255;
  }
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  let c = [50, 70, 45];
  if (g.forest[i]) c = [30, 55, 30];
  if (g.town[i]) c = [120, 110, 100];
  const d = g.district[i];
  if (d >= 0) c = pal[d].map((v) => v * 0.45 + 30);
  if (g.industrial[i]) c = [110, 90, 80];
  if (g.road[i] === 5) c = [90, 60, 50];
  else if (g.road[i]) c = [170 + g.road[i] * 0, 170, 170];
  if (g.water[i]) c = [40, 90, 160];
  if (g.bridge[i]) c = [255, 255, 255];
  px(x, y, c);
}
let bad = 0;
for (const o of OBJECTS) {
  const i = Math.floor(o.y) * W + Math.floor(o.x);
  const wet = g.water[i] === 1;
  const d = g.district[i];
  const want = o.district ? DISTRICTS.findIndex((dd) => dd.id === o.district) : null;
  const wrong = want !== null && d !== want;
  if ((wet && o.kind !== 'hpp') || wrong) { bad++; console.log('BAD', o.id, wet ? 'water' : '', wrong ? `district ${d >= 0 ? DISTRICTS[d].id : 'none'} != ${o.district}` : ''); }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) px(o.x + dx, o.y + dy, wet || wrong ? [255, 0, 0] : [255, 255, 0]);
}
writePng('tools/out/map-preview.png', W * S, H * S, img);
console.log('bad', bad);
