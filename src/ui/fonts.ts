// Шрифти на вибір. k — множник кегля інтерфейсу (розміри в CSS підігнані під Tiny5),
// canvasK — множник для підписів на мапі (кегль 8u, де u — «піксель шрифту»).
import tiny5 from '../assets/fonts/tiny5.woff2';
import pressStart from '../assets/fonts/pressstart.ttf';
import handjet from '../assets/fonts/handjet.woff2';
import jetbrains from '../assets/fonts/jetbrains.woff2';
import pixelifyCyr from '../assets/fonts/pixelify-cyr.woff2';
import pixelifyLat from '../assets/fonts/pixelify-lat.woff2';
import rubikCyr from '../assets/fonts/rubik-cyr.woff2';
import rubikLat from '../assets/fonts/rubik-lat.woff2';

export interface FontDef {
  id: string;
  name: string;
  family: string;
  k: number;
  canvasK: number;
  /** Піксельний шрифт: без згладжування та штучного жирного. */
  pixel: boolean;
}

export const FONTS: FontDef[] = [
  { id: 'tiny5', name: 'Tiny5 — піксельний', family: '"Tiny5"', k: 1, canvasK: 1, pixel: true },
  { id: 'ps2p', name: 'Press Start 2P — аркадний', family: '"Press Start 2P"', k: 0.64, canvasK: 0.67, pixel: true },
  { id: 'handjet', name: 'Handjet — табло', family: '"Handjet"', k: 1.25, canvasK: 1.3, pixel: true },
  { id: 'pixelify', name: 'Pixelify Sans — м’який піксель', family: '"Pixelify Sans"', k: 0.92, canvasK: 1, pixel: false },
  { id: 'jetbrains', name: 'JetBrains Mono — термінал', family: '"JetBrains Mono"', k: 0.82, canvasK: 0.9, pixel: false },
  { id: 'rubik', name: 'Rubik — звичайний', family: '"Rubik"', k: 0.9, canvasK: 1, pixel: false },
  { id: 'system', name: 'Системний', family: 'system-ui, -apple-system, "Segoe UI", Roboto', k: 0.9, canvasK: 1, pixel: false },
];

const FACES = `
@font-face { font-family: 'Tiny5'; src: url(${tiny5}) format('woff2'); }
@font-face { font-family: 'Press Start 2P'; src: url(${pressStart}) format('truetype'); }
@font-face { font-family: 'Handjet'; src: url(${handjet}) format('woff2'); font-weight: 500; }
@font-face { font-family: 'JetBrains Mono'; src: url(${jetbrains}) format('woff2'); font-weight: 500; }
@font-face { font-family: 'Pixelify Sans'; src: url(${pixelifyCyr}) format('woff2'); font-weight: 400 700; unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'Pixelify Sans'; src: url(${pixelifyLat}) format('woff2'); font-weight: 400 700; unicode-range: U+0000-00FF, U+2000-206F, U+20AC, U+2122, U+2212; }
@font-face { font-family: 'Rubik'; src: url(${rubikCyr}) format('woff2'); font-weight: 300 800; unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'Rubik'; src: url(${rubikLat}) format('woff2'); font-weight: 300 800; unicode-range: U+0000-00FF, U+2000-206F, U+20AC, U+2122, U+2212; }
`;

/** Поточний шрифт і масштаб (читає рендерер для підписів на мапі). */
export const font = { def: FONTS[0], scale: 1 };

export function fontById(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

let injected = false;

/** Застосовує шрифт і масштаб (у відсотках) до всього інтерфейсу. */
export function applyFont(id: string, scalePct: number): FontDef {
  if (!injected) {
    const st = document.createElement('style');
    st.textContent = FACES;
    document.head.appendChild(st);
    injected = true;
  }
  const def = fontById(id);
  font.def = def;
  font.scale = Math.max(0.7, Math.min(1.5, scalePct / 100));
  const root = document.documentElement;
  root.style.setProperty('--font', `${def.family}, system-ui, sans-serif`);
  root.style.setProperty('--fs', String(def.k * font.scale));
  root.classList.toggle('pixfont', def.pixel);
  return def;
}

/** Чекає завантаження шрифту (не довше 1,5 с). */
export async function loadFont(def: FontDef): Promise<void> {
  if (def.id === 'system') return;
  try {
    await Promise.race([document.fonts.load(`16px ${def.family}`, 'Світло є ґїєі Kyiv ₴'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* шрифт не обов’язковий */
  }
}
