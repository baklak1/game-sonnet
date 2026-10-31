// Малювання кадру: мапа, ніч з вогнями вікон, ЛЕП з потоком енергії, об’єкти, ППО, бригади,
// загрози, ракети, вибухи, дим, пожежі, прожектори, підписи.
import { font } from '../ui/fonts';
import type { Camera } from '../core/camera';
import { darkness } from '../sim/demand';
import { DEFS, THREATS } from '../data/specs';
import { EDGE_LINES } from '../data/objects';
import { getGeo, W, H } from '../sim/geo';
import { defRange } from '../sim/combat';
import type { Defense, GameState, PObj, Season } from '../sim/types';
import { SpriteBank } from './sprites';
import { bakeTerrain, LightsLayer, type Terrain } from './terrain';
import { C } from './palette';
import { hash2 } from '../core/rng';
import { METRO_LINES, stationPos } from '../data/metro';
import { districtAt } from '../sim/geo';
import { DISTRICTS } from '../data/objects';

interface MetroGeom { id: string; color: string; dark: string; pts: [number, number][]; cum: number[]; len: number; objOf: string[]; trains: { d: number; dir: number }[] }

function buildMetroGeom(): MetroGeom[] {
  return METRO_LINES.map((l) => {
    const pts = l.stations.map((n) => stationPos(n));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const objOf = pts.map(([x, y]) => {
      let di = districtAt(x, y);
      if (di < 0) {
        let bd = 1e9;
        DISTRICTS.forEach((d, k) => { const dd = (d.lx - x) ** 2 + (d.ly - y) ** 2; if (dd < bd) { bd = dd; di = k; } });
      }
      return `metro_${l.id}_${DISTRICTS[di].id}`;
    });
    const len = cum[cum.length - 1];
    const trains = Array.from({ length: l.trains }, (_, i) => ({ d: (len * i) / l.trains, dir: i % 2 ? -1 : 1 }));
    return { id: l.id, color: l.color, dark: l.dark, pts, cum, len, objOf, trains };
  });
}

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  color: string; size: number; add: boolean; grow: number;
}

export type Selection =
  | { kind: 'obj'; id: string }
  | { kind: 'metro'; id: string }
  | { kind: 'def'; id: number }
  | { kind: 'crew'; id: number }
  | { kind: 'line'; id: string }
  | { kind: 'district'; id: string }
  | null;

export interface Ghost { x: number; y: number; ok: boolean; range: number; sprite: string }

const SMOKE_POINTS: Record<string, [number, number][]> = {
  tpp: [[2.5, -6], [-2.5, -8], [0.5, -8]],
  tes: [[-6.5, -8], [0.5, -8], [7.5, -8]],
};

/** Колір рамки-підкладки за типом об’єкта, щоб енергооб’єкти не губилися серед забудови. */
export function objColor(kind: string): string | null {
  switch (kind) {
    case 'tpp': case 'tes': case 'kgu': case 'gtu': case 'boiler': case 'wte': return '#ff8c42';
    case 'hpp': case 'pspp': return '#4fc3ff';
    case 'ses': case 'wes': case 'bess': return '#4ade80';
    case 'sub750': case 'sub330': return '#ffd400';
    case 'sub110': return '#d9c25a';
    case 'import': return '#c58cff';
    case 'crit': return '#f4f6fb';
    case 'industry': return '#9aa3b5';
    case 'pn': case 'base': case 'depot': return '#7fd3ff';
    default: return null;
  }
}

/** Великі об’єкти: підписи з ближчого масштабу й більші мітки на віддаленні. */
const MAJOR = new Set(['tpp', 'tes', 'hpp', 'pspp', 'sub750']);

export function spriteFor(o: PObj): string {
  if (o.kind === 'crit') return o.id === 'c_metro' ? 'crit_metro' : o.id === 'c_bort' ? 'crit_aer' : 'crit_water';
  return o.kind;
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  bank = new SpriteBank();
  terrain: Terrain | null = null;
  season: Season | null = null;
  lights = new LightsLayer();
  lightsKey = '';
  /** Нічна версія мапи (запечена один раз на сезон) і зведений шар вогнів зі світінням. */
  nightTerrain: HTMLCanvasElement | null = null;
  lightsFull: HTMLCanvasElement = document.createElement('canvas');
  glowSprite: HTMLCanvasElement = makeGlow();
  labelCache = new Map<string, HTMLCanvasElement>();
  metro: MetroGeom[] = buildMetroGeom();
  private lastT = -1;
  parts: Particle[] = [];
  flashes: { x: number; y: number; r: number; life: number; max: number; color: string }[] = [];
  tracers: { x1: number; y1: number; x2: number; y2: number; life: number; color: string }[] = [];
  trails = new Map<number, number[]>();
  hitFlash = new Map<string, number>();
  shake = 0;
  time = 0;
  selected: Selection = null;
  ghost: Ghost | null = null;
  lineFrom: string | null = null;
  overlay: 'none' | 'grid' | 'ad' = 'none';
  showLabels = true;
  lowFx = false;
  onSound: (name: string, x: number, y: number) => void = () => {};

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  ensureTerrain(s: GameState): void {
    if (this.terrain && this.season === s.season) return;
    const reserved = s.objs.filter((o) => o.fixed).map((o) => ({ x: o.x, y: o.y, r: o.kind === 'tpp' || o.kind === 'tes' ? 10 : o.kind === 'sub110' || o.kind === 'crit' ? 6 : 8 }));
    this.terrain = bakeTerrain(s.season, reserved, this.bank);
    this.season = s.season;
    this.lightsKey = '';
    const n = document.createElement('canvas');
    n.width = W;
    n.height = H;
    const nc = n.getContext('2d')!;
    nc.drawImage(this.terrain.canvas, 0, 0);
    nc.globalCompositeOperation = 'multiply';
    nc.fillStyle = 'rgb(48,58,104)';
    nc.fillRect(0, 0, W, H);
    this.nightTerrain = n;
    this.lightsFull.width = W;
    this.lightsFull.height = H;
  }

  /** Перетворює події симуляції на частинки та звуки. */
  consume(s: GameState): void {
    for (const e of s.fx) {
      switch (e.t) {
        case 'boom': this.explosion(e.x, e.y, e.size, e.ground); break;
        case 'kill': this.explosion(e.x, e.y, e.cls === 'drone' ? 1 : 2, false); this.onSound('kill', e.x, e.y); break;
        case 'tracer':
          this.tracers.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.09, color: e.color ? '#ffb45c' : C.tracer });
          this.onSound(e.color ? 'gepard' : 'mg', e.x1, e.y1);
          break;
        case 'launch':
          for (let i = 0; i < 5; i++) this.puff(e.x, e.y - 1, '#d9dde6', 0.9);
          this.onSound(e.def === 'interceptor' ? 'interceptor' : 'launch', e.x, e.y);
          break;
        case 'hit': this.hitFlash.set(e.id, 0.5); break;
        case 'sound': this.onSound(e.s, 0, 0); break;
        case 'siren': this.onSound(e.on ? 'siren' : 'allclear', 0, 0); break;
      }
    }
    s.fx.length = 0;
  }

  private explosion(x: number, y: number, size: number, ground: boolean): void {
    const n = this.lowFx ? 4 + size * 3 : 8 + size * 6;
    const r = 3 + size * 4;
    this.flashes.push({ x, y, r: r * 2.2, life: 0.35 + size * 0.1, max: 0.35 + size * 0.1, color: size >= 2 ? '#ff9a3c' : '#ffd166' });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.5 + Math.random()) * (6 + size * 6);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.3, max: 0.6, color: Math.random() < 0.5 ? C.fire1 : C.fire2, size: 1, add: true, grow: 0 });
    }
    if (ground) {
      for (let i = 0; i < 3 + size * 2; i++) this.puff(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, size >= 2 ? '#3a3d45' : '#6a6d75', 2.5 + size);
      this.onSound(size >= 3 ? 'bigboom' : 'boom', x, y);
      if (size >= 3) this.shake = Math.max(this.shake, 0.35);
    } else if (size === 0) this.onSound('pop', x, y);
  }

  private puff(x: number, y: number, color: string, life: number): void {
    this.parts.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: -1.5 - Math.random() * 1.5, life, max: life, color, size: 1, add: false, grow: 0.9 });
  }

  private updateParticles(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.size += p.grow * dt;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
    }
    for (const [k, v] of this.hitFlash) {
      if (v - dt <= 0) this.hitFlash.delete(k);
      else this.hitFlash.set(k, v - dt);
    }
    if (this.parts.length > 1500) this.parts.splice(0, this.parts.length - 1500);
  }

  private refreshLights(s: GameState, dark: number): void {
    const rot = Math.floor(s.t / 60) % 6;
    const key = dark > 0.01 ? s.districts.map((d) => d.queuesOff + (d.frac > 0.35 ? 'a' : 'b')).join('') + rot + s.objs.filter((o) => o.kind === 'industry').map((o) => ((o.critServed ?? 0) > o.cap * 0.5 ? 1 : 0)).join('') : 'day';
    if (key === this.lightsKey || !this.terrain) return;
    this.lightsKey = key;
    if (key === 'day') return;
    this.lights.render(this.terrain.houses, (d, q) => {
      if (d < 0) return true;
      const k = s.districts[d].queuesOff;
      return ((q - rot + 6) % 6) >= k;
    }, (x, y) => {
      // заводи світяться, якщо найближча промзона отримує живлення
      let best = 1, bd = 1e9;
      for (const o of s.objs) {
        if (o.kind !== 'industry') continue;
        const dd = (o.x - x) ** 2 + (o.y - y) ** 2;
        if (dd < bd) { bd = dd; best = o.cap > 0 ? (o.critServed ?? 0) / o.cap : 1; }
      }
      return bd > 60 * 60 ? true : best > 0.5;
    }, this.terrain.street, (d) => d < 0 || s.districts[d].frac > 0.35);
    const lc = this.lightsFull.getContext('2d')!;
    lc.clearRect(0, 0, W, H);
    lc.imageSmoothingEnabled = true;
    lc.globalAlpha = 0.8;
    lc.drawImage(this.lights.glow, 0, 0, W, H);
    lc.globalAlpha = 1;
    lc.imageSmoothingEnabled = false;
    lc.globalCompositeOperation = 'lighter';
    lc.drawImage(this.lights.canvas, 0, 0);
    lc.globalCompositeOperation = 'source-over';
  }

  draw(s: GameState, cam: Camera, dt: number): void {
    this.time += dt;
    this.updateParticles(dt);
    this.ensureTerrain(s);
    const ctx = this.ctx;
    const cw = this.canvas.width, ch = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0f1c';
    ctx.fillRect(0, 0, cw, ch);
    const sc = cam.scale;
    let [ox, oy] = cam.origin();
    if (this.shake > 0) {
      this.shake -= dt;
      ox += Math.round((Math.random() - 0.5) * 6);
      oy += Math.round((Math.random() - 0.5) * 6);
    }
    ctx.setTransform(sc, 0, 0, sc, ox, oy);
    ctx.imageSmoothingEnabled = false;
    if (this.terrain) ctx.drawImage(this.terrain.canvas, 0, 0);

    const dark = darkness(s);
    this.refreshLights(s, dark);

    this.drawLines(s, false);
    this.drawMetro(s, 0);

    if (dark > 0.01 && this.nightTerrain) {
      ctx.globalAlpha = Math.min(1, dark * 0.95);
      ctx.drawImage(this.nightTerrain, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = dark;
      ctx.drawImage(this.lightsFull, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this.drawLines(s, true);
      this.drawMetro(s, dark);
    }
    // енергооб’єкти мають власне освітлення — малюються поверх нічного затемнення
    this.drawObjects(s, dark);

    this.drawFires(s, dark);
    this.drawSearchlights(s, dark);
    this.drawDefs(s);
    this.drawCrews(s);
    this.drawThreats(s, dark);
    this.drawProjs(s);
    if ((s.flags.f16Until ?? 0) > s.t) {
      const a = this.time * 1.6;
      const fx = (s.flags.f16X ?? 0) + Math.cos(a) * 18, fy = (s.flags.f16Y ?? 0) + Math.sin(a) * 18;
      const spr = this.bank.rot('f16', a + Math.PI / 2);
      ctx.drawImage(spr, Math.round(fx - spr.width / 2), Math.round(fy - spr.height / 2));
      ctx.strokeStyle = 'rgba(127,211,255,0.35)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(s.flags.f16X ?? 0, s.flags.f16Y ?? 0, 55, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.drawParticles();
    this.drawOverlays(s, cam);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.showLabels) this.drawLabels(s, cam, dark);
  }

  private drawLines(s: GameState, nightPass: boolean): void {
    const ctx = this.ctx;
    const byId = new Map(s.objs.map((o) => [o.id, o] as const));
    const grid = this.overlay === 'grid';
    if (nightPass && !grid) {
      ctx.globalAlpha = 0.35;
    }
    // декоративні 750 кВ за край карти
    ctx.strokeStyle = '#8b6bd8';
    ctx.lineWidth = 1;
    for (const [id, x, y] of EDGE_LINES) {
      const o = byId.get(id);
      if (!o) continue;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    for (const l of s.lines) {
      const a = byId.get(l.a), b = byId.get(l.b);
      if (!a || !b) continue;
      const f = l.hp / l.maxHp;
      ctx.lineWidth = l.kv === 110 ? 0.6 : 1;
      if (!l.built) {
        ctx.strokeStyle = 'rgba(200,200,210,0.7)';
        ctx.setLineDash([2, 2]);
      } else if (f < 0.25) {
        ctx.strokeStyle = '#e63946';
        ctx.setLineDash([1.5, 2]);
      } else {
        ctx.strokeStyle = l.cable ? '#8a6a3a' : l.kv === 110 ? (grid ? '#5fd3ff' : '#6aa6c8') : grid ? '#8fa8ff' : '#7f8fd8';
        ctx.setLineDash(l.cable ? [3, 2] : []);
        if (f < 0.75) ctx.strokeStyle = '#ffb45c';
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // потік
      if (l.built && Math.abs(l.flow) > 3 && (grid || nightPass || this.selected?.kind === 'line')) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(1, Math.floor(len / 14));
        const speed = 6 + Math.min(30, Math.abs(l.flow) / 15);
        const dir = l.flow > 0 ? 1 : -1;
        ctx.fillStyle = '#ffe680';
        for (let i = 0; i < n; i++) {
          let t = ((this.time * speed) / len + i / n) % 1;
          if (dir < 0) t = 1 - t;
          ctx.fillRect(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t), 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Метро: лінії, станції (світяться, коли є живлення), поїзди. */
  private drawMetro(s: GameState, dark: number): void {
    const ctx = this.ctx;
    const dt = this.lastT < 0 ? 0 : Math.max(0, Math.min(60, s.t - this.lastT));
    if (dark === 0) this.lastT = s.t;
    const m = ((s.t % 1440) + 1440) % 1440;
    const open = m >= 5 * 60 + 30;
    const objServed = new Map<string, number>();
    for (const o of s.objs) if (o.kind === 'metro') objServed.set(o.id, (o.critServed ?? 0) / Math.max(0.01, o.cap * (open ? (m / 60 >= 7 && m / 60 < 10) || (m / 60 >= 17 && m / 60 < 20) ? 1.1 : 0.9 : 0.2)));
    const powered = (id: string) => (objServed.get(id) ?? 1) > 0.85;
    for (const g of this.metro) {
      // лінія
      ctx.globalAlpha = dark > 0 ? 0.55 : 0.8;
      ctx.strokeStyle = g.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      g.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.globalAlpha = 1;
      // станції
      g.pts.forEach(([x, y], i) => {
        const on = powered(g.objOf[i]);
        ctx.fillStyle = on ? g.color : g.dark;
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
        ctx.fillStyle = on ? (dark > 0.3 ? '#fff6d0' : '#ffffff') : '#2a2e3a';
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      });
      if (dark > 0) continue;
      // поїзди
      for (const tr of g.trains) {
        // сегмент, де зараз поїзд
        let k = 0;
        while (k < g.cum.length - 2 && g.cum[k + 1] < tr.d) k++;
        const segOn = open && powered(g.objOf[k]) && powered(g.objOf[k + 1]);
        if (segOn) {
          tr.d += tr.dir * dt * 7;
          if (tr.d >= g.len) { tr.d = g.len; tr.dir = -1; }
          if (tr.d <= 0) { tr.d = 0; tr.dir = 1; }
        }
        if (!open) continue;
        const f = (tr.d - g.cum[k]) / Math.max(0.01, g.cum[k + 1] - g.cum[k]);
        const x = g.pts[k][0] + (g.pts[k + 1][0] - g.pts[k][0]) * f, y = g.pts[k][1] + (g.pts[k + 1][1] - g.pts[k][1]) * f;
        const blink = !segOn && Math.floor(this.time * 3) % 2 === 0;
        ctx.fillStyle = blink ? '#e63946' : '#f4f6fb';
        ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
        ctx.fillStyle = g.color;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }

  private drawObjects(s: GameState, dark: number): void {
    const ctx = this.ctx;
    const blink = Math.floor(this.time * 2.5) % 2 === 0;
    for (const o of s.objs) {
      if (o.kind === 'metro') continue;
      const spr = this.bank.plain[spriteFor(o)];
      if (!spr) continue;
      const x = Math.round(o.x - spr.width / 2), y = Math.round(o.y - spr.height / 2);
      // підкладка: темний майданчик із кольоровою піксельною рамкою (кути зрізані)
      const col = objColor(o.kind);
      if (col) {
        const f = o.hp / o.maxHp;
        const pad = MAJOR.has(o.kind) ? 2 : 1;
        const px = x - pad - 1, py = y - pad - 1, pw = spr.width + 2 * pad + 2, ph = spr.height + 2 * pad + 2;
        ctx.globalAlpha = o.built ? 1 : 0.5;
        ctx.fillStyle = dark > 0.3 ? 'rgba(10,14,28,0.82)' : 'rgba(14,18,32,0.72)';
        ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
        ctx.fillStyle = o.built && f < 0.25 ? (blink ? '#ff3b4e' : '#5a1a22') : o.built && f < 0.5 ? '#ff8c42' : col;
        ctx.fillRect(px + 1, py, pw - 2, 1);
        ctx.fillRect(px + 1, py + ph - 1, pw - 2, 1);
        ctx.fillRect(px, py + 1, 1, ph - 2);
        ctx.fillRect(px + pw - 1, py + 1, 1, ph - 2);
      }
      ctx.globalAlpha = o.built ? 1 : 0.45;
      ctx.drawImage(spr, x, y);
      ctx.globalAlpha = 1;
      const top = col ? y - (MAJOR.has(o.kind) ? 2 : 1) - 1 : y;
      const hf = this.hitFlash.get(o.id);
      if (hf) {
        ctx.fillStyle = `rgba(255,80,60,${hf})`;
        ctx.fillRect(x - 1, y - 1, spr.width + 2, spr.height + 2);
      }
      if (o.kind === 'wes' && o.built) {
        const a = this.time * (0.5 + 4 * (s.flags.wind ?? 0.5)) * (o.hp > o.maxHp * 0.25 ? 1 : 0);
        ctx.strokeStyle = '#e8ecf2';
        ctx.lineWidth = 0.7;
        const hx = o.x, hy = y + 1;
        for (let k = 0; k < 3; k++) {
          const b = a + (k * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx + Math.cos(b) * 5, hy + Math.sin(b) * 5);
          ctx.stroke();
        }
      }
      if (o.kind === 'wte' && o.built && o.out > 0.5 && !this.lowFx && Math.random() < 0.06) this.puff(o.x + 3, o.y - 5, '#cfd3db', 3);
      // дим із труб
      if (o.built && (o.kind === 'tpp' || o.kind === 'tes') && o.out > 5 && !this.lowFx && Math.random() < 0.08) {
        for (const [dx, dy] of SMOKE_POINTS[o.kind]) {
          if (Math.random() < 0.5) this.puff(o.x + dx, o.y + dy, o.fireUntil > s.t ? '#2e3138' : '#d7dbe3', 3);
        }
      }
      // захист
      if (o.prot > 0) {
        ctx.fillStyle = o.prot === 1 ? '#b8a07a' : o.prot === 2 ? '#c8ccd6' : '#7a8090';
        ctx.fillRect(x - 1, y + spr.height - 3, 2, 3);
        ctx.fillRect(x + spr.width - 1, y + spr.height - 3, 2, 3);
      }
      const f = o.hp / o.maxHp;
      if (o.built && f < 0.995 && o.kind !== 'crit') {
        const bw = Math.max(6, Math.min(14, spr.width));
        const bx = Math.round(o.x - bw / 2), by = top - 3;
        ctx.fillStyle = '#11131a';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 3);
        ctx.fillStyle = f >= 0.75 ? '#4ade80' : f >= 0.5 ? '#ffd166' : f >= 0.25 ? '#ff8c42' : '#e63946';
        ctx.fillRect(bx, by, Math.max(1, Math.round(bw * f)), 1);
      }
      if (!o.built) {
        const job = s.builds.find((b) => b.ref === o.id);
        if (job) {
          const p = Math.min(1, (s.t - job.start) / (job.until - job.start));
          ctx.fillStyle = '#11131a';
          ctx.fillRect(x - 1, top - 4, spr.width + 2, 3);
          ctx.fillStyle = '#ffd400';
          ctx.fillRect(x, top - 3, Math.round(spr.width * p), 1);
        }
      }
      if (o.kind === 'crit' && (o.critServed ?? o.cap) < o.cap * 0.9) {
        if (blink) {
          ctx.fillStyle = (o.backupLeft ?? 0) > 0 ? '#ffd166' : '#e63946';
          ctx.fillRect(Math.round(o.x) - 1, top - 4, 2, 2);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawFires(s: GameState, dark: number): void {
    const ctx = this.ctx;
    for (const o of s.objs) {
      if (o.fireUntil <= s.t) continue;
      const spr = this.bank.plain[spriteFor(o)];
      const w = spr ? spr.width : 8;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,120,40,${0.25 + 0.25 * dark})`;
      const r = w * 0.9;
      ctx.beginPath();
      ctx.arc(o.x, o.y, r + Math.sin(this.time * 9) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 4; i++) {
        const fx = Math.round(o.x - w / 3 + hash2(i, Math.floor(this.time * 8), 3) * (w * 0.66));
        const fy = Math.round(o.y - 2 - hash2(i, Math.floor(this.time * 8), 5) * 4);
        ctx.fillStyle = i % 2 ? C.fire1 : C.fire2;
        ctx.fillRect(fx, fy, 1, 2);
      }
      if (!this.lowFx && Math.random() < 0.25) this.puff(o.x + (Math.random() - 0.5) * w * 0.5, o.y - 3, '#2e3138', 3.5);
    }
  }

  private drawSearchlights(s: GameState, dark: number): void {
    if (dark < 0.3) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const d of s.defs) {
      if (d.type !== 'mfg' || !d.built) continue;
      let ang = this.time * 0.6 + d.id;
      let near: { x: number; y: number } | null = null;
      let nd = 30 * 30;
      for (const th of s.threats) {
        const dd = (th.x - d.x) ** 2 + (th.y - d.y) ** 2;
        if (dd < nd) { nd = dd; near = th; }
      }
      if (near) ang = Math.atan2(near.y - d.y, near.x - d.x);
      const len = 26, spread = 0.13;
      ctx.fillStyle = `rgba(255,250,210,${0.16 * dark})`;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + Math.cos(ang - spread) * len, d.y + Math.sin(ang - spread) * len);
      ctx.lineTo(d.x + Math.cos(ang + spread) * len, d.y + Math.sin(ang + spread) * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawDefs(s: GameState): void {
    const ctx = this.ctx;
    for (const d of s.defs) {
      const name = d.type;
      const moving = d.tx !== undefined;
      const spr = moving && this.bank.rotated[name] ? this.bank.rot(name, Math.atan2((d.ty ?? d.y) - d.y, (d.tx ?? d.x) - d.x)) : this.bank.plain[name];
      ctx.globalAlpha = d.built ? 1 : 0.5;
      ctx.drawImage(spr, Math.round(d.x - spr.width / 2), Math.round(d.y - spr.height / 2));
      ctx.globalAlpha = 1;
      const spec = DEFS[d.type];
      if (spec.ammo && spec.mag < 9999 && d.built) {
        const f = d.ammo / spec.mag;
        const bx = Math.round(d.x - 3), by = Math.round(d.y + spr.height / 2 + 1);
        ctx.fillStyle = '#11131a';
        ctx.fillRect(bx - 1, by, 8, 2);
        ctx.fillStyle = f > 0.3 ? '#7fd3ff' : '#ff8c42';
        ctx.fillRect(bx, by, Math.max(0, Math.round(6 * f)), 1);
      }
      if (d.hp <= 0) {
        ctx.fillStyle = '#e63946';
        ctx.fillRect(Math.round(d.x) - 1, Math.round(d.y) - 1, 3, 1);
      }
      if (d.type === 'radar' && d.built) {
        const a = this.time * 2 + d.id;
        ctx.fillStyle = '#c8ccd6';
        ctx.fillRect(Math.round(d.x + Math.cos(a) * 3), Math.round(d.y - 3 + Math.sin(a) * 1), 1, 1);
      }
    }
  }

  private drawCrews(s: GameState): void {
    const ctx = this.ctx;
    for (const c of s.crews) {
      if (c.state === 'injured') continue;
      let ang = 0;
      if (c.state === 'move' && c.pi < c.path.length) ang = Math.atan2(c.path[c.pi + 1] - c.y, c.path[c.pi] - c.x);
      const spr = this.bank.rot('crew', ang);
      ctx.drawImage(spr, Math.round(c.x - spr.width / 2), Math.round(c.y - spr.height / 2));
      const blink = Math.floor(this.time * 4 + c.id) % 2 === 0;
      if (c.state === 'move' || c.state === 'work') {
        ctx.fillStyle = blink ? '#3a7bd5' : '#ff8c42';
        ctx.fillRect(Math.round(c.x), Math.round(c.y) - 2, 1, 1);
      }
      if (c.state === 'work' && Math.random() < 0.3) {
        this.parts.push({ x: c.x + (Math.random() - 0.5) * 4, y: c.y - 2, vx: (Math.random() - 0.5) * 6, vy: -4, life: 0.25, max: 0.25, color: '#ffe680', size: 1, add: true, grow: 0 });
      }
      if (c.state === 'shelter') {
        ctx.fillStyle = '#9aa0ad';
        ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 4, 3, 1);
      }
    }
  }

  private drawThreats(s: GameState, dark: number): void {
    const ctx = this.ctx;
    const alive = new Set<number>();
    for (const th of s.threats) {
      alive.add(th.id);
      const spec = THREATS[th.type];
      // сліди
      let tr = this.trails.get(th.id);
      if (!tr) {
        tr = [];
        this.trails.set(th.id, tr);
      }
      if (spec.cls !== 'drone') {
        tr.push(th.x, th.y);
        if (tr.length > (spec.cls === 'ballistic' ? 24 : 16)) tr.splice(0, 2);
        ctx.strokeStyle = spec.cls === 'ballistic' ? 'rgba(255,170,80,0.8)' : 'rgba(230,236,244,0.55)';
        ctx.lineWidth = spec.cls === 'ballistic' ? 1.2 : 0.8;
        ctx.beginPath();
        for (let i = 0; i < tr.length; i += 2) (i ? ctx.lineTo(tr[i], tr[i + 1]) : ctx.moveTo(tr[i], tr[i + 1]));
        ctx.stroke();
      }
      const sprName = th.type === 'iskander' || th.type === 'kinzhal' || th.type === 'zircon' ? 'ballistic' : th.type;
      let spr = this.bank.rot(sprName, th.heading);
      if (th.type === 'gerbera' && !th.identified) spr = this.bank.rot('shahed', th.heading);
      if (dark > 0.3) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = spec.cls === 'drone' ? 'rgba(255,90,70,0.35)' : 'rgba(255,200,120,0.45)';
        ctx.fillRect(Math.round(th.x) - 2, Math.round(th.y) - 2, 4, 4);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (th.lost > 0) ctx.globalAlpha = 0.6;
      ctx.drawImage(spr, Math.round(th.x - spr.width / 2), Math.round(th.y - spr.height / 2));
      ctx.globalAlpha = 1;
      if (spec.cls === 'drone' && Math.floor(this.time * 5 + th.id) % 3 === 0) {
        ctx.fillStyle = '#ff4b3a';
        ctx.fillRect(Math.round(th.x - Math.cos(th.heading) * 3), Math.round(th.y - Math.sin(th.heading) * 3), 1, 1);
      }
      if (th.type === 'jet') {
        ctx.fillStyle = Math.random() < 0.5 ? C.fire1 : C.fire2;
        ctx.fillRect(Math.round(th.x - Math.cos(th.heading) * 5), Math.round(th.y - Math.sin(th.heading) * 5), 1, 1);
      }
      // для балістики — мітка цілі
      if (spec.cls === 'ballistic') {
        const r = 4 + Math.sin(this.time * 12) * 1.5;
        ctx.strokeStyle = 'rgba(255,60,60,0.9)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(th.tx, th.ty, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const id of this.trails.keys()) if (!alive.has(id)) this.trails.delete(id);
  }

  private drawProjs(s: GameState): void {
    const ctx = this.ctx;
    for (const p of s.projs) {
      if (p.def === 'interceptor') {
        ctx.fillStyle = '#11131a';
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1);
        ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3);
        continue;
      }
      ctx.strokeStyle = 'rgba(240,240,250,0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(p.heading) * 6, p.y - Math.sin(p.heading) * 6);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      if (!this.lowFx && Math.random() < 0.5) this.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.6, max: 0.6, color: '#c8ccd6', size: 1, add: false, grow: 0.8 });
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const t of this.tracers) {
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    for (const add of [false, true]) {
      ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
      for (const p of this.parts) {
        if (p.add !== add) continue;
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = add ? a : a * 0.7;
        ctx.fillStyle = p.color;
        const sz = Math.max(1, Math.round(p.size));
        ctx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    for (const f of this.flashes) {
      const a = f.life / f.max;
      ctx.globalAlpha = a;
      ctx.drawImage(this.glowSprite, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private ring(x: number, y: number, r: number, color: string, fill?: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  private drawOverlays(s: GameState, cam: Camera): void {
    const ctx = this.ctx;
    if (this.overlay === 'ad') {
      for (const d of s.defs) {
        const spec = DEFS[d.type];
        const col = spec.kind === 'sensor' ? 'rgba(127,211,255,0.5)' : spec.kind === 'aura' ? 'rgba(155,107,216,0.6)' : 'rgba(74,222,128,0.55)';
        this.ring(d.x, d.y, defRange(s, d), col, spec.kind === 'gun' ? 'rgba(74,222,128,0.07)' : undefined);
      }
      if (s.enemyIntel) {
        for (let i = 0; i < s.enemyIntel.ad.length; i += 3) {
          ctx.fillStyle = 'rgba(230,57,70,0.8)';
          ctx.fillRect(Math.round(s.enemyIntel.ad[i]) - 1, Math.round(s.enemyIntel.ad[i + 1]) - 1, 2, 2);
        }
      }
    }
    const sel = this.selected;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    if (sel?.kind === 'obj') {
      const o = s.objs.find((oo) => oo.id === sel.id);
      if (o) {
        const spr = this.bank.plain[spriteFor(o)];
        ctx.strokeStyle = `rgba(255,212,0,${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 1 / cam.scale * 2;
        ctx.strokeRect(Math.round(o.x - spr.width / 2) - 1.5, Math.round(o.y - spr.height / 2) - 1.5, spr.width + 3, spr.height + 3);
      }
    } else if (sel?.kind === 'def') {
      const d = s.defs.find((dd) => dd.id === sel.id);
      if (d) {
        this.ring(d.x, d.y, defRange(s, d), `rgba(255,212,0,${0.6 + pulse * 0.4})`, 'rgba(255,212,0,0.06)');
        if (d.tx !== undefined && d.ty !== undefined) {
          ctx.strokeStyle = 'rgba(255,212,0,0.8)';
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.tx, d.ty);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    } else if (sel?.kind === 'crew') {
      const c = s.crews.find((cc) => cc.id === sel.id);
      if (c) {
        this.ring(c.x, c.y, 5, `rgba(255,212,0,${0.6 + pulse * 0.4})`);
        if (c.path.length && c.pi < c.path.length) {
          ctx.strokeStyle = 'rgba(255,212,0,0.6)';
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          for (let i = c.pi; i < c.path.length; i += 2) ctx.lineTo(c.path[i], c.path[i + 1]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    } else if (sel?.kind === 'line') {
      const l = s.lines.find((ll) => ll.id === sel.id);
      const a = l && s.objs.find((o) => o.id === l.a), b = l && s.objs.find((o) => o.id === l.b);
      if (a && b) {
        ctx.strokeStyle = `rgba(255,212,0,${0.6 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    if (this.lineFrom) {
      const o = s.objs.find((oo) => oo.id === this.lineFrom);
      if (o) this.ring(o.x, o.y, 7, `rgba(255,212,0,${0.6 + pulse * 0.4})`);
    }
    if (this.ghost) {
      const g = this.ghost;
      if (g.range > 0) this.ring(g.x, g.y, g.range, g.ok ? 'rgba(74,222,128,0.8)' : 'rgba(230,57,70,0.8)', g.ok ? 'rgba(74,222,128,0.08)' : 'rgba(230,57,70,0.08)');
      const spr = this.bank.plain[g.sprite];
      if (spr) {
        ctx.globalAlpha = 0.75;
        ctx.drawImage(spr, Math.round(g.x - spr.width / 2), Math.round(g.y - spr.height / 2));
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = g.ok ? '#4ade80' : '#e63946';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(Math.round(g.x) - 5.5, Math.round(g.y) - 5.5, 11, 11);
    }
  }

  /** Підпис на мапі вибраним шрифтом: u — розмір «пікселя шрифту» в пікселях пристрою (кегль ≈ 8u). */
  private label(text: string, color: string, u: number): HTMLCanvasElement {
    const f = font.def;
    const key = `${text}|${color}|${u}|${f.id}|${font.scale}`;
    let c = this.labelCache.get(key);
    if (c) return c;
    const px = Math.max(8, Math.round(8 * u * f.canvasK * font.scale));
    const o = Math.max(1, Math.round(px / 8)); // товщина піксельної обводки
    const css = `${f.id === 'rubik' || f.id === 'system' ? '600 ' : ''}${px}px ${f.family}, sans-serif`;
    c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = css;
    const w = Math.ceil(ctx.measureText(text).width) + 4 * o;
    c.width = w;
    c.height = Math.ceil(px * 1.15) + 2 * o;
    const g = c.getContext('2d')!;
    g.font = css;
    g.textBaseline = 'alphabetic';
    const bx = 2 * o, by = Math.round(px * 0.88) + o;
    // обводка: текст темним, зсунутий на «піксель» у 8 напрямках
    g.fillStyle = '#080a14';
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) g.fillText(text, bx + dx * o, by + dy * o);
    g.fillStyle = color;
    g.fillText(text, bx, by);
    if (this.labelCache.size > 400) this.labelCache.clear();
    this.labelCache.set(key, c);
    return c;
  }

  private drawLabels(s: GameState, cam: Camera, dark: number): void {
    const ctx = this.ctx;
    const dpr = cam.dpr;
    const z = cam.effZoom;
    // «піксель шрифту» в пікселях пристрою: кегль 8u, тож гліфи лягають на сітку без розмиття
    const u = Math.max(2, Math.round(1.5 * dpr));
    const lh = Math.round(9.5 * u * font.def.canvasK * font.scale);
    const put = (c: HTMLCanvasElement, x: number, y: number) => ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2));
    const onScreen = (x: number, y: number, m: number) => x > -m && y > -m && x < cam.cssW + m && y < cam.cssH + m;

    // на віддаленні — мітки енергооб’єктів постійного розміру
    if (z < 1.5) {
      for (const o of s.objs) {
        const col = objColor(o.kind);
        if (!col || !o.built) continue;
        const [x, y] = cam.toScreen(o.x, o.y);
        if (!onScreen(x, y, 10)) continue;
        const sz = Math.round((MAJOR.has(o.kind) ? 8 : o.kind === 'sub110' || o.kind === 'industry' ? 4 : 6) * dpr);
        const bw = Math.max(1, Math.round(dpr * 1.5));
        const f = o.hp / o.maxHp;
        const X = Math.round(x * dpr - sz / 2), Y = Math.round(y * dpr - sz / 2);
        ctx.fillStyle = '#080a14';
        ctx.fillRect(X - bw, Y - bw, sz + 2 * bw, sz + 2 * bw);
        ctx.fillStyle = f < 0.25 ? (Math.floor(this.time * 2.5) % 2 ? '#ff3b4e' : '#5a1a22') : f < 0.5 ? '#ff8c42' : col;
        ctx.fillRect(X, Y, sz, sz);
        if (MAJOR.has(o.kind)) {
          ctx.fillStyle = '#080a14';
          const c = Math.round(sz / 3);
          ctx.fillRect(X + c, Y + c, sz - 2 * c, sz - 2 * c);
        }
      }
    }

    // на найбільшому віддаленні підписи районів злипаються в кашу — лишаємо тільки мітки об’єктів
    if ((z < 3.2 && z >= 1.2) || this.overlay === 'grid') {
      for (const d of s.districts) {
        const [x, y] = cam.toScreen(d.cx, d.cy);
        if (!onScreen(x, y, 80)) continue;
        const pct = Math.round(d.frac * 100);
        const col = pct >= 97 ? '#a7f3c0' : pct >= 70 ? '#ffe08a' : pct >= 35 ? '#ffb070' : '#ff7a85';
        put(this.label(d.name, '#e8ecf4', u), x * dpr, y * dpr - lh * 0.5);
        const em = s.emergencyOff.includes(d.id);
        const t2 = em ? 'ЕКСТРЕНО ВИМКНЕНО' : `${pct}%${d.queuesOff > 0 ? ` · ${d.queuesOff}/6 черг` : ''}${d.noHeat > 0.3 ? ' · холод' : ''}`;
        put(this.label(t2, em ? '#ff5a68' : col, u), x * dpr, y * dpr + lh * 0.5);
      }
    }

    // назви: великі станції — з масштабу 2, підстанції 330 й імпорт — коли сховано підписи районів
    if (z >= 2) {
      const districtsShown = z < 3.2 || this.overlay === 'grid';
      for (const o of s.objs) {
        const major = MAJOR.has(o.kind);
        if (!major && (districtsShown || (o.kind !== 'sub330' && o.kind !== 'import' && o.kind !== 'wte'))) continue;
        const spr = this.bank.plain[spriteFor(o)];
        const [x, y] = cam.toScreen(o.x, o.y + (spr ? spr.height / 2 + 3 : 8));
        if (!onScreen(x, y, 60)) continue;
        put(this.label(o.name, objColor(o.kind) ?? '#d6dbe6', u), x * dpr, y * dpr + lh * 0.5);
      }
    }
    void dark;
  }

  pickObject(s: GameState, wx: number, wy: number): Selection {
    // ППО, потім обʼєкти, потім фургони бригад, потім лінії, потім район
    let best: Selection = null;
    let bd = 5;
    for (const d of s.defs) {
      const dd = Math.hypot(d.x - wx, d.y - wy);
      if (dd < bd) { bd = dd; best = { kind: 'def', id: d.id }; }
    }
    if (best) return best;
    bd = 9;
    for (const o of s.objs) {
      if (o.kind === 'metro') continue;
      const spr = this.bank.plain[spriteFor(o)];
      const r = spr ? Math.max(spr.width, spr.height) / 2 + 2 : 5;
      const dd = Math.hypot(o.x - wx, o.y - wy);
      if (dd < Math.min(r, bd)) { bd = dd; best = { kind: 'obj', id: o.id }; }
    }
    if (best) return best;
    for (const g of this.metro) {
      for (const [x, y] of g.pts) if (Math.hypot(x - wx, y - wy) < 3) return { kind: 'metro', id: g.id };
    }
    bd = 5;
    for (const c of s.crews) {
      if (c.state === 'injured') continue;
      const dd = Math.hypot(c.x - wx, c.y - wy);
      if (dd < bd) { bd = dd; best = { kind: 'crew', id: c.id }; }
    }
    if (best) return best;
    let ld = 2.5;
    for (const l of s.lines) {
      const a = s.objs.find((o) => o.id === l.a), b = s.objs.find((o) => o.id === l.b);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1;
      let t = ((wx - a.x) * dx + (wy - a.y) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(a.x + dx * t - wx, a.y + dy * t - wy);
      if (d < ld) { ld = d; best = { kind: 'line', id: l.id }; }
    }
    if (best) return best;
    const g = getGeo();
    const xi = Math.floor(wx), yi = Math.floor(wy);
    if (xi >= 0 && yi >= 0 && xi < W && yi < H) {
      const di = g.district[yi * W + xi];
      if (di >= 0) return { kind: 'district', id: s.districts[di].id };
    }
    return null;
  }
}

function makeGlow(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,230,160,0.9)');
  gr.addColorStop(0.4, 'rgba(255,140,60,0.5)');
  gr.addColorStop(1, 'rgba(255,100,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function defSprite(d: Defense): string {
  return d.type;
}
