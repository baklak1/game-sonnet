// Піксельні спрайти рядками з літерами палітри. На старті перетворюються на canvas.

export const SPRITE_PAL: Record<string, string> = {
  k: '#11131a', K: '#2a2e3a', g: '#4b505c', G: '#7a808d', l: '#a9afbb', w: '#e8ecf2',
  r: '#d83a3a', R: '#8e2424', o: '#ff8c42', O: '#b85a1f', y: '#ffd400', Y: '#c9a400',
  b: '#3a7bd5', B: '#1f4a8a', c: '#7fd3ff', e: '#5aa64a', E: '#2f6b32', n: '#8a5a3a',
  N: '#5a3a26', p: '#9b6bd8', P: '#5b3a8e', s: '#c8ccd6', m: '#5f7a94', h: '#d9b38c',
  v: '#6b7a3a', V: '#4a5628', f: '#ffd166', z: '#3a4a66', t: '#cfd6e0',
};

export const SPRITES: Record<string, string[]> = {
  tpp: [
    '..........rr.rr.',
    '..........ww.ww.',
    '..........rr.rr.',
    '..........ww.ww.',
    '..........rr.rr.',
    '.kkkk.....ww.ww.',
    'kwwwlk....rr.rr.',
    'kwwllk....ww.ww.',
    '.kwlk.kkkkkkkkkk',
    '.kwlk.kGGGGGGGGk',
    'kwwllkkGfGfGfGfk',
    'kwwlllkGGGGGGGGk',
    'kwwlllkGfGfGfGfk',
    'kkkkkkkGGGGGGGGk',
    'gggggggkkkkkkkkk',
  ],
  tes: [
    '...rr.....rr.....rr.',
    '...ww.....ww.....ww.',
    '...rr.....rr.....rr.',
    '...ww.....ww.....ww.',
    '...rr.....rr.....rr.',
    '...ww.....ww.....ww.',
    '...rr.....rr.....rr.',
    'kkkkkkkkkkkkkkkkkkkk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGfGfGfGfGGfGfGfGfGk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGfGfGfGfGGfGfGfGfGk',
    'kggggggggggggggggggk',
    'kllllllllllllllllllk',
    'kkkkkkkkkkkkkkkkkkkk',
  ],
  hpp: [
    'kkkkkkkkkkkkkkkk',
    'kssssssssssssssk',
    'kGkGkGkGkGkGkGGk',
    'kGkGkGkGkGkGkGGk',
    'kGGGGGGGGGGGGGGk',
    'kkkkkkkkkkkkkkkk',
    '.cwcwcwcwcwcwcw.',
    '..c.c.c.c.c.c...',
  ],
  pspp: [
    '..kkkkkkkk..',
    '.kbbbbbbbbk.',
    'kbbcbbbbbbbk',
    'kbbbbbbcbbbk',
    '.kbbbbbbbbk.',
    '..kkkkkkkk..',
    '.....kk.....',
    '.....ss.....',
    '..kkkkkkkkk.',
    '..kGfGfGfGk.',
    '..kGGGGGGGk.',
    '..kkkkkkkkk.',
  ],
  sub750: [
    '.l..l..l..l...',
    'lllllllllllll.',
    '.l..l..l..l...',
    '.l..l..l..l...',
    '..............',
    'kkkk.kkkk.kkkk',
    'kppk.kppk.kppk',
    'kggk.kggk.kggk',
    'kggk.kggk.kggk',
    'kkkk.kkkk.kkkk',
    'GGGGGGGGGGGGGG',
  ],
  sub330: [
    '.l...l...l..',
    'lllllllllll.',
    '.l...l...l..',
    '............',
    'kkkk..kkkk..',
    'kbbk..kbbk..',
    'kggk..kggk..',
    'kkkk..kkkk..',
    'GGGGGGGGGGGG',
  ],
  decoy: [
    '.n...n...n..',
    'nnnnnnnnnnn.',
    '.n...n...n..',
    '............',
    'kkkk..kkkk..',
    'kNNk..kNNk..',
    'knnk..knnk..',
    'kkkk..kkkk..',
    'hhhhhhhhhhhh',
  ],
  sub110: [
    '.l..l...',
    'lllll...',
    '.l..l...',
    '........',
    'kkk.kkk.',
    'kck.kck.',
    'kgk.kgk.',
    'GGGGGGGG',
  ],
  import: [
    '...ll...',
    'llllllll',
    '..l..l..',
    '..llll..',
    '.l....l.',
    'llllllll',
    '.l.ll.l.',
    'l..ll..l',
    'l.l..l.l',
    'll....ll',
  ],
  kgu: [
    '.....k.',
    '.....g.',
    'kkkkkgk',
    'keeeeek',
    'keEeEek',
    'kkkkkkk',
  ],
  gtu: [
    '......kk.',
    '......gg.',
    'kkkkkkkkk',
    'kssssssmk',
    'kslslslmk',
    'kssssssmk',
    'kkkkkkkkk',
  ],
  ses: [
    'kkkkkkkkkk',
    'kBbBbBbBbk',
    'kbBbBbBbBk',
    'kBbBbBbBbk',
    'kkkkkkkkkk',
    '.g..g..g..',
  ],
  bess: [
    'kkkkkkkkk',
    'kwwwkwwwk',
    'kwewkwewk',
    'kwwwkwwwk',
    'kkkkkkkkk',
    '.y.....y.',
  ],
  boiler: [
    '....k.',
    '....g.',
    'kkkkgk',
    'knnnnk',
    'knfnnk',
    'knnnnk',
    'kkkkkk',
  ],
  pn: [
    '...k...',
    '..kbk..',
    '.kbbbk.',
    'kyyyyyk',
    'kyykyyk',
    'kkkkkkk',
  ],
  base: [
    '..kkkkkk..',
    '.kooooook.',
    'kooooooook',
    'kGGGGGGGGk',
    'kGkkGGkkGk',
    'kGkkGGkkGk',
    'kGkkGGkkGk',
    'kkkkkkkkkk',
  ],
  depot: [
    'kkkkkkkkkk',
    'kmmmmmmmmk',
    'kmlmmmmlmk',
    'kmmmmmmmmk',
    'kGGGkkGGGk',
    'kGGGkkGGGk',
    'kGGGkkGGGk',
    'kkkkkkkkkk',
  ],
  crit_water: [
    '.kkk.kkk.',
    'kbbbkbbbk',
    'kbcbkbcbk',
    'kbbbkbbbk',
    '.kkk.kkk.',
    'kkkkkkkkk',
    'kGfGGGfGk',
    'kkkkkkkkk',
  ],
  crit_metro: [
    'kkkkkkk',
    'krrrrrk',
    'krwrwrk',
    'krwwwrk',
    'krwrwrk',
    'krrrrrk',
    'kkkkkkk',
  ],
  crit_aer: [
    '.kkk.kkk.',
    'kcbckcbck',
    'kbbbkbbbk',
    '.kkk.kkk.',
    'kkkkkkkkk',
    'kGGGGGGGk',
    'kkkkkkkkk',
  ],
  // ---- ППО
  mfg: [
    '.kkkkkk.',
    'kvVvvcvk',
    'kvVkkcvk',
    'kvVvvcvk',
    '.kkkkkk.',
  ],
  manpads: [
    '.k.k.',
    'kvkvk',
    '.vVv.',
    '.v.v.',
  ],
  gepard: [
    '...k.k...',
    '...k.k...',
    '.kkkkkkk.',
    'kvvVVVvvk',
    'kVkVkVkVk',
    '.kkkkkkk.',
  ],
  interceptor: [
    'k.....k',
    '.k...k.',
    '..kkk..',
    '.kvvvk.',
    'kvvvvvk',
    'kVVkVVk',
    'kkkkkkk',
  ],
  ew: [
    'k.kk.k',
    '.kllk.',
    '..ll..',
    '.kllk.',
    '..ll..',
    '..ll..',
    '.kvvk.',
    'kvvvvk',
    'kkkkkk',
  ],
  radar: [
    '.kkkkk..',
    'klllllk.',
    '.klllk..',
    '..klk...',
    '...k....',
    '.kkkkk..',
    'kvvvvvk.',
    'kkkkkkk.',
  ],
  nasams: [
    '...kkkkkk.',
    '...kssssk.',
    'kkkkssssk.',
    'kvvkkkkkkk',
    'kvvvvvvvvk',
    '.k.k..k.k.',
  ],
  irist: [
    '..kkkkkkk.',
    '..kslslsk.',
    'kkkkkkkkk.',
    'kvvvvvvvvk',
    'kvVvvvvVvk',
    '.k.k..k.k.',
  ],
  patriot: [
    '....kkkkkk.',
    '...kmmmmmk.',
    '..kmmmmmmk.',
    'kkkkkkkkkkk',
    'kvvvvvvvvvk',
    'kvVvvvvvVvk',
    '.kk.kk.kk..',
  ],
  crew: [
    'kkkkk.',
    'kooock',
    'kooock',
    'kkkkk.',
  ],
  // ---- загрози (носом праворуч)
  shahed: [
    'kk......',
    'klk.....',
    'kllkk...',
    'klllllkk',
    'kllkk...',
    'klk.....',
    'kk......',
  ],
  gerbera: [
    'kk......',
    'khk.....',
    'khhkk...',
    'khhhhhkk',
    'khhkk...',
    'khk.....',
    'kk......',
  ],
  jet: [
    'kk.......',
    'klkk.....',
    'kllllllkk',
    'klkk.....',
    'kk.......',
  ],
  recon: [
    '.k.....',
    'kkkkkk.',
    '.klllkk',
    'kkkkkk.',
    '.k.....',
  ],
  kh101: [
    '..kk.......',
    'kllllllllwk',
    '..kk.......',
  ],
  kalibr: [
    '..k.......',
    'klllllllwk',
    '..k.......',
  ],
  ballistic: [
    '.kkkk..',
    'kwwwwwr',
    '.kkkk..',
  ],
  // ---- орієнтири
  motherland: [
    '....l',
    '...l.',
    '..l..',
    '.sl..',
    'lsss.',
    'lss..',
    '.ss..',
    '.ss..',
    '.ss..',
    '.ss..',
    'kkkk.',
    'kGGk.',
    'kGGk.',
  ],
  lavra: [
    '..y....y..',
    '.yYy..yYy.',
    '.kwk..kwk.',
    'kwwwkkwwwk',
    'kwfwwwwfwk',
    'kwwwwwwwwk',
    'kkkkkkkkkk',
  ],
  tvtower: [
    '.r.', '.w.', '.r.', '.l.', 'lll', '.l.', '.l.', '.l.', '.l.', '.l.', '.l.', 'l.l', 'l.l', 'l.l', 'lll',
  ],
  arch: [
    '.lllll.',
    'l.....l',
    'l.....l',
    'l.....l',
  ],
  sofia: [
    '...y...',
    '..eEe..',
    '.kwwwk.',
    'kwwfwwk',
    'kwfwfwk',
    'kwwwwwk',
    'kkkkkkk',
  ],
};

export type SpriteCanvas = HTMLCanvasElement;

export function spriteSize(name: string): [number, number] {
  const rows = SPRITES[name];
  return [Math.max(...rows.map((r) => r.length)), rows.length];
}

export function makeSprite(rows: string[], pal: Record<string, string> = SPRITE_PAL, override?: Record<string, string>): SpriteCanvas {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = (override && override[ch]) || pal[ch] || '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** Поворот спрайта найближчим сусідом (піксельність зберігається). */
export function rotateSprite(src: SpriteCanvas, angle: number): SpriteCanvas {
  const w = src.width, h = src.height;
  const size = Math.ceil(Math.hypot(w, h)) + 1;
  const sctx = src.getContext('2d')!;
  const sdata = sctx.getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const cx = size / 2, cy = size / 2, scx = w / 2, scy = h / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const sx = Math.floor(dx * cos - dy * sin + scx), sy = Math.floor(dx * sin + dy * cos + scy);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const si = (sy * w + sx) * 4, di = (y * size + x) * 4;
      if (sdata[si + 3] === 0) continue;
      img.data[di] = sdata[si];
      img.data[di + 1] = sdata[si + 1];
      img.data[di + 2] = sdata[si + 2];
      img.data[di + 3] = sdata[si + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export const ROT_STEPS = 16;

export class SpriteBank {
  plain: Record<string, SpriteCanvas> = {};
  rotated: Record<string, SpriteCanvas[]> = {};

  constructor() {
    for (const name of Object.keys(SPRITES)) this.plain[name] = makeSprite(SPRITES[name]);
    for (const name of ['shahed', 'gerbera', 'jet', 'recon', 'kh101', 'kalibr', 'ballistic', 'crew', 'mfg', 'gepard', 'nasams', 'irist', 'patriot']) {
      this.rotated[name] = [];
      for (let i = 0; i < ROT_STEPS; i++) this.rotated[name].push(rotateSprite(this.plain[name], (i / ROT_STEPS) * Math.PI * 2));
    }
  }

  rot(name: string, angle: number): SpriteCanvas {
    const arr = this.rotated[name];
    let a = angle % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return arr[Math.round((a / (Math.PI * 2)) * ROT_STEPS) % ROT_STEPS];
  }
}
