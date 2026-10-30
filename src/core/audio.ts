// Процедурний звук на WebAudio: сирена, «мопед» шахедів, кулемети, пуски, вибухи, гул генераторів.

export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  enabled = true;
  ambient = true;
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private droneGain: GainNode | null = null;
  private genGain: GainNode | null = null;
  private sirenUntil = 0;

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startLoops();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private startLoops(): void {
    const ctx = this.ctx!;
    // гул шахедів: два розстроєні пилкоподібні + фільтр
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
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
    const trem = ctx.createOscillator();
    const tg = ctx.createGain();
    trem.frequency.value = 11;
    tg.gain.value = 0.3;
    trem.connect(tg);
    tg.connect(this.droneGain.gain);
    trem.start();
    lp.connect(this.droneGain);
    this.droneGain.connect(this.master!);
    // гул генераторів у темних районах
    this.genGain = ctx.createGain();
    this.genGain.gain.value = 0;
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 180;
    const g1 = ctx.createOscillator();
    g1.type = 'sawtooth';
    g1.frequency.value = 50;
    g1.connect(lp2);
    g1.start();
    lp2.connect(this.genGain);
    this.genGain.connect(this.master!);
  }

  setLevels(drones: number, darkFrac: number): void {
    if (!this.ctx || !this.droneGain || !this.genGain) return;
    const t = this.ctx.currentTime;
    const on = this.enabled ? 1 : 0;
    this.droneGain.gain.setTargetAtTime(on * Math.min(0.09, drones * 0.012), t, 0.3);
    this.genGain.gain.setTargetAtTime(on * (this.ambient ? Math.min(0.05, darkFrac * 0.07) : 0), t, 0.8);
  }

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

  play(name: string, vol = 1): void {
    if (!this.enabled || !this.ctx || vol < 0.03) return;
    const now = performance.now();
    const minGap: Record<string, number> = { mg: 70, gepard: 60, boom: 60, kill: 50, pop: 40, launch: 90, interceptor: 90, click: 30 };
    if (now - (this.last[name] ?? 0) < (minGap[name] ?? 0)) return;
    this.last[name] = now;
    const v = Math.min(1, vol);
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
      case 'siren': this.siren(); break;
      case 'allclear': [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.07 * v, undefined, i * 0.25)); break;
    }
  }

  private siren(): void {
    const ctx = this.ctx!;
    if (ctx.currentTime < this.sirenUntil) return;
    const dur = 7;
    this.sirenUntil = ctx.currentTime + dur;
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
