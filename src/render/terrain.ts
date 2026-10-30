// Запікання карти: вода, ліси, поля, вулиці, дороги, мости, тисячі будинків з вікнами.
import { getGeo, W, H } from '../sim/geo';
import { LANDMARKS } from '../data/mapData';
import { DISTRICTS } from '../data/objects';
import { C, SEASONS, packColor, mix } from './palette';
import { hash2, fbm } from '../core/rng';
import type { Season } from '../sim/types';
import type { SpriteBank } from './sprites';

export interface House {
  x: number;
  y: number;
  d: number;
  q: number;
  win: number[];
  /** Заводський корпус: світиться, якщо живиться промзона. */
  ind?: boolean;
}

export interface Terrain {
  canvas: HTMLCanvasElement;
  houses: House[];
  /** Ліхтарі вздовж проспектів: індекс пікселя й район. */
  street: { i: number; d: number }[];
}

function shoreDistance(water: Uint8Array): Uint8Array {
  const dist = new Uint8Array(W * H).fill(255);
  const queue: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!water[i]) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const d = dist[i];
    if (d >= 6) continue;
    const x = i % W, y = (i / W) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const j of nb) {
      if (j >= 0 && dist[j] > d + 1) {
        dist[j] = d + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}

function line(buf: Uint32Array, x0: number, y0: number, x1: number, y1: number, col: number, skip: (i: number) => boolean): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 >= 0 && y0 >= 0 && x0 < W && y0 < H) {
      const i = y0 * W + x0;
      if (!skip(i)) buf[i] = col;
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function bakeTerrain(season: Season, reserved: { x: number; y: number; r: number }[], bank: SpriteBank): Terrain {
  const g = getGeo();
  const sp = SEASONS[season];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const buf = new Uint32Array(img.data.buffer);
  const sd = shoreDistance(g.water);

  const grass = sp.grass.map((c) => packColor(c));
  const field = sp.field.map((c) => packColor(c));
  const forest = sp.forest.map((c) => packColor(c));
  const urban = sp.urban.map((c) => packColor(c));
  const street = packColor(sp.street);
  const fieldEdge = packColor(mix(sp.grass[0], '#000000', 0.25));
  const wDeep = packColor(C.waterDeep), wMid = packColor(C.water), wLight = packColor(C.waterLight), wShine = packColor(C.waterShine);
  const ice = packColor(C.ice), iceDark = packColor(C.iceDark), sand = packColor(C.sand);
  const indA = packColor(sp.snow ? '#a7a9b0' : '#5c5650'), indB = packColor(sp.snow ? '#b6b8be' : '#665f58'), indC = packColor(sp.snow ? '#999ca5' : '#514c47');

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const h = hash2(x, y, 5);
      if (g.water[i]) {
        const d = sd[i];
        let c = d <= 1 ? wLight : d <= 3 ? wMid : wDeep;
        if (sp.snow && d <= 2) c = h < 0.3 ? iceDark : ice;
        else if (h < 0.006) c = wShine;
        buf[i] = c;
        continue;
      }
      const inCity = g.district[i] >= 0 || g.town[i];
      if (g.industrial[i]) {
        buf[i] = h < 0.5 ? indA : h < 0.85 ? indB : indC;
        continue;
      }
      if (g.park[i] && inCity) {
        const n = fbm(x / 2.6, y / 2.6, 23);
        buf[i] = n > 0.55 ? forest[2] : n > 0.4 ? forest[1] : grass[1];
        continue;
      }
      if (g.forest[i]) {
        const n = fbm(x / 3.1, y / 3.1, 21);
        const crown = hash2(x >> 1, y >> 1, 9);
        let idx = n < 0.42 ? 0 : n < 0.55 ? 1 : n < 0.68 ? 4 : 2;
        if (crown > 0.86) idx = 3;
        if ((x & 1) === 0 && (y & 1) === 0 && crown > 0.5) idx = Math.min(idx + 1, 4);
        buf[i] = forest[idx];
        continue;
      }
      if (inCity) {
        buf[i] = h < 0.03 ? street : urban[h < 0.6 ? 0 : h < 0.85 ? 1 : 2];
        continue;
      }
      // поля
      const wx = x + (fbm(x / 20, y / 20, 2) - 0.5) * 10, wy = y + (fbm(x / 20, y / 20, 4) - 0.5) * 10;
      const cx = Math.floor(wx / 22), cy = Math.floor(wy / 15);
      const fx = wx / 22 - cx, fy = wy / 15 - cy;
      const fh = hash2(cx, cy, 17);
      if (fx < 0.05 || fy < 0.07) buf[i] = fieldEdge;
      else if (fh < 0.35) buf[i] = grass[h < 0.5 ? 0 : h < 0.85 ? 1 : 2];
      else buf[i] = field[Math.floor(fh * 13) % field.length];
      if (sd[i] === 0 && x > 0 && g.water[i - 1] && !sp.snow && h < 0.6) buf[i] = sand;
    }
  }

  // дороги й залізниці з маски (OSM у місті, ручні траси за ним)
  const roadCols = sp.snow
    ? [0, packColor('#c9c2a8'), packColor('#c3c7cf'), packColor('#a9aeb8'), packColor('#959aa5'), packColor('#5a4d45')]
    : [0, packColor('#d7c081'), packColor('#c3c7cf'), packColor('#a3a8b4'), packColor('#868b97'), packColor('#4a3f38')];
  const tie = packColor(sp.snow ? '#7d6e64' : '#6d5d52');
  const bridgeCol = packColor(C.bridge), rail = packColor(C.roadDark);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const r = g.road[i];
      if (g.bridge[i]) {
        buf[i] = bridgeCol;
        if (y + 1 < H && g.water[i + W] && !g.bridge[i + W]) buf[i + W] = rail;
        continue;
      }
      if (!r || g.water[i]) continue;
      if (r === 5) buf[i] = (x + y) % 3 === 0 ? tie : roadCols[5];
      else buf[i] = roadCols[r];
    }
  }

  // будинки
  const occ = new Uint8Array(W * H);
  const blocked = (x: number, y: number) => {
    for (const r of reserved) if ((x - r.x) ** 2 + (y - r.y) ** 2 < r.r * r.r) return true;
    return false;
  };
  const houses: House[] = [];
  const roofs = sp.roof.map((c) => packColor(c));
  const walls = sp.wall.map((c) => packColor(c));
  const winOff = packColor('#2a3550');
  const shadow = packColor(mix(sp.urban[0], '#000000', 0.45));
  const CX = 350, CY = 200;

  const fits = (x0: number, y0: number, w: number, h: number) => {
    if (x0 < 1 || y0 < 1 || x0 + w >= W - 1 || y0 + h >= H - 1) return false;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = y * W + x;
        if (g.water[i] || g.forest[i] || g.bridge[i] || g.road[i] || g.industrial[i] || occ[i] || (g.district[i] < 0 && !g.town[i])) return false;
      }
    }
    return true;
  };
  const SIZES: Record<string, [number, number]> = { tower: [3, 7], panel: [3, 5], hist: [4, 4], priv: [3, 3], small: [2, 3] };
  for (let gy = 0; gy < H; gy += 4) {
    for (let gx = 0; gx < W; gx += 4) {
      const i0 = gy * W + gx;
      const di = g.district[i0];
      const inTown = g.town[i0] === 1;
      if (di < 0 && !inTown) continue;
      if (hash2(gx, gy, 41) < (inTown ? 0.3 : 0.05)) continue;
      const distC = Math.hypot(gx - CX, gy - CY);
      const style = inTown ? 'private' : DISTRICTS[di].style;
      const r = hash2(gx, gy, 43);
      let first: string;
      if (style === 'private' || (distC > 95 && r < 0.55)) first = 'priv';
      else if (style === 'historic') first = r < 0.75 ? 'hist' : 'panel';
      else if (style === 'panel') first = r < 0.35 ? 'tower' : r < 0.85 ? 'panel' : 'priv';
      else first = r < 0.45 ? 'hist' : r < 0.8 ? 'panel' : 'tower';
      const order = [first, first === 'tower' ? 'panel' : 'priv', 'small'];
      let placed: { x0: number; y0: number; kind: string } | null = null;
      for (const kind of order) {
        const [w, h] = SIZES[kind];
        for (let t = 0; t < 4 && !placed; t++) {
          const x0 = gx + Math.floor(hash2(gx + t, gy, 31) * 3) - 1, y0 = gy + Math.floor(hash2(gx, gy + t, 37) * 3) - 1;
          if (fits(x0, y0, w, h) && !blocked(x0 + w / 2, y0 + h / 2)) placed = { x0, y0, kind };
        }
        if (placed) break;
      }
      if (!placed) continue;
      const { x0, y0, kind } = placed;
      const [w, h] = SIZES[kind];
      const roof = roofs[Math.floor(hash2(gx, gy, 47) * roofs.length)];
      const wall = walls[Math.floor(hash2(gx, gy, 53) * walls.length)];
      const win: number[] = [];
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          const i = y * W + x;
          occ[i] = 1;
          const lx = x - x0, ly = y - y0;
          let c = wall;
          if (kind === 'priv' || kind === 'small') {
            if (ly < (kind === 'small' ? 1 : 2)) c = roof;
            else if (lx === 1 || kind === 'small') { c = winOff; win.push(i); }
          } else if (kind === 'hist') {
            if (ly < 2) c = roof;
            else if (lx === 1 || lx === 2) { c = winOff; win.push(i); }
          } else {
            if (ly === 0) c = roof;
            else if ((lx === 0 || lx === 2) && ly % 2 === 1) { c = winOff; win.push(i); }
          }
          buf[i] = c;
        }
      }
      // тінь праворуч і знизу (лише на вільній землі)
      for (let y = y0 + 1; y <= y0 + h; y++) {
        const i = y * W + x0 + w;
        if (!occ[i] && !g.water[i] && !g.road[i]) { buf[i] = shadow; occ[i] = 1; }
      }
      for (let x = x0 + 1; x < x0 + w; x++) {
        const i = (y0 + h) * W + x;
        if (!occ[i] && !g.water[i] && !g.road[i]) { buf[i] = shadow; occ[i] = 1; }
      }
      houses.push({ x: x0, y: y0, d: inTown ? -1 : di, q: Math.floor(hash2(gx, gy, 59) * 6), win });
    }
  }

  // заводські корпуси в промзонах
  const roofInd = [packColor(sp.snow ? '#e3e8ee' : '#7f8794'), packColor(sp.snow ? '#d5dce4' : '#8b6f5a'), packColor(sp.snow ? '#eef2f6' : '#6c7380')];
  const wallInd = packColor(sp.snow ? '#7d8290' : '#4a4e58');
  for (let gy = 0; gy < H - 8; gy += 7) {
    for (let gx = 0; gx < W - 10; gx += 9) {
      const x0 = gx + Math.floor(hash2(gx, gy, 61) * 3), y0 = gy + Math.floor(hash2(gx, gy, 67) * 2);
      const w = 5 + Math.floor(hash2(gx, gy, 71) * 4), h = 3 + Math.floor(hash2(gx, gy, 73) * 2);
      let ok = true;
      for (let y = y0; y <= y0 + h && ok; y++) for (let x = x0; x <= x0 + w && ok; x++) {
        const i = y * W + x;
        if (!g.industrial[i] || g.road[i] || occ[i] || g.water[i]) ok = false;
      }
      if (!ok || hash2(gx, gy, 79) < 0.25 || blocked(x0 + w / 2, y0 + h / 2)) continue;
      const roof = roofInd[Math.floor(hash2(gx, gy, 83) * roofInd.length)];
      const win: number[] = [];
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const i = y * W + x;
        occ[i] = 1;
        if (y === y0 + h - 1) {
          if ((x - x0) % 2 === 1) { buf[i] = winOff; win.push(i); } else buf[i] = wallInd;
        } else buf[i] = roof;
      }
      for (let x = x0 + 1; x <= x0 + w; x++) { const i = (y0 + h) * W + x; if (!occ[i]) buf[i] = shadow; }
      const di = g.district[y0 * W + x0];
      houses.push({ x: x0, y: y0, d: di, q: Math.floor(hash2(gx, gy, 89) * 6), win, ind: true });
    }
  }

  const lamps: { i: number; d: number }[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const r = g.road[i];
      if ((r === 1 || r === 2) && (x * 7 + y * 13) % 4 === 0) {
        const d = g.district[i];
        if (d >= 0 || g.town[i]) lamps.push({ i, d });
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  for (const [name, x, y] of LANDMARKS) {
    const s = bank.plain[name];
    ctx.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height));
  }
  return { canvas, houses, street: lamps };
}

/** Шар вогнів у вікнах. Перемальовується, коли змінюється живлення районів. */
export class LightsLayer {
  canvas: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  private img: ImageData;
  private buf: Uint32Array;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.glow = document.createElement('canvas');
    this.glow.width = W / 4;
    this.glow.height = H / 4;
    this.img = this.canvas.getContext('2d')!.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
  }

  render(houses: House[], isOn: (d: number, q: number) => boolean, indOn: (x: number, y: number) => boolean = () => true, street: { i: number; d: number }[] = [], streetOn: (d: number) => boolean = () => true): void {
    this.buf.fill(0);
    const cols = [packColor(C.window), packColor(C.windowHot), packColor(C.windowWarm)];
    const lamp = packColor('#c27a32');
    for (const st of street) if (streetOn(st.d)) this.buf[st.i] = lamp;
    for (const h of houses) {
      if (h.ind ? !indOn(h.x, h.y) : !isOn(h.d, h.q)) continue;
      for (let k = 0; k < h.win.length; k++) {
        const i = h.win[k];
        const r = hash2(i, k, 77);
        if (r < 0.22) continue;
        this.buf[i] = cols[r < 0.8 ? 0 : r < 0.92 ? 2 : 1];
      }
    }
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0);
    const gctx = this.glow.getContext('2d')!;
    gctx.clearRect(0, 0, this.glow.width, this.glow.height);
    gctx.imageSmoothingEnabled = true;
    gctx.drawImage(this.canvas, 0, 0, this.glow.width, this.glow.height);
  }
}
