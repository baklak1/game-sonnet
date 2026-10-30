// Растеризація географії у маски (без canvas — працює і в Node): вода, райони, ліс, мости,
// плитки для пошуку шляху бригад.
import { CITY, DISTRICT_POLYS, ISLANDS, WATER, WORLD_H, WORLD_W } from '../data/kyivGeo';
import { BRIDGES, DESNA, DNIPRO, FORESTS, MANUAL_ISLANDS, TOWNS } from '../data/mapData';
import { DISTRICTS } from '../data/objects';
import { fbm } from '../core/rng';

export const W = WORLD_W;
export const H = WORLD_H;
export const TILE = 8;
export const TW = W / TILE;
export const TH = H / TILE;

export interface Geo {
  water: Uint8Array;
  district: Int8Array;
  forest: Uint8Array;
  bridge: Uint8Array;
  town: Uint8Array;
  /** Плитки 8×8: 0 — непрохідна (вода), 1 — суша, 2 — міст. */
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

export function fillCapsule(mask: Uint8Array, x1: number, y1: number, x2: number, y2: number, r1: number, r2: number, value: number): void {
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
      if (ddx * ddx + ddy * ddy <= rr * rr) mask[y * W + x] = value;
    }
  }
}

function riverCenterAt(y: number): [number, number] {
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
  for (let i = 0; i + 1 < DNIPRO.length; i++) {
    const a = DNIPRO[i], b = DNIPRO[i + 1];
    fillCapsule(water, a[0], a[1], b[0], b[1], a[2] / 2, b[2] / 2, 1);
  }
  for (let i = 0; i + 1 < DESNA.length; i++) {
    const a = DESNA[i], b = DESNA[i + 1];
    fillCapsule(water, a[0], a[1], b[0], b[1], a[2] / 2, b[2] / 2, 1);
  }
  for (const r of ISLANDS) fillPoly(water, r, 0);
  for (const r of MANUAL_ISLANDS) fillPoly(water, r, 0);

  const district = new Int8Array(W * H).fill(-1);
  DISTRICTS.forEach((d, i) => fillPoly(district, DISTRICT_POLYS[d.id], i));
  // місто без районної розмітки на межах (артефакти спрощення) — заповнюємо найближчим районом
  const cityMask = new Uint8Array(W * H);
  fillPoly(cityMask, CITY, 1);

  const forest = new Uint8Array(W * H);
  for (const f of FORESTS) fillPoly(forest, f, 1);

  const town = new Uint8Array(W * H);
  for (const [, tx, ty, tr] of TOWNS) {
    for (let y = Math.max(0, ty - tr - 3); y <= Math.min(H - 1, ty + tr + 3); y++) {
      for (let x = Math.max(0, tx - tr - 3); x <= Math.min(W - 1, tx + tr + 3); x++) {
        const d = Math.hypot(x - tx, y - ty) + (fbm(x / 6, y / 6, 3) - 0.5) * 5;
        if (d <= tr) town[y * W + x] = 1;
      }
    }
  }

  // процедурний ліс поза містом
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (district[i] >= 0 || cityMask[i] || town[i]) continue;
      if (fbm(x / 34, y / 34, 11) > 0.6) forest[i] = 1;
    }
  }

  const bridge = new Uint8Array(W * H);
  const bridgeSegs: number[][] = [];
  for (const [, by] of BRIDGES) {
    const [cx, w] = riverCenterAt(by);
    const x1 = cx - w / 2 - 3, x2 = cx + w / 2 + 3;
    bridgeSegs.push([x1, by, x2, by]);
    for (let x = Math.floor(x1); x <= Math.ceil(x2); x++) {
      for (let dy = 0; dy <= 1; dy++) {
        const i = (by + dy) * W + x;
        if (i >= 0 && i < W * H) bridge[i] = 1;
      }
    }
  }
  // гребля ГЕС як міст
  bridgeSegs.push([343, 80, 357, 80]);
  for (let x = 343; x <= 357; x++) bridge[80 * W + x] = 1;

  for (let i = 0; i < W * H; i++) {
    if (water[i] || bridge[i]) forest[i] = 0;
  }

  const pass = new Uint8Array(TW * TH);
  for (let ty = 0; ty < TH; ty++) {
    for (let tx = 0; tx < TW; tx++) {
      let wcount = 0, bcount = 0;
      for (let y = ty * TILE; y < ty * TILE + TILE; y++) {
        for (let x = tx * TILE; x < tx * TILE + TILE; x++) {
          const i = y * W + x;
          if (water[i]) wcount++;
          if (bridge[i]) bcount++;
        }
      }
      pass[ty * TW + tx] = bcount > 0 ? 2 : wcount > TILE * TILE * 0.55 ? 0 : 1;
    }
  }

  cached = { water, district, forest, bridge, town, pass, bridgeSegs };
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
