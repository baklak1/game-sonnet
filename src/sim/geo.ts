// Растеризація географії у маски (без canvas — працює і в Node): вода, райони, ліс, мости,
// плитки для пошуку шляху бригад.
import { CITY, DISTRICT_POLYS, ISLANDS, WATER, WORLD_H, WORLD_W } from '../data/kyivGeo';
import { DESNA, DNIPRO, FORESTS, MANUAL_ISLANDS, ROADS, TOWNS } from '../data/mapData';
import { OSM_GREEN, OSM_INDUSTRIAL, OSM_RAILS, OSM_ROADS, OSM_WATER } from '../data/kyivOsm';
import { DISTRICTS } from '../data/objects';
import { fbm } from '../core/rng';

export const W = WORLD_W;
export const H = WORLD_H;
export const TILE = 8;
export const TW = W / TILE;
export const TH = H / TILE;

/** Межі вивантаження OSM (BBBike) у світових пікселях: усередині — реальні дані, назовні — ручні. */
export const OSM_BOX = { x0: 212, y0: 49, x1: 541, y1: 333 };
export function inOsmBox(x: number, y: number): boolean {
  return x >= OSM_BOX.x0 && x <= OSM_BOX.x1 && y >= OSM_BOX.y0 && y <= OSM_BOX.y1;
}

export interface Geo {
  water: Uint8Array;
  /** Клас дороги на пікселі: 0 — немає, 1 — магістраль, 2 — головна, 3 — вулиця, 4 — мала вулиця, 5 — залізниця. */
  road: Uint8Array;
  industrial: Uint8Array;
  park: Uint8Array;
  district: Int8Array;
  forest: Uint8Array;
  bridge: Uint8Array;
  town: Uint8Array;
  /** Плитки 8×8: 0 — непрохідна (вода), 1 — суша, 2 — міст, 3 — дорога. */
  pass: Uint8Array;
  bridgeSegs: number[][];
}

export function fillPoly(mask: Uint8Array | Int8Array, flat: number[], value: number): void {
  const n = flat.length / 2;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minY = Math.min(minY, flat[i * 2 + 1]);
    maxY = Math.max(maxY, flat[i * 2 + 1]);
  }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const ax = flat[i * 2], ay = flat[i * 2 + 1];
      const j = (i + 1) % n;
      const bx = flat[j * 2], by = flat[j * 2 + 1];
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
        xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) mask[y * W + x] = value;
    }
  }
}

export function drawLine(mask: Uint8Array, x0: number, y0: number, x1: number, y1: number, value: number, keep?: (cur: number) => boolean): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 >= 0 && y0 >= 0 && x0 < W && y0 < H) {
      const i = y0 * W + x0;
      if (!keep || !keep(mask[i])) mask[i] = value;
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function fillCapsule(mask: Uint8Array, x1: number, y1: number, x2: number, y2: number, r1: number, r2: number, value: number, skip?: (x: number, y: number) => boolean): void {
  const r = Math.max(r1, r2);
  const xa = Math.max(0, Math.floor(Math.min(x1, x2) - r)), xb = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + r));
  const ya = Math.max(0, Math.floor(Math.min(y1, y2) - r)), yb = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + r));
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy || 1;
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5, py = y + 0.5;
      let t = ((px - x1) * dx + (py - y1) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = x1 + dx * t, cy = y1 + dy * t;
      const rr = r1 + (r2 - r1) * t;
      const ddx = px - cx, ddy = py - cy;
      if (ddx * ddx + ddy * ddy <= rr * rr && !(skip && skip(x, y))) mask[y * W + x] = value;
    }
  }
}

export function riverCenterAt(y: number): [number, number] {
  for (let i = 0; i + 1 < DNIPRO.length; i++) {
    const a = DNIPRO[i], b = DNIPRO[i + 1];
    if ((a[1] <= y && b[1] >= y) || (b[1] <= y && a[1] >= y)) {
      const t = (y - a[1]) / (b[1] - a[1] || 1);
      return [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return [DNIPRO[0][0], DNIPRO[0][2]];
}

let cached: Geo | null = null;

export function getGeo(): Geo {
  if (cached) return cached;
  const water = new Uint8Array(W * H);
  for (const r of WATER) fillPoly(water, r, 1);
  for (const r of ISLANDS) fillPoly(water, r, 0);
  // основне русло Дніпра й Десни — за ручною осьовою (мультиполігон річки у вивантаженні обрізаний),
  // затоки, озера, протоки — з OSM; острови вирізаються зверху
  for (let i = 0; i + 1 < DNIPRO.length; i++) {
    const a = DNIPRO[i], b = DNIPRO[i + 1];
    fillCapsule(water, a[0], a[1], b[0], b[1], a[2] / 2, b[2] / 2, 1);
  }
  for (let i = 0; i + 1 < DESNA.length; i++) {
    const a = DESNA[i], b = DESNA[i + 1];
    fillCapsule(water, a[0], a[1], b[0], b[1], a[2] / 2, b[2] / 2, 1);
  }
  for (const poly of OSM_WATER) {
    fillPoly(water, poly[0], 1);
    for (let k = 1; k < poly.length; k++) fillPoly(water, poly[k], 0);
  }
  for (const r of MANUAL_ISLANDS) fillPoly(water, r, 0);

  const district = new Int8Array(W * H).fill(-1);
  DISTRICTS.forEach((d, i) => fillPoly(district, DISTRICT_POLYS[d.id], i));
  // місто без районної розмітки на межах (артефакти спрощення) — заповнюємо найближчим районом
  const cityMask = new Uint8Array(W * H);
  fillPoly(cityMask, CITY, 1);

  const forest = new Uint8Array(W * H);
  const park = new Uint8Array(W * H);
  const industrial = new Uint8Array(W * H);
  for (const f of FORESTS) {
    // ручні ліси — лише там, де немає даних OSM
    const tmp = new Uint8Array(W * H);
    fillPoly(tmp, f, 1);
    for (let i = 0; i < W * H; i++) if (tmp[i] && !inOsmBox(i % W, (i / W) | 0)) forest[i] = 1;
  }
  for (const poly of OSM_GREEN) {
    fillPoly(park, poly[0], 1);
    for (let k = 1; k < poly.length; k++) fillPoly(park, poly[k], 0);
  }
  for (const poly of OSM_INDUSTRIAL) {
    fillPoly(industrial, poly[0], 1);
    for (let k = 1; k < poly.length; k++) fillPoly(industrial, poly[k], 0);
  }
  for (let i = 0; i < W * H; i++) {
    if (park[i]) forest[i] = 1;
  }

  const town = new Uint8Array(W * H);
  for (const [, tx, ty, tr] of TOWNS) {
    for (let y = Math.max(0, ty - tr - 3); y <= Math.min(H - 1, ty + tr + 3); y++) {
      for (let x = Math.max(0, tx - tr - 3); x <= Math.min(W - 1, tx + tr + 3); x++) {
        const d = Math.hypot(x - tx, y - ty) + (fbm(x / 6, y / 6, 3) - 0.5) * 5;
        if (d <= tr) town[y * W + x] = 1;
      }
    }
  }

  // процедурний ліс поза містом і поза даними OSM
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (district[i] >= 0 || cityMask[i] || town[i] || inOsmBox(x, y)) continue;
      if (fbm(x / 34, y / 34, 11) > 0.6) forest[i] = 1;
    }
  }

  // дороги OSM: спершу дрібні, зверху — магістралі; мости — дорожні пікселі над водою
  const road = new Uint8Array(W * H);
  const bridge = new Uint8Array(W * H);
  const bridgeSegs: number[][] = [];
  for (const r of OSM_RAILS) for (let k = 0; k + 3 < r.length; k += 2) drawLine(road, r[k], r[k + 1], r[k + 2], r[k + 3], 5);
  for (const cls of [3, 2, 1, 0]) {
    for (const r of OSM_ROADS) {
      if (r[0] !== cls) continue;
      for (let k = 2; k + 3 < r.length; k += 2) {
        drawLine(road, r[k], r[k + 1], r[k + 2], r[k + 3], cls + 1);
        if (cls === 0) drawLine(road, r[k] + 1, r[k + 1], r[k + 2] + 1, r[k + 3], 1);
        if (r[1] && cls <= 2) {
          drawLine(bridge, r[k], r[k + 1], r[k + 2], r[k + 3], 1);
          bridgeSegs.push([r[k], r[k + 1], r[k + 2], r[k + 3]]);
        }
      }
    }
  }
  // ручні траси за межами міста
  for (const r of ROADS) {
    for (let k = 0; k + 3 < r.length; k += 2) {
      const n = Math.ceil(Math.hypot(r[k + 2] - r[k], r[k + 3] - r[k + 1]));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(r[k] + ((r[k + 2] - r[k]) * i) / (n || 1)), y = Math.round(r[k + 1] + ((r[k + 3] - r[k + 1]) * i) / (n || 1));
        if (x < 0 || y < 0 || x >= W || y >= H || inOsmBox(x, y)) continue;
        const ii = y * W + x;
        if (!road[ii]) road[ii] = 2;
      }
    }
  }
  for (let i = 0; i < W * H; i++) if (bridge[i] && !water[i]) bridge[i] = 0;
  // гребля ГЕС як міст
  bridgeSegs.push([343, 80, 357, 80]);
  for (let x = 343; x <= 357; x++) bridge[80 * W + x] = 1;

  for (let i = 0; i < W * H; i++) {
    if (water[i] || bridge[i]) forest[i] = 0;
    if (water[i]) industrial[i] = 0;
  }

  const pass = new Uint8Array(TW * TH);
  for (let ty = 0; ty < TH; ty++) {
    for (let tx = 0; tx < TW; tx++) {
      let wcount = 0, bcount = 0, rcount = 0;
      for (let y = ty * TILE; y < ty * TILE + TILE; y++) {
        for (let x = tx * TILE; x < tx * TILE + TILE; x++) {
          const i = y * W + x;
          if (water[i]) wcount++;
          if (bridge[i]) bcount++;
          if (road[i] >= 1 && road[i] <= 3) rcount++;
        }
      }
      pass[ty * TW + tx] = bcount > 0 ? 2 : wcount > TILE * TILE * 0.55 ? 0 : rcount >= 3 ? 3 : 1;
    }
  }

  cached = { water, road, industrial, park, district, forest, bridge, town, pass, bridgeSegs };
  return cached;
}

export function districtAt(x: number, y: number): number {
  const g = getGeo();
  const xi = Math.floor(x), yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return -1;
  return g.district[yi * W + xi];
}

export function isWater(x: number, y: number): boolean {
  const g = getGeo();
  const xi = Math.floor(x), yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return true;
  return g.water[yi * W + xi] === 1;
}

/** Частка водних пікселів уздовж відрізка (для вартості ЛЕП через Дніпро). */
export function crossesWater(x1: number, y1: number, x2: number, y2: number): boolean {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  let run = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / (n || 1);
    if (isWater(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) {
      run++;
      if (run >= 3) return true;
    } else run = 0;
  }
  return false;
}
