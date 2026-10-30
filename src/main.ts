import { SpriteBank } from './render/sprites';
import { bakeTerrain, LightsLayer } from './render/terrain';
import { OBJECTS } from './data/objects';

const bank = new SpriteBank();
const season = (new URLSearchParams(location.search).get('s') as any) || 'autumn';
const t = bakeTerrain(season, OBJECTS.map((o) => ({ x: o.x, y: o.y, r: 6 })), bank);
const lights = new LightsLayer();
lights.render(t.houses, (d, q) => d !== 7 || q < 3);
const cv = document.getElementById('game') as HTMLCanvasElement;
const S = Number(new URLSearchParams(location.search).get('z') || 2);
const night = new URLSearchParams(location.search).get('n') === '1';
cv.width = 640 * S; cv.height = 576 * S;
const ctx = cv.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
ctx.scale(S, S);
ctx.drawImage(t.canvas, 0, 0);
for (const o of OBJECTS) {
  const name = o.kind === 'crit' ? (o.id === 'c_metro' ? 'crit_metro' : o.id === 'c_bort' ? 'crit_aer' : 'crit_water') : o.kind;
  const s = bank.plain[name];
  if (s) ctx.drawImage(s, Math.round(o.x - s.width / 2), Math.round(o.y - s.height / 2));
}
if (night) {
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(40,50,95)';
  ctx.fillRect(0, 0, 640, 576);
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.7;
  ctx.drawImage(lights.glow, 0, 0, 640, 576);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lights.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}
(window as any).__ready = true;
