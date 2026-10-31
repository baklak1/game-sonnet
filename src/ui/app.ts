// Контролер застосунку: екрани, ігровий цикл, введення, HUD, панелі, модалки, навчання.
import { Camera } from '../core/camera';
import { attachInput } from '../core/input';
import { sfx, vibrate } from '../core/audio';
import { clearRun, loadProgress, loadRun, resetAll, saveProgress, saveRun, type Progress } from '../core/save';
import { Renderer, spriteFor, type Selection } from '../render/renderer';
import { iconImg } from '../render/icons';
import { BUILDS, CREWS, DEFS, LINE_SPECS } from '../data/specs';
import { LEVELS, levelById } from '../data/levels';
import { B, DIFF } from '../data/balance';
import { nextNews } from '../data/news';
import { newGame, skipToEvening, step } from '../sim/sim';
import { darkness, dayOf, temperature } from '../sim/demand';
import * as A from '../sim/actions';
import { applyChoice } from '../sim/events';
import { districtAt } from '../sim/geo';
import type { AmmoType, CrewType, DefType, Difficulty, FirePolicy, GameState } from '../sim/types';
import * as P from './panels';
import * as S from './screens';
import { Tutorial } from './tutorial';
import { applyFont, fontById, loadFont } from './fonts';

type Mode =
  | { t: 'none' }
  | { t: 'def'; def: DefType; x?: number; y?: number }
  | { t: 'build'; id: string; x?: number; y?: number }
  | { t: 'line'; spec: string; a?: string; b?: string }
  | { t: 'move'; defId: number }
  | { t: 'assign'; crewId: number }
  | { t: 'f16' };

type PanelKind = 'build' | 'def' | 'crews' | 'grid' | 'sched' | 'tech' | 'hq' | 'sel' | null;

const $ = (id: string) => document.getElementById(id)!;

export class App {
  canvas = $('game') as HTMLCanvasElement;
  cam = new Camera();
  r = new Renderer(this.canvas);
  s: GameState | null = null;
  demo: GameState | null = null;
  progress: Progress = loadProgress();
  mode: Mode = { t: 'none' };
  panel: PanelKind = null;
  buildTab = 'gen';
  screenStack: string[] = [];
  chosenDiff: Difficulty = 'normal';
  briefId = 'c1';
  lastFrame = performance.now();
  hudTimer = 0;
  panelTimer = 0;
  toastEls: { el: HTMLElement; until: number }[] = [];
  tickerX = 0;
  tickerI = 0;
  lastReportDay = -1;
  tutorial: Tutorial | null = null;
  inGame = false;
  frameSkip = false;

  constructor() {
    this.buildDom();
    this.applySettings();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    attachInput(this.canvas, this.cam, {
      tap: (x, y) => this.onTap(x, y),
      longPress: (x, y) => this.onTap(x, y),
    });
    document.addEventListener('click', (e) => this.onClick(e), true);
    // повзунки налаштувань: застосовуються під час перетягування, зберігаються після відпускання
    document.addEventListener('input', (e) => this.onSlider(e, false), true);
    document.addEventListener('change', (e) => this.onSlider(e, true), true);
    document.addEventListener('pointerdown', () => sfx.unlock(), { once: false, capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.s) {
        this.s.paused = true;
        saveRun(this.s);
        this.updateHud(true);
      }
    });
    (window as unknown as { onAndroidBack: () => void }).onAndroidBack = () => this.back();
    (window as unknown as { onAndroidPause: () => void }).onAndroidPause = () => {
      if (this.s) {
        this.s.paused = true;
        saveRun(this.s);
      }
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.back();
      if (!this.inGame || !this.s) return;
      if (e.key === ' ') { e.preventDefault(); this.togglePause(); }
      if (e.key >= '1' && e.key <= '5') this.setSpeed(Number(e.key));
      if (e.key === '+' || e.key === '=') this.setSpeed(Math.min(5, Math.max(1, B.speeds.indexOf(this.s.speed)) + 1));
      if (e.key === '-') this.setSpeed(Math.max(1, B.speeds.indexOf(this.s.speed) - 1));
    });
    this.r.onSound = (name, x, y) => this.sound(name, x, y);
    this.demo = newGame('endless', 'easy', 7);
    this.demo.t = 22 * 60;
    this.showScreen('main');
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------- DOM
  buildDom(): void {
    $('ui').innerHTML = `
      <div id="hud" class="hidden">
        <div id="topbar"></div>
        <div id="toolbar">
          ${this.toolBtn('build', 'build', 'Будувати')}${this.toolBtn('def', 'shield', 'ППО')}${this.toolBtn('crews', 'crew', 'Бригади')}
          ${this.toolBtn('grid', 'bolt', 'Мережа')}${this.toolBtn('sched', 'bulb', 'Графіки')}${this.toolBtn('tech', 'tech', 'Техн.')}${this.toolBtn('hq', 'hq', 'Штаб')}
        </div>
        <div id="panel" class="pix hidden"></div>
        <div id="toasts"></div>
        <div id="forecast" class="pix"></div>
        <div id="buildbar" class="pix hidden"></div>
        <div id="tutor" class="hidden"></div>
        <div id="ticker"><span class="lbl">НОВИНИ</span><span class="run" id="tickerRun"></span></div>
      </div>
      <div id="screen" class="hidden"></div>
      <div id="modal" class="hidden"></div>`;
  }

  toolBtn(panel: string, ico: string, label: string): string {
    return `<button data-act="panel" data-arg="${panel}" id="tb_${panel}">${iconImg(ico)}<span>${label}</span></button>`;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.progress.settings.lowFx ? 1.5 : 2.5);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.cam.cssW = w;
    this.cam.cssH = h;
    this.cam.dpr = dpr;
    this.cam.setZoom(this.cam.zoom);
    this.fitHud();
  }

  applySettings(): void {
    const st = this.progress.settings;
    sfx.setSfxVolume(st.sfxPct / 100);
    sfx.ambient = st.ambient;
    sfx.setMusicEnabled(st.musicPct > 0, st.musicPct / 100);
    applyFont(st.font, st.fontScale);
    this.r.labelCache.clear();
    this.r.lowFx = st.lowFx;
  }

  // ---------------- екрани
  showScreen(name: string, push = true): void {
    if (push && this.screenStack[this.screenStack.length - 1] !== name) this.screenStack.push(name);
    const el = $('screen');
    el.classList.remove('hidden');
    el.classList.toggle('overmap', name === 'main');
    $('hud').classList.add('hidden');
    this.inGame = false;
    let html = '';
    switch (name) {
      case 'main': {
        const run = loadRun();
        const label = run ? `${run.mode === 'endless' ? 'Безкінечна' : levelById(run.levelId).title} · день ${dayOf(run.t)}` : '';
        html = S.mainMenu(!!run, label);
        break;
      }
      case 'campaign': html = S.campaignMenu(this.progress); break;
      case 'brief': html = S.briefing(levelById(this.briefId), this.chosenDiff); break;
      case 'endless': html = S.endlessMenu(this.progress, this.chosenDiff); break;
      case 'howto': html = S.howTo(); break;
      case 'about': html = S.about(); break;
      case 'settings': html = S.settingsMenu(this.progress); break;
      case 'results': {
        const s = this.s!;
        const L = levelById(s.levelId);
        const idx = LEVELS.findIndex((l) => l.id === s.levelId);
        html = S.results(s, L, idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1].id : null);
        break;
      }
    }
    el.innerHTML = html;
    el.scrollTop = 0;
  }

  hideScreen(): void {
    $('screen').classList.add('hidden');
    this.screenStack = [];
  }

  // ---------------- старт гри
  startLevel(levelId: string): void {
    this.s = newGame(levelId, this.chosenDiff);
    this.enterGame();
    if (levelId === 'c1' && !this.progress.tutorialDone) this.tutorial = new Tutorial();
    else this.tutorial = null;
  }

  enterGame(): void {
    this.hideScreen();
    $('hud').classList.remove('hidden');
    this.inGame = true;
    this.mode = { t: 'none' };
    this.panel = null;
    this.r.selected = null;
    this.r.ghost = null;
    this.r.lineFrom = null;
    this.lastReportDay = this.s?.lastWaveReport?.day ?? -1;
    $('panel').classList.add('hidden');
    $('buildbar').classList.add('hidden');
    this.cam.zoom = Math.max(this.cam.minZoom(), Math.min(3, this.cam.cssW / 300));
    this.cam.focus(350, 205);
    this.cam.setZoom(this.cam.zoom);
    this.r.lightsKey = '';
    this.updateHud(true);
  }

  // ---------------- цикл
  frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    if (this.progress.settings.lowFx) {
      this.frameSkip = !this.frameSkip;
      if (this.frameSkip) return;
    }
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const s = this.inGame ? this.s : this.demo;
    if (!s) return;
    if (this.inGame && this.s) {
      const blocked = !$('modal').classList.contains('hidden');
      if (!blocked) step(this.s, dt * this.s.speed);
      this.afterStep(dt);
    } else if (this.demo) {
      // фон меню: нічний Київ, повільний дрейф камери
      this.demo.t = 22 * 60 + 30;
      this.cam.x = 350 + Math.sin(now / 9000) * 40;
      this.cam.y = 200 + Math.cos(now / 11000) * 20;
      this.cam.zoom = Math.max(this.cam.minZoom(), this.cam.cssW / 420);
    }
    this.r.showLabels = this.inGame;
    this.r.consume(s);
    this.r.draw(s, this.cam, dt);
  }

  afterStep(dt: number): void {
    const s = this.s!;
    // звуковий фон
    let drones = 0;
    const [vx0, vy0] = this.cam.toWorld(0, 0), [vx1, vy1] = this.cam.toWorld(this.cam.cssW, this.cam.cssH);
    for (const th of s.threats) if (th.x > vx0 && th.x < vx1 && th.y > vy0 && th.y < vy1 && (th.type === 'shahed' || th.type === 'gerbera' || th.type === 'jet')) drones++;
    const dark = darkness(s);
    const unserved = s.demandTotal > 0 ? 1 - s.servedTotal / s.demandTotal : 0;
    sfx.setLevels(drones, dark > 0.3 ? unserved : 0);

    // тости
    while (s.toasts.length) this.showToast(s.toasts.shift()!);
    const now = performance.now();
    for (let i = this.toastEls.length - 1; i >= 0; i--) {
      if (this.toastEls[i].until < now) {
        this.toastEls[i].el.remove();
        this.toastEls.splice(i, 1);
      }
    }
    this.tickTicker(dt);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.2;
      this.updateHud(false);
    }
    this.panelTimer -= dt;
    if (this.panelTimer <= 0 && this.panel) {
      this.panelTimer = 0.6;
      this.renderPanel();
    }
    if (s.flags.autosave) {
      s.flags.autosave = 0;
      saveRun(s);
    }
    if (s.flags.alertStarted) {
      s.flags.alertStarted = 0;
      if (this.progress.settings.autopause) {
        s.paused = true;
        this.updateHud(true);
        this.showToast({ text: 'Тривога! Гру поставлено на паузу — розставте ППО й оберіть швидкість.', kind: 'warn' });
      }
    }
    if (this.tutorial) this.tutorial.update(this, s);
    // модалки
    if ($('modal').classList.contains('hidden')) {
      if (s.choice) this.showChoice();
      else if (s.lastWaveReport && s.lastWaveReport.day !== this.lastReportDay) {
        this.lastReportDay = s.lastWaveReport.day;
        this.showReport();
      } else if (s.over) this.finish();
    }
  }

  // ---------------- HUD
  private hudBuilt = false;

  buildHud(): void {
    $('topbar').innerHTML = `<div class="stats">
      <div class="stat">${iconImg('money')}<b id="h_money"></b></div>
      <div class="stat">${iconImg('bolt')}<b id="h_served"></b><span id="h_dem" class="opt"></span><div class="bar opt"><i id="h_bar"></i></div></div>
      <div class="stat">${iconImg('bulb')}<b id="h_frac"></b></div>
      <div class="stat">${iconImg('heart')}<b id="h_trust"></b></div>
      <div class="stat opt2">${iconImg('thermo')}<b id="h_temp"></b></div>
      <div class="stat" id="h_time"></div>
      <div class="phase" id="h_phase"></div></div>
      <div class="speed">
        <button id="h_s0" data-act="speed" data-arg="0" title="Пауза (пробіл)">II</button>
        <button id="h_s1" data-act="speed" data-arg="1" title="1 хв = 1 год">1</button>
        <button id="h_s2" data-act="speed" data-arg="2" title="×2">2</button>
        <button id="h_s3" data-act="speed" data-arg="3" title="×5">3</button>
        <button id="h_s4" data-act="speed" data-arg="4" title="×10">4</button>
        <button id="h_s5" data-act="speed" data-arg="5" title="×20">5</button>
        <button id="h_skip" data-act="skip" title="До вечора">⏭</button>
        <button data-act="pauseMenu">☰</button>
      </div>`;
    this.hudBuilt = true;
  }

  private hudFitAt = 0;
  private hudLen = -1;

  /** Підганяє кегль шапки й підписів тулбара, щоб нічого не обрізалося за будь-якого шрифту й розміру. */
  fitHud(): void {
    const tb = document.getElementById('topbar');
    const st = tb?.querySelector('.stats') as HTMLElement | null;
    if (tb && st && tb.offsetParent !== null) {
      const over = () => st.scrollWidth > st.clientWidth + 1 || tb.scrollWidth > tb.clientWidth + 1;
      const shrink = (min: number) => {
        let k = 1;
        tb.style.setProperty('--hudk', '1');
        while (k > min && over()) {
          k -= 0.05;
          tb.style.setProperty('--hudk', k.toFixed(2));
        }
      };
      // спершу зменшуємо кегль; якщо не досить — ховаємо другорядне (температура, смужка попиту)
      tb.classList.remove('tight');
      shrink(0.7);
      if (over()) {
        tb.classList.add('tight');
        shrink(0.4);
      }
    }
    const bar = document.getElementById('toolbar');
    if (bar && bar.offsetParent !== null) {
      const spans = [...bar.querySelectorAll('button span')] as HTMLElement[];
      const over = () => spans.some((e) => e.scrollWidth > (e.parentElement as HTMLElement).clientWidth - 2);
      let q = 1;
      bar.style.setProperty('--tbk', '1');
      while (q > 0.5 && over()) {
        q -= 0.05;
        bar.style.setProperty('--tbk', q.toFixed(2));
      }
    }
  }

  updateHud(_force: boolean): void {
    // підгонка шапки — коли змінилась довжина тексту (з’явилась цифра) або раз на 1,5 с
    const now = performance.now();
    const tb = document.getElementById('topbar');
    const len = tb && tb.offsetParent !== null ? (tb.textContent ?? '').length : -1;
    if (len >= 0 && (_force || len !== this.hudLen || now - this.hudFitAt > 1500)) {
      this.hudFitAt = now;
      this.hudLen = len;
      this.fitHud();
    }
    const s = this.s;
    if (!s) return;
    if (!this.hudBuilt) this.buildHud();
    const frac = s.demandTotal > 0 ? s.servedTotal / s.demandTotal : 1;
    const col = frac >= 0.97 ? '#4ade80' : frac >= 0.7 ? '#ffd166' : frac >= 0.4 ? '#ff8c42' : '#ff5a68';
    const tcol = s.trust >= 60 ? '#a7f3c0' : s.trust >= 30 ? '#ffe08a' : '#ff8a94';
    const dark = darkness(s) > 0.5;
    const alert = s.phase === 'alert' || s.threats.length > 0;
    sfx.setMusic(s.over ? 'day' : alert ? 'alert' : 'day');
    const phase = alert ? ['alert', 'ТРИВОГА'] : dark ? ['night', 'НІЧ'] : ['day', 'ДЕНЬ'];
    const sp = s.paused ? 0 : Math.max(1, B.speeds.indexOf(s.speed));
    const set = (id: string, text: string) => { const e = $(id); if (e.textContent !== text) e.textContent = text; };
    set('h_money', A.fmtMoney(s.money));
    set('h_served', String(Math.round(s.servedTotal)));
    set('h_dem', `/${Math.round(s.demandTotal)} МВт`);
    const bar = $('h_bar');
    bar.style.width = `${Math.round(frac * 100)}%`;
    bar.style.background = col;
    set('h_frac', `${Math.round(frac * 100)}%`);
    $('h_frac').style.color = col;
    set('h_trust', String(Math.round(s.trust)));
    $('h_trust').style.color = tcol;
    set('h_temp', `${Math.round(temperature(s))}°`);
    set('h_time', P.timeLabel(s));
    const ph = $('h_phase');
    set('h_phase', phase[1]);
    if (ph.className !== `phase ${phase[0]}`) ph.className = `phase ${phase[0]}`;
    for (const v of [0, 1, 2, 3, 4, 5]) $('h_s' + v).classList.toggle('on', sp === v);
    ($('h_skip') as HTMLButtonElement).disabled = alert;
    const fc = P.forecastHtml(s);
    const fe = $('forecast');
    if (fe.dataset.h !== fc) {
      fe.innerHTML = fc;
      fe.dataset.h = fc;
    }
    fe.classList.toggle('hidden', !fc || this.panel !== null);
    for (const k of ['build', 'def', 'crews', 'grid', 'sched', 'tech', 'hq']) $('tb_' + k).classList.toggle('on', this.panel === k);
  }

  showToast(t: { text: string; kind: string; obj?: string }): void {
    const el = document.createElement('div');
    el.className = `toast ${t.kind}`;
    el.textContent = t.text;
    if (t.obj) {
      el.dataset.act = 'focusObj';
      el.dataset.arg = t.obj;
    }
    $('toasts').prepend(el);
    this.toastEls.push({ el, until: performance.now() + (t.kind === 'bad' ? 5000 : 4000) });
    while (this.toastEls.length > 3) {
      const old = this.toastEls.shift()!;
      old.el.remove();
    }
    if (t.kind === 'bad' && this.progress.settings.vibro) vibrate(40);
  }

  tickTicker(dt: number): void {
    const run = $('tickerRun');
    if (!run.textContent || this.tickerX < -run.offsetWidth) {
      const s = this.s!;
      const parts: string[] = [];
      while (s.news.length && parts.length < 2) parts.push(s.news.shift()!);
      for (let i = 0; i < 3; i++) parts.push(nextNews(this.tickerI++, s.seed));
      run.textContent = parts.join('   ◆   ');
      this.tickerX = window.innerWidth;
    }
    this.tickerX -= dt * 45;
    run.style.transform = `translateX(${Math.round(this.tickerX)}px)`;
  }

  // ---------------- панелі
  openPanel(kind: PanelKind): void {
    if (this.panel === kind && kind !== 'sel') {
      this.closePanel();
      return;
    }
    this.panel = kind;
    this.panelTimer = 0;
    $('panel').classList.remove('hidden');
    $('panel').scrollTop = 0;
    this.renderPanel();
    this.updateHud(true);
  }

  closePanel(): void {
    this.panel = null;
    $('panel').classList.add('hidden');
    this.r.selected = null;
    this.updateHud(true);
  }

  renderPanel(): void {
    const s = this.s;
    if (!s || !this.panel) return;
    let html = '';
    switch (this.panel) {
      case 'build': html = P.buildPanel(s, this.buildTab); break;
      case 'def': html = P.defensePanel(s, this.r.overlay === 'ad'); break;
      case 'crews': html = P.crewsPanel(s); break;
      case 'grid': html = P.gridPanel(s, this.r.overlay === 'grid'); break;
      case 'sched': html = P.schedulePanel(s); break;
      case 'tech': html = P.techPanel(s); break;
      case 'hq': html = P.hqPanel(s); break;
      case 'sel': {
        const sel = this.r.selected;
        if (!sel) { this.closePanel(); return; }
        if (sel.kind === 'obj') {
          const o = s.objs.find((oo) => oo.id === sel.id);
          if (!o) { this.closePanel(); return; }
          html = P.objPanel(s, o);
        } else if (sel.kind === 'def') html = P.defPanel(s, sel.id);
        else if (sel.kind === 'crew') html = P.crewPanel(s, sel.id);
        else if (sel.kind === 'line') html = P.linePanel(s, sel.id);
        else if (sel.kind === 'metro') html = P.metroPanel(s, sel.id);
        else html = P.districtPanel(s, sel.id);
        if (!html) { this.closePanel(); return; }
        break;
      }
    }
    const el = $('panel');
    const full = `<button class="close" data-act="closePanel">✕</button>${html}`;
    if (el.dataset.h === full) return;
    const st = el.scrollTop;
    el.innerHTML = full;
    el.dataset.h = full;
    el.scrollTop = st;
  }

  // ---------------- взаємодія з картою
  onTap(x: number, y: number): void {
    if (!this.inGame || !this.s) return;
    const s = this.s;
    const [wx, wy] = this.cam.toWorld(x, y);
    const m = this.mode;
    switch (m.t) {
      case 'def': case 'build': {
        m.x = Math.round(wx);
        m.y = Math.round(wy);
        this.updateGhost();
        return;
      }
      case 'line': {
        const sel = this.r.pickObject(s, wx, wy);
        if (sel?.kind !== 'obj') return;
        if (!m.a) {
          m.a = sel.id;
          this.r.lineFrom = sel.id;
        } else {
          m.b = sel.id;
        }
        this.updateBuildbar();
        return;
      }
      case 'move': {
        const res = A.moveDefense(s, m.defId, Math.round(wx), Math.round(wy));
        this.feedback(res);
        if (res.ok) this.cancelMode();
        return;
      }
      case 'f16': {
        const res = A.callF16(s, Math.round(wx), Math.round(wy));
        this.feedback(res);
        if (res.ok) this.cancelMode();
        return;
      }
      case 'assign': {
        const sel = this.r.pickObject(s, wx, wy);
        let job: string | null = null;
        if (sel?.kind === 'obj') job = sel.id;
        else if (sel?.kind === 'line') job = 'L:' + sel.id;
        if (!job) return;
        const res = A.assignCrew(s, m.crewId, job);
        this.feedback(res, 'Бригаду направлено');
        if (res.ok) this.cancelMode();
        return;
      }
    }
    const sel = this.r.pickObject(s, wx, wy);
    this.select(sel);
  }

  select(sel: Selection): void {
    this.r.selected = sel;
    if (sel) {
      sfx.play('click');
      this.panel = null;
      this.openPanel('sel');
    } else this.closePanel();
  }

  updateGhost(): void {
    const s = this.s!;
    const m = this.mode;
    if (m.t !== 'def' && m.t !== 'build') return;
    if (m.x === undefined || m.y === undefined) {
      this.r.ghost = null;
      this.updateBuildbar();
      return;
    }
    let ok = true;
    let range = 0;
    let sprite = '';
    if (m.t === 'def') {
      sprite = m.def;
      range = DEFS[m.def].range;
      ok = !districtWaterBlock(m.x, m.y) && s.money >= DEFS[m.def].cost;
    } else {
      const spec = BUILDS[m.id];
      sprite = spec.kind;
      const pl = A.canPlaceAt(s, m.x, m.y, m.id === 'sub330' ? 10 : 5);
      ok = pl.ok && (!spec.inCity || districtAt(m.x, m.y) >= 0) && s.money >= A.buildCost(s, m.id);
    }
    this.r.ghost = { x: m.x, y: m.y, ok, range, sprite };
    this.updateBuildbar();
  }

  enterMode(m: Mode): void {
    this.mode = m;
    this.closePanel();
    this.r.ghost = null;
    this.r.lineFrom = null;
    if (m.t === 'def') this.r.overlay = 'ad';
    if (m.t === 'line') this.r.overlay = 'grid';
    if ((m.t === 'def' || m.t === 'build') && m.x === undefined) {
      // привид у центрі екрана
      const [wx, wy] = this.cam.toWorld(this.cam.cssW / 2, this.cam.cssH / 2);
      m.x = Math.round(wx);
      m.y = Math.round(wy);
      this.updateGhost();
    }
    $('buildbar').classList.remove('hidden');
    this.updateBuildbar();
  }

  cancelMode(): void {
    if (this.mode.t === 'def' && this.r.overlay === 'ad') this.r.overlay = 'none';
    if (this.mode.t === 'line' && this.r.overlay === 'grid') this.r.overlay = 'none';
    this.mode = { t: 'none' };
    this.r.ghost = null;
    this.r.lineFrom = null;
    $('buildbar').classList.add('hidden');
  }

  updateBuildbar(): void {
    const s = this.s!;
    const m = this.mode;
    let msg = '';
    let canOk = false;
    switch (m.t) {
      case 'def': msg = `${DEFS[m.def].name} · ${A.fmtMoney(DEFS[m.def].cost)}. Торкніться карти, щоб обрати місце.`; canOk = !!this.r.ghost?.ok; break;
      case 'build': msg = `${BUILDS[m.id].name} · ${A.fmtMoney(A.buildCost(s, m.id))}. ${BUILDS[m.id].inCity ? 'Лише в межах міста. ' : ''}Торкніться карти.`; canOk = !!this.r.ghost?.ok; break;
      case 'line': {
        const spec = LINE_SPECS[m.spec];
        if (!m.a) msg = `${spec.name}: торкніться першої підстанції або станції`;
        else if (!m.b) msg = `${spec.name}: тепер другий кінець`;
        else {
          const q = A.lineQuote(s, m.spec, m.a, m.b);
          msg = q.ok ? `${spec.name}: ${q.km!.toFixed(1)} км${q.water ? ' (через Дніпро)' : ''} · ${A.fmtMoney(q.cost!)} · ${q.days!.toFixed(1)} дн.` : q.msg!;
          canOk = q.ok;
        }
        break;
      }
      case 'move': msg = 'Торкніться нового місця для комплексу'; break;
      case 'assign': msg = 'Торкніться пошкодженого об’єкта або лінії'; break;
      case 'f16': msg = 'Торкніться місця патрулювання F-16 (збивають крилаті ракети ~30 хв)'; break;
    }
    $('buildbar').innerHTML = `<span class="msg">${S.esc(msg)}</span>${m.t === 'def' || m.t === 'build' || m.t === 'line' ? `<button class="primary" data-act="confirmMode" ${canOk ? '' : 'disabled'}>✓</button>` : ''}<button data-act="cancelMode">✕</button>`;
  }

  confirmMode(): void {
    const s = this.s!;
    const m = this.mode;
    let res: A.Res = { ok: false };
    if (m.t === 'def' && m.x !== undefined && m.y !== undefined) res = A.placeDefense(s, m.def, m.x, m.y);
    else if (m.t === 'build' && m.x !== undefined && m.y !== undefined) res = A.buildObject(s, m.id, m.x, m.y);
    else if (m.t === 'line' && m.a && m.b) res = A.buildLine(s, m.spec, m.a, m.b);
    this.feedback(res, 'Замовлено');
    if (res.ok) {
      sfx.play('build');
      if (m.t === 'line') {
        this.mode = { t: 'line', spec: m.spec };
        this.r.lineFrom = null;
        this.cancelMode();
      } else this.cancelMode();
    }
  }

  feedback(res: A.Res, okMsg?: string): void {
    if (!this.s) return;
    if (res.ok) {
      if (okMsg) this.s.toasts.push({ text: okMsg, kind: 'good' });
      sfx.play('ok');
    } else {
      if (res.msg) this.s.toasts.push({ text: res.msg, kind: 'warn' });
      sfx.play('error');
    }
    this.panelTimer = 0;
  }

  // ---------------- дії
  onSlider(e: Event, commit: boolean): void {
    const el = e.target as HTMLInputElement;
    const key = el.dataset?.set as 'musicPct' | 'sfxPct' | 'fontScale' | undefined;
    if (!key) return;
    const v = Number(el.value);
    this.progress.settings[key] = v;
    const out = el.nextElementSibling;
    if (out) out.textContent = v === 0 && key !== 'fontScale' ? 'вимк.' : `${v}%`;
    sfx.unlock();
    this.applySettings();
    if (key === 'sfxPct' && commit) sfx.play('click');
    if (key === 'fontScale') this.resize();
    if (commit) saveProgress(this.progress);
  }

  onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t) return;
    const act = t.dataset.act!;
    const arg = t.dataset.arg ?? '';
    if ((t as HTMLButtonElement).disabled) return;
    e.preventDefault();
    e.stopPropagation();
    sfx.unlock();
    if (act !== 'speed') sfx.play('click');
    this.handle(act, arg);
  }

  handle(act: string, arg: string): void {
    const s = this.s;
    switch (act) {
      // меню
      case 'campaign': this.showScreen('campaign'); break;
      case 'endlessMenu': this.briefId = 'endless'; this.showScreen('endless'); break;
      case 'howto': this.showScreen('howto'); break;
      case 'about': this.showScreen('about'); break;
      case 'settings': this.showScreen('settings'); break;
      case 'back': this.back(); break;
      case 'locked': this.toastScreen('Спершу пройдіть попередню главу'); break;
      case 'brief': this.briefId = arg; this.showScreen('brief'); break;
      case 'diff': this.chosenDiff = arg as Difficulty; this.showScreen(this.briefId === 'endless' ? 'endless' : 'brief', false); break;
      case 'start': clearRun(); this.startLevel(arg); break;
      case 'continue': {
        const run = loadRun();
        if (run) {
          this.s = run;
          this.s.paused = false;
          this.chosenDiff = run.difficulty;
          this.tutorial = null;
          this.enterGame();
        }
        break;
      }
      case 'setFont': {
        this.progress.settings.font = arg;
        saveProgress(this.progress);
        this.applySettings();
        void loadFont(fontById(arg)).then(() => { this.r.labelCache.clear(); this.resize(); });
        this.resize();
        if ($('modal').classList.contains('hidden')) this.showScreen('settings', false);
        else this.showPauseMenu();
        break;
      }
      case 'toggleSetting': {
        const st = this.progress.settings as unknown as Record<string, boolean>;
        st[arg] = !st[arg];
        saveProgress(this.progress);
        this.applySettings();
        this.resize();
        if ($('modal').classList.contains('hidden')) this.showScreen('settings', false);
        else this.showPauseMenu();
        break;
      }
      case 'resetAll':
        if (confirm('Скинути весь прогрес?')) {
          resetAll();
          this.progress = loadProgress();
          this.showScreen('main');
        }
        break;
      case 'retry': if (s) { clearRun(); this.chosenDiff = s.difficulty; this.startLevel(s.levelId); } break;
      case 'toMenu': this.toMenu(); break;
      // HUD
      case 'speed': if (s) this.setSpeed(Number(arg)); break;
      case 'skip': if (s) { s.paused = false; skipToEvening(s); } break;
      case 'pauseMenu': this.showPauseMenu(); break;
      case 'resume': this.closeModal(); if (s) s.paused = false; break;
      case 'panel': this.cancelMode(); this.openPanel(arg as PanelKind); break;
      case 'closePanel': this.closePanel(); break;
      case 'buildTab': this.buildTab = arg; this.renderPanel(); break;
      case 'focusObj': {
        if (arg === '#sched') { this.cancelMode(); this.panel = null; this.openPanel('sched'); break; }
        const o = s?.objs.find((oo) => oo.id === arg);
        if (o) { this.cam.focus(o.x, o.y); this.select({ kind: 'obj', id: o.id }); }
        break;
      }
      // будівництво і ППО
      case 'placeDef': this.enterMode({ t: 'def', def: arg as DefType }); break;
      case 'placeBuild': this.enterMode({ t: 'build', id: arg }); break;
      case 'placeLine': this.enterMode({ t: 'line', spec: arg }); break;
      case 'confirmMode': this.confirmMode(); break;
      case 'cancelMode': this.cancelMode(); break;
      case 'toggleAD': this.r.overlay = this.r.overlay === 'ad' ? 'none' : 'ad'; this.renderPanel(); break;
      case 'toggleGrid': this.r.overlay = this.r.overlay === 'grid' ? 'none' : 'grid'; this.renderPanel(); break;
      case 'buyAmmo': if (s) this.feedback(A.buyAmmo(s, arg as AmmoType), 'Боєприпаси закуплено'); break;
      case 'moveDef': this.enterMode({ t: 'move', defId: Number(arg) }); break;
      case 'f16Mode': this.enterMode({ t: 'f16' }); break;
      case 'sellDef': if (s) { this.feedback(A.sellDefense(s, Number(arg)), 'Комплекс розформовано'); this.closePanel(); } break;
      case 'policy': if (s) { const [id, p] = arg.split(':'); this.feedback(A.setPolicy(s, Number(id), p as FirePolicy)); } break;
      // об’єкти
      case 'sendCrew': if (s) this.feedback(A.dispatchNearest(s, arg), 'Бригаду направлено'); break;
      case 'prioRepair': if (s) this.feedback(A.toggleRepairPriority(s, arg)); break;
      case 'protect': if (s) this.feedback(A.protect(s, arg), 'Захист будується'); break;
      case 'project': if (s) this.feedback(A.startProject(s, arg), 'Проєкт відновлення розпочато'); break;
      case 'sellObj': if (s) { this.feedback(A.sellObject(s, arg), 'Демонтовано'); this.closePanel(); } break;
      // бригади
      case 'hireStaff': if (s) this.feedback(A.hireStaff(s), 'Люди проходять навчання (1 день)'); break;
      case 'hireCrew': if (s) this.feedback(A.hireCrew(s, arg as CrewType), `${CREWS[arg as CrewType].name}: найнято`); break;
      case 'toggleAuto': if (s) { s.autoRepair = !s.autoRepair; this.renderPanel(); } break;
      case 'toggleRisk': if (s) { s.crewRisk = !s.crewRisk; this.renderPanel(); } break;
      case 'buyTr': if (s) this.feedback(A.buyTransformer(s), 'Трансформатор замовлено'); break;
      case 'selectCrew': { const c = s?.crews.find((cc) => cc.id === Number(arg)); if (c) { this.cam.focus(c.x, c.y); this.select({ kind: 'crew', id: c.id }); } break; }
      case 'assignMode': this.enterMode({ t: 'assign', crewId: Number(arg) }); break;
      case 'crewHome': if (s) { const c = s.crews.find((cc) => cc.id === Number(arg)); if (c && c.state !== 'injured') { c.job = null; c.manual = false; c.state = 'idle'; c.stamina = Math.min(c.stamina, 60); } } break;
      case 'disband': if (s) { this.feedback(A.disbandCrew(s, Number(arg)), 'Бригаду розформовано'); this.closePanel(); } break;
      // мережа
      case 'selectDistrict': { const d = s?.districts.find((dd) => dd.id === arg); if (d) { this.cam.focus(d.cx, d.cy); this.select({ kind: 'district', id: d.id }); } break; }
      case 'prioDistrict': if (s) this.feedback(A.togglePriority(s, arg)); break;
      case 'schedMode': if (s) { A.setScheduleMode(s, arg as 'auto' | 'manual'); this.panelTimer = 0; } break;
      case 'schedAll': if (s) { A.setAllQueues(s, Number(arg)); this.panelTimer = 0; } break;
      case 'schedD': if (s) { const [id, dk] = arg.split(':'); A.setDistrictQueues(s, id, (s.schedule.mode === 'manual' ? s.schedule.queues[id] ?? 0 : 0) + Number(dk)); this.panelTimer = 0; } break;
      case 'emerg': if (s) { A.toggleEmergency(s, arg); this.panelTimer = 0; } break;
      case 'indOff': if (s) { A.toggleIndustryOff(s); this.panelTimer = 0; } break;
      case 'selectMetro': this.select({ kind: 'metro', id: arg }); break;
      case 'toggleInd': if (s) { s.flags.indPriority = s.flags.indPriority ? 0 : 1; s.gridDirty = true; this.renderPanel(); } break;
      case 'research': if (s) this.feedback(A.research(s, arg), 'Технологію впроваджено'); break;
      // модалки
      case 'choice': if (s) { applyChoice(s, arg); this.closeModal(); } break;
      case 'closeModal': this.closeModal(); break;
      case 'tutorNext': this.tutorial?.next(); break;
      case 'tutorSkip': this.tutorial = null; $('tutor').classList.add('hidden'); this.progress.tutorialDone = true; saveProgress(this.progress); break;
      case 'quitToMenu': if (s) saveRun(s); this.closeModal(); this.toMenu(); break;
      case 'none': break;
    }
  }

  toastScreen(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast warn';
    el.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  toMenu(): void {
    this.inGame = false;
    sfx.setMusic('day');
    this.cancelMode();
    this.closePanel();
    $('tutor').classList.add('hidden');
    sfx.setLevels(0, 0);
    this.screenStack = [];
    this.showScreen('main');
  }

  back(): void {
    if (!$('modal').classList.contains('hidden')) {
      if (this.s?.choice) return;
      this.handle('resume', '');
      return;
    }
    if (this.inGame) {
      if (this.mode.t !== 'none') return this.cancelMode();
      if (this.panel) return this.closePanel();
      return this.showPauseMenu();
    }
    if (this.screenStack.length > 1) {
      this.screenStack.pop();
      this.showScreen(this.screenStack[this.screenStack.length - 1], false);
      return;
    }
    const a = (window as unknown as { Android?: { exit(): void } }).Android;
    if (a) a.exit();
  }

  /** Рівні швидкості як у Hearts of Iron: 0 — пауза, 1..5 — ×1, ×2, ×5, ×10, ×20. */
  setSpeed(level: number): void {
    const s = this.s;
    if (!s) return;
    if (level <= 0) s.paused = true;
    else {
      s.paused = false;
      s.speed = B.speeds[Math.min(5, level)];
    }
    this.updateHud(true);
  }

  togglePause(): void {
    if (!this.s) return;
    this.s.paused = !this.s.paused;
    this.updateHud(true);
  }

  // ---------------- модалки
  modal(html: string): void {
    $('modal').innerHTML = `<div class="box pix">${html}</div>`;
    $('modal').classList.remove('hidden');
  }

  closeModal(): void {
    $('modal').classList.add('hidden');
    $('modal').innerHTML = '';
  }

  showPauseMenu(): void {
    if (!this.s) return;
    this.s.paused = true;
    const st = this.progress.settings;
    const L = levelById(this.s.levelId);
    this.modal(`<h2>Пауза</h2><p>${S.esc(L.title)} · ${DIFF[this.s.difficulty].name}</p>
      <div class="menu-btns">
        <button class="primary" data-act="resume">Продовжити</button>
        ${S.soundFontControls(st)}
        <button class="${st.autopause ? 'on' : ''}" data-act="toggleSetting" data-arg="autopause">Пауза на тривогу: ${st.autopause ? 'так' : 'ні'}</button>
        <button class="${st.lowFx ? 'on' : ''}" data-act="toggleSetting" data-arg="lowFx">Економія батареї: ${st.lowFx ? 'так' : 'ні'}</button>
        <button data-act="quitToMenu">Зберегти й вийти в меню</button>
      </div>`);
    this.updateHud(true);
  }

  showChoice(): void {
    const c = this.s!.choice!;
    this.modal(`<h2>${S.esc(c.title)}</h2><p>${S.esc(c.text)}</p><div class="menu-btns">${c.options.map((o) => `<button data-act="choice" data-arg="${o.effect}">${S.esc(o.label)}</button>`).join('')}</div>`);
  }

  showReport(): void {
    const s = this.s!;
    const r = s.lastWaveReport!;
    const frac = s.demandTotal > 0 ? s.servedTotal / s.demandTotal : 1;
    const dark = s.districts.filter((d) => d.frac < 0.7).map((d) => d.name);
    this.modal(`<h2>Відбій тривоги</h2>
      <p>Ніч ${r.day}-го дня позаду.</p>
      <div class="statgrid">
        <div class="row"><span class="k">Запущено ворогом</span><b>${r.launched}</b></div>
        <div class="row"><span class="k">Збито</span><b style="color:var(--good)">${r.downed}</b></div>
        <div class="row"><span class="k">Влучань</span><b style="color:${r.hits ? 'var(--bad)' : 'var(--good)'}">${r.hits}</b></div>
        <div class="row"><span class="k">Ракет ППО</span><b>${r.missilesSpent} · ${A.fmtMoney(r.adCost)}</b></div>
        <div class="row"><span class="k">Втрачено потужності</span><b>${Math.round(r.mwLost)} МВт</b></div>
        <div class="row"><span class="k">Світло зараз</span><b>${Math.round(frac * 100)}%</b></div>
      </div>
      ${dark.length ? `<p>Найважче: ${S.esc(dark.join(', '))}. Бригади вже виїжджають.</p>` : '<p>Місто зі світлом. Так тримати.</p>'}
      <div class="menu-btns"><button class="primary" data-act="closeModal">До роботи</button></div>`);
    if (this.progress.settings.vibro) vibrate(25);
  }

  finish(): void {
    const s = this.s!;
    const o = s.over!;
    clearRun();
    if (s.mode === 'campaign' && o.win) {
      this.progress.stars[s.levelId] = Math.max(this.progress.stars[s.levelId] ?? 0, o.stars);
      const order: Difficulty[] = ['easy', 'normal', 'hard', 'hell'];
      const prev = this.progress.diffDone[s.levelId];
      if (!prev || order.indexOf(s.difficulty) > order.indexOf(prev)) this.progress.diffDone[s.levelId] = s.difficulty;
      if (s.levelId === 'c1') this.progress.tutorialDone = true;
    }
    if (s.mode === 'endless') {
      this.progress.best[s.difficulty] = Math.max(this.progress.best[s.difficulty] ?? 0, o.score);
      this.progress.bestWaves[s.difficulty] = Math.max(this.progress.bestWaves[s.difficulty] ?? 0, s.stats.wavesDone);
    }
    saveProgress(this.progress);
    this.inGame = false;
    this.cancelMode();
    this.closePanel();
    $('tutor').classList.add('hidden');
    this.tutorial = null;
    sfx.setLevels(0, 0);
    this.screenStack = ['main'];
    this.showScreen('results');
    $('screen').classList.add('overmap');
  }

  // ---------------- звук
  sound(name: string, x: number, y: number): void {
    if (!this.inGame) return;
    let vol = 1;
    if (x || y) {
      const d = Math.hypot(x - this.cam.x, y - this.cam.y);
      const view = this.cam.cssW / this.cam.effZoom;
      vol = Math.max(0, 1 - d / (view * 0.9));
    }
    sfx.play(name, vol);
    if ((name === 'bigboom' || name === 'siren') && this.progress.settings.vibro && vol > 0.4) vibrate(name === 'siren' ? 120 : 60);
  }
}

function districtWaterBlock(x: number, y: number): boolean {
  return A.canPlaceAt({ objs: [] } as unknown as GameState, x, y, 0).ok === false;
}

export const _unused = { spriteFor };
