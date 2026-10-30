// Піксельні іконки інтерфейсу (data URL для <img>).
import { makeSprite, SPRITES } from './sprites';

const ICONS: Record<string, string[]> = {
  build: ['..yyyyyyy.', '..y....kk.', '..y....k..', '..y....k..', '..y...kkk.', '..y.......', '..y.......', '.yyy......', 'yyyyy.....', 'kkkkkk....'],
  shield: ['.bbbbbbbb.', 'bbbbbbbbbb', 'bbbbbbbbbb', 'bbbbbbbbbb', 'yyyyyyyyyy', '.yyyyyyyy.', '.yyyyyyyy.', '..yyyyyy..', '...yyyy...', '....yy....'],
  crew: ['...oooo...', '..oooooo..', '.oooooooo.', '.oowooooo.', 'oooooooooo', 'kkkkkkkkkk', '.hhhhhhhh.', '.hkhhhhkh.', '.hhhhhhhh.', '..hhhhhh..'],
  bolt: ['.....yy...', '....yy....', '...yy.....', '..yyyyyy..', '.....yy...', '....yy....', '...yy.....', '..yy......', '.yy.......', 'yy........'],
  tech: ['...kGGk...', '.kGGllGGk.', '.GlllllG..', 'kGll..llGk', 'Gll....llG', 'Gll....llG', 'kGll..llGk', '.GlllllG..', '.kGGllGGk.', '...kGGk...'],
  hq: ['k.........', 'kbbbbbb...', 'kbbbbbb...', 'kbbbbbb...', 'kyyyyyy...', 'kyyyyyy...', 'kyyyyyy...', 'k.........', 'k.........', 'kk........'],
  money: ['.eeeeeeee.', 'eeEEEEEEee', 'eEeeyyeeEe', 'eEeyeeyeEe', 'eEeeyyeeEe', 'eEeyeeyeEe', 'eEeeyyeeEe', 'eeEEEEEEee', '.eeeeeeee.'],
  bulb: ['...yyyy...', '..yyyyyy..', '.yyywyyyy.', '.yywyyyyy.', '.yyyyyyyy.', '..yyyyyy..', '...yyyy...', '...llll...', '...GGGG...', '....ll....'],
  heart: ['.rr...rr..', 'rrrr.rrrr.', 'rrwrrrrrrr', 'rrrrrrrrrr', '.rrrrrrrr.', '..rrrrrr..', '...rrrr...', '....rr....'],
  thermo: ['....ll....', '...lwwl...', '...lwwl...', '...lwwl...', '...lrrl...', '...lrrl...', '..lrrrrl..', '..lrrrrl..', '...lrrl...', '....ll....'],
  people: ['.kk...kk..', 'khhk.khhk.', 'khhk.khhk.', '.kk...kk..', 'kbbk.kbbk.', 'bbbbkbbbb.', 'bbbbkbbbb.', 'b..b.b..b.'],
  transformer: ['.l..l..l..', 'llllllllll', '..........', 'kkkkkkkkkk', 'kGGGGGGGGk', 'kGkGkGkGGk', 'kGGGGGGGGk', 'kkkkkkkkkk'],
  missile: ['....w.....', '...www....', '...wlw....', '...wlw....', '...wlw....', '...wlw....', '..wwlww...', '.w.wlw.w..', '...ror....', '....o.....'],
};

const cache: Record<string, string> = {};

export function icon(name: string): string {
  if (cache[name]) return cache[name];
  const rows = ICONS[name] ?? SPRITES[name];
  if (!rows) return '';
  const c = makeSprite(rows);
  cache[name] = c.toDataURL();
  return cache[name];
}

export function iconImg(name: string, cls = 'ico'): string {
  const src = icon(name);
  return src ? `<img class="${cls}" src="${src}" alt="">` : '';
}
