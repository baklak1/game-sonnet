// Збереження прогресу й поточної гри в localStorage (усе в try/catch).
import type { Difficulty, GameState } from '../sim/types';
import { SAVE_VERSION } from '../sim/init';

export interface Settings {
  autopause: boolean;
  /** Гучність музики й ефектів, 0–100 (0 — вимкнено). */
  musicPct: number;
  sfxPct: number;
  font: string;
  /** Розмір шрифту, % від стандартного (70–150). */
  fontScale: number;
  ambient: boolean;
  vibro: boolean;
  lowFx: boolean;
}

export interface Progress {
  stars: Record<string, number>;
  diffDone: Record<string, Difficulty>;
  best: Partial<Record<Difficulty, number>>;
  bestWaves: Partial<Record<Difficulty, number>>;
  tutorialDone: boolean;
  settings: Settings;
}

const KP = 'svitlo:progress:v1';
const KR = 'svitlo:run:v1';

export function loadProgress(): Progress {
  const def: Progress = { stars: {}, diffDone: {}, best: {}, bestWaves: {}, tutorialDone: false, settings: { autopause: true, musicPct: 50, sfxPct: 80, font: 'tiny5', fontScale: 100, ambient: false, vibro: true, lowFx: false } };
  try {
    const raw = localStorage.getItem(KP);
    if (!raw) return def;
    const p = JSON.parse(raw) as Progress;
    const old = (p.settings ?? {}) as Partial<Settings> & { music?: boolean; musicVol?: number; sound?: boolean };
    // перенесення старих перемикачів (до 1.3) на повзунки
    if (old.musicPct === undefined && old.music !== undefined) old.musicPct = old.music ? [25, 50, 90][(old.musicVol ?? 2) - 1] ?? 50 : 0;
    if (old.sfxPct === undefined && old.sound !== undefined) old.sfxPct = old.sound ? 80 : 0;
    delete old.music; delete old.musicVol; delete old.sound;
    return { ...def, ...p, settings: { ...def.settings, ...old } };
  } catch {
    return def;
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KP, JSON.stringify(p));
  } catch {
    /* сховище недоступне */
  }
}

export function saveRun(s: GameState): void {
  if (s.over || s.threats.length || s.projs.length) return;
  try {
    const copy = { ...s, fx: [], toasts: [], choice: null };
    localStorage.setItem(KR, JSON.stringify(copy));
  } catch {
    /* сховище недоступне */
  }
}

export function loadRun(): GameState | null {
  try {
    const raw = localStorage.getItem(KR);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== SAVE_VERSION || s.over) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(KR);
  } catch {
    /* немає */
  }
}

export function resetAll(): void {
  try {
    localStorage.removeItem(KP);
    localStorage.removeItem(KR);
  } catch {
    /* немає */
  }
}
