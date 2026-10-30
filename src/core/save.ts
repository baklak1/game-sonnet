// Збереження прогресу й поточної гри в localStorage (усе в try/catch).
import type { Difficulty, GameState } from '../sim/types';
import { SAVE_VERSION } from '../sim/init';

export interface Settings {
  sound: boolean;
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
  const def: Progress = { stars: {}, diffDone: {}, best: {}, bestWaves: {}, tutorialDone: false, settings: { sound: true, ambient: true, vibro: true, lowFx: false } };
  try {
    const raw = localStorage.getItem(KP);
    if (!raw) return def;
    const p = JSON.parse(raw) as Progress;
    return { ...def, ...p, settings: { ...def.settings, ...(p.settings ?? {}) } };
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
