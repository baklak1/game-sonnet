// Звук: записані CC0-семпли (src/assets/sfx, див. CREDITS.md) через WebAudio.
// Якщо семпл не декодувався — процедурний запасний варіант.
import sirenUrl from '../assets/sfx/siren.ogg';
import allclearUrl from '../assets/sfx/allclear.ogg';
import boomUrl from '../assets/sfx/boom.ogg';
import bigboomUrl from '../assets/sfx/bigboom.ogg';
import killUrl from '../assets/sfx/kill.ogg';
import popUrl from '../assets/sfx/pop.ogg';
import mgUrl from '../assets/sfx/mg.ogg';
import gepardUrl from '../assets/sfx/gepard.ogg';
import launchUrl from '../assets/sfx/launch.ogg';
import interceptorUrl from '../assets/sfx/interceptor.ogg';
import droneUrl from '../assets/sfx/drone_loop.ogg';
import generatorUrl from '../assets/sfx/generator_loop.ogg';
import clickUrl from '../assets/sfx/click.ogg';
import okUrl from '../assets/sfx/ok.ogg';
import errorUrl from '../assets/sfx/error.ogg';
import buildUrl from '../assets/sfx/build.ogg';
import alarmUrl from '../assets/sfx/alarm.ogg';
import boom2Url from '../assets/sfx/boom2.ogg';
import boomFarUrl from '../assets/sfx/boom_far.ogg';
import kill2Url from '../assets/sfx/kill2.ogg';
import repairUrl from '../assets/sfx/repair.ogg';
import musicMainUrl from '../assets/music/main.ogg';

const URLS: Record<string, string> = {
  siren: sirenUrl, allclear: allclearUrl, boom: boomUrl, bigboom: bigboomUrl, kill: killUrl, pop: popUrl,
  mg: mgUrl, gepard: gepardUrl, launch: launchUrl, interceptor: interceptorUrl, drone_loop: droneUrl,
  generator_loop: generatorUrl, click: clickUrl, ok: okUrl, error: errorUrl, build: buildUrl, alarm: alarmUrl,
  boom2: boom2Url, boom_far: boomFarUrl, kill2: kill2Url, repair: repairUrl,
};

/** Варіанти: випадковий вибір, щоб звук не повторювався. */
const VARIANTS: Record<string, string[]> = { boom: ['boom', 'boom2'], kill: ['kill', 'kill2'] };

/** Відносна гучність семплів. */
const GAIN: Record<string, number> = {
  siren: 0.7, allclear: 0.6, boom: 0.8, bigboom: 1, kill: 0.5, pop: 0.35, mg: 0.45, gepard: 0.55, launch: 0.55,
  interceptor: 0.35, click: 0.35, ok: 0.4, error: 0.4, build: 0.5, alarm: 0.5, boom2: 0.8, boom_far: 0.6, kill2: 0.5, repair: 0.35,
};

async function toArrayBuffer(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) {
    const b64 = url.slice(url.indexOf(',') + 1);
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }
  const r = await fetch(url);
  return r.arrayBuffer();
}

export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  enabled = true;
  ambient = false;
  /** Гучність ефектів 0–1 (повзунок «Звуки»). */
  sfxVolume = 0.8;
  private buffers: Record<string, AudioBuffer> = {};
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private droneGain: GainNode | null = null;
  private genGain: GainNode | null = null;
  private loopsStarted = false;
  private sirenUntil = 0;
  music = true;
  musicVolume = 0.6;
  private musicGain: GainNode | null = null;
  private musicBufs: Record<string, AudioBuffer> = {};
  private musicSrc: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wantMusic: 'day' | 'alert' | 'off' = 'day';

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.75 * this.sfxVolume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.music ? this.musicVolume * 0.8 : 0;
      this.musicGain.connect(this.ctx.destination);
      void this.loadAll().then(() => this.loadMusic());
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx!;
    await Promise.all(Object.entries(URLS).map(async ([name, url]) => {
      try {
        const data = await toArrayBuffer(url);
        this.buffers[name] = await new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(data, res, rej));
      } catch {
        /* лишаємо процедурний запасний варіант */
      }
    }));
    this.startLoops();
  }

  private async loadMusic(): Promise<void> {
    const ctx = this.ctx!;
    for (const [name, url] of [['main', musicMainUrl]] as const) {
      try {
        const data = await toArrayBuffer(url);
        this.musicBufs[name] = await new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(data, res, rej));
      } catch {
        /* без музики */
      }
    }
    this.applyMusic();
  }

  /** Фонова музика: один трек по колу; під час тривоги не перемикається й не починається заново. */
  setMusic(name: 'day' | 'alert' | 'off'): void {
    if (this.wantMusic === name) return;
    this.wantMusic = name;
    this.applyMusic();
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    this.enabled = this.sfxVolume > 0;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(0.75 * this.sfxVolume, this.ctx.currentTime, 0.05);
  }

  setMusicEnabled(on: boolean, volume = this.musicVolume): void {
    this.music = on;
    this.musicVolume = volume;
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(on ? volume * 0.8 : 0, this.ctx.currentTime, 0.3);
    this.applyMusic();
  }

  private applyMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const name = this.music && this.wantMusic !== 'off' ? 'main' : 'off';
    if (this.musicSrc?.name === name) return;
    const t = ctx.currentTime;
    if (this.musicSrc) {
      const old = this.musicSrc;
      old.gain.gain.setTargetAtTime(0, t, 0.8);
      old.src.stop(t + 4);
      this.musicSrc = null;
    }
    const buf = name !== 'off' ? this.musicBufs[name] : undefined;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    // плавний вхід: гучність наростає кілька секунд (у самому файлі теж є наростання на початку кожного кола)
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 6);
    src.connect(g);
    g.connect(this.musicGain);
    src.start(t + 0.05);
    this.musicSrc = { name, src, gain: g };
  }

  private startLoops(): void {
    if (this.loopsStarted || !this.ctx) return;
    this.loopsStarted = true;
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.master!);
    this.genGain = ctx.createGain();
    this.genGain.gain.value = 0;
    this.genGain.connect(this.master!);
    const loop = (name: string, out: GainNode, rate: number) => {
      const b = this.buffers[name];
      if (!b) return false;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.playbackRate.value = rate;
      src.connect(out);
      src.start();
      return true;
    };
    // «мопед» шахедів: два шари з різною висотою — рій звучить густіше
    if (!loop('drone_loop', this.droneGain, 1)) this.procDrone();
    else loop('drone_loop', this.droneGain, 1.13);
    if (!loop('generator_loop', this.genGain, 0.8)) this.procGenerator();
  }

  private procDrone(): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    for (const f of [92, 95.5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(this.droneGain!);
  }

  private procGenerator(): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 50;
    o.connect(lp);
    o.start();
    lp.connect(this.genGain!);
  }

  setLevels(drones: number, darkFrac: number): void {
    if (!this.ctx || !this.droneGain || !this.genGain) return;
    const t = this.ctx.currentTime;
    const on = this.enabled ? 1 : 0;
    this.droneGain.gain.setTargetAtTime(on * Math.min(0.45, drones * 0.06), t, 0.3);
    this.genGain.gain.setTargetAtTime(on * (this.ambient ? Math.min(0.25, darkFrac * 0.35) : 0), t, 0.8);
  }

  private sample(name: string, vol: number, rateJitter = 0.08): boolean {
    const b = this.buffers[name];
    if (!b || !this.ctx) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * rateJitter;
    const g = this.ctx.createGain();
    g.gain.value = vol * (GAIN[name] ?? 0.5);
    src.connect(g);
    g.connect(this.master!);
    src.start();
    return true;
  }

  play(name: string, vol = 1): void {
    if (!this.enabled || !this.ctx || vol < 0.03) return;
    const now = performance.now();
    const minGap: Record<string, number> = { mg: 90, gepard: 80, boom: 70, kill: 60, pop: 50, launch: 120, interceptor: 120, click: 30, bigboom: 120 };
    if (now - (this.last[name] ?? 0) < (minGap[name] ?? 0)) return;
    this.last[name] = now;
    const v = Math.min(1, vol);
    if (name === 'siren') {
      if (this.ctx.currentTime < this.sirenUntil) return;
      this.sirenUntil = this.ctx.currentTime + 10;
      if (this.sample('siren', v, 0)) return;
      this.procSiren();
      return;
    }
    const vars = VARIANTS[name];
    const pickName = vars ? vars[Math.floor(Math.random() * vars.length)] : name;
    // далекий вибух — глухіший звук
    if ((name === 'boom' || name === 'bigboom') && v < 0.35 && this.sample('boom_far', Math.min(1, v * 2.2))) return;
    if (this.sample(pickName, v) || this.sample(name, v)) return;
    this.procedural(name, v);
  }

  // ---------- процедурний запасний варіант
  private env(g: GainNode, a: number, peak: number, d: number): void {
    const t = this.ctx!.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseBurst(dur: number, freq: number, q: number, peak: number, type: BiquadFilterType = 'bandpass', sweepTo?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.master!);
    this.env(g, 0.005, peak, dur);
    src.start(ctx.currentTime, Math.random() * 1.2, dur + 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, to?: number, delay = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    if (to) o.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + delay + dur);
    const g = ctx.createGain();
    o.connect(g);
    g.connect(this.master!);
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private procedural(name: string, v: number): void {
    switch (name) {
      case 'click': this.tone(900, 0.05, 'square', 0.05 * v); break;
      case 'ok': this.tone(660, 0.08, 'square', 0.05 * v); this.tone(990, 0.12, 'square', 0.05 * v, undefined, 0.08); break;
      case 'error': this.tone(200, 0.15, 'square', 0.06 * v); break;
      case 'mg': for (let i = 0; i < 4; i++) setTimeout(() => this.noiseBurst(0.03, 1800, 0.8, 0.12 * v), i * 45); break;
      case 'gepard': for (let i = 0; i < 3; i++) setTimeout(() => this.noiseBurst(0.05, 700, 0.7, 0.16 * v), i * 70); break;
      case 'launch': this.noiseBurst(0.7, 400, 1.2, 0.18 * v, 'bandpass', 2400); break;
      case 'interceptor': this.tone(420, 0.35, 'square', 0.03 * v, 820); break;
      case 'kill': this.noiseBurst(0.25, 900, 0.6, 0.2 * v, 'lowpass'); break;
      case 'pop': this.noiseBurst(0.12, 1200, 0.5, 0.08 * v, 'lowpass'); break;
      case 'boom': this.noiseBurst(0.7, 500, 0.5, 0.35 * v, 'lowpass', 120); this.tone(70, 0.5, 'sine', 0.3 * v, 35); break;
      case 'bigboom': this.noiseBurst(1.4, 400, 0.5, 0.5 * v, 'lowpass', 80); this.tone(55, 1.0, 'sine', 0.45 * v, 28); break;
      case 'alarm': for (let i = 0; i < 3; i++) this.tone(880, 0.12, 'square', 0.05 * v, undefined, i * 0.2); break;
      case 'build': this.tone(523, 0.1, 'triangle', 0.08 * v); this.tone(784, 0.18, 'triangle', 0.08 * v, undefined, 0.1); break;
      case 'allclear': [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.07 * v, undefined, i * 0.25)); break;
    }
  }

  private procSiren(): void {
    const ctx = this.ctx!;
    const dur = 7;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    g.connect(this.master!);
    lp.connect(g);
    const t = ctx.currentTime;
    for (const det of [0, 4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(260 + det, t);
      o.frequency.linearRampToValueAtTime(640 + det, t + 2.2);
      o.frequency.linearRampToValueAtTime(600 + det, t + 3.6);
      o.frequency.linearRampToValueAtTime(260 + det, t + dur);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 1);
    g.gain.setValueAtTime(0.09, t + dur - 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
}

export const sfx = new Sfx();

export function vibrate(ms: number): void {
  const a = (window as unknown as { Android?: { vibrate(ms: number): void } }).Android;
  try {
    if (a) a.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* немає вібрації */
  }
}
