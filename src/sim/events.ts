// Випадкові та сценарні події, вибір гравця.
import { levelById } from '../data/levels';
import { rnd, rndInt, pick } from '../core/rng';
import { dayOf } from './demand';
import type { AmmoType, GameState } from './types';
import { news, toast } from './economy';
import { buildObjectFree } from './free';

interface EventDef {
  id: string;
  w: number;
  cond?: (s: GameState) => boolean;
  run: (s: GameState) => void;
}

const hasDef = (s: GameState, t: string) => s.defs.some((d) => d.type === t);

export const EVENTS: EventDef[] = [
  {
    id: 'partners_tr', w: 3, run: (s) => {
      const n = rndInt(s, 1, 2);
      s.transformers += n;
      toast(s, `Партнери передали автотрансформатори: +${n}`, 'good');
      news(s, 'Партнери передали Україні нові автотрансформатори для підстанцій');
    },
  },
  {
    id: 'ammo', w: 3, cond: (s) => s.defs.some((d) => ['nasams', 'irist', 'patriot', 'manpads', 'interceptor', 'gepard'].includes(d.type)), run: (s) => {
      const gifts: [AmmoType, number, string][] = [];
      if (hasDef(s, 'nasams')) gifts.push(['nasams', 4, 'ракети AMRAAM']);
      if (hasDef(s, 'irist')) gifts.push(['irist', 4, 'ракети IRIS-T']);
      if (hasDef(s, 'patriot')) gifts.push(['patriot', 2, 'ракети PAC-3']);
      if (hasDef(s, 'gepard')) gifts.push(['gepard', 30, 'набої до «Гепардів»']);
      if (hasDef(s, 'interceptor')) gifts.push(['interceptor', 15, 'дрони-перехоплювачі']);
      if (hasDef(s, 'manpads')) gifts.push(['manpads', 4, 'ракети ПЗРК']);
      const [t, n, name] = pick(s, gifts);
      s.stock[t] += n;
      toast(s, `Поставка від партнерів: ${name} (+${n})`, 'good');
      news(s, 'Рамштайн: союзники оголосили новий пакет ППО');
    },
  },
  {
    id: 'cold_snap', w: 2, cond: (s) => s.season === 'winter' || s.season === 'autumn', run: (s) => {
      s.tempMods.push({ d: -7, until: s.t + 2 * 1440 });
      toast(s, 'Похолодання на 7 °C на дві доби: попит на світло і тепло росте', 'warn');
      news(s, 'Синоптики: на Київ насувається різке похолодання');
    },
  },
  {
    id: 'thaw', w: 1, cond: (s) => s.season === 'winter', run: (s) => {
      s.tempMods.push({ d: 5, until: s.t + 2 * 1440 });
      toast(s, 'Відлига: попит трохи знизиться', 'good');
    },
  },
  {
    id: 'heatwave', w: 2, cond: (s) => s.season === 'summer', run: (s) => {
      s.tempMods.push({ d: 5, until: s.t + 2 * 1440 });
      toast(s, 'Спека +5 °C на дві доби: кондиціонери на повну', 'warn');
      news(s, 'Укргідрометцентр: аномальна спека, бережіть себе та енергосистему');
    },
  },
  {
    id: 'import_limit', w: 2, run: (s) => {
      s.importMods.push({ mult: 0.7, until: s.t + 1440 });
      ukrLimit(s, 0.8, 24);
    },
  },
  {
    id: 'npp_unload', w: 1.5, cond: (s) => s.stats.wavesDone > 0, run: (s) => {
      s.importMods.push({ mult: 0.6, until: s.t + 1440 });
      toast(s, 'Енергоатом розвантажив блоки після нічної атаки: імпорт −40% на добу', 'warn');
      news(s, 'Після атаки атомні енергоблоки працюють на зниженій потужності');
    },
  },
  {
    id: 'volunteers', w: 2, run: (s) => {
      if (s.unlocked.defs.includes('interceptor')) {
        s.stock.interceptor += 20;
        toast(s, 'Волонтери зібрали на 20 дронів-перехоплювачів!', 'good');
      } else {
        s.money += 10;
        toast(s, 'Волонтери передали генератори та павербанки: +10 млн еквівалентом', 'good');
      }
      news(s, 'Кияни за добу закрили збір на захист енергетики');
    },
  },
  {
    id: 'mobilization', w: 1.2, cond: (s) => s.staff > 30, run: (s) => {
      if (s.tech.reservation) {
        toast(s, 'Повістки прийшли, але бронювання енергетиків спрацювало', 'info');
        return;
      }
      const n = rndInt(s, 3, 6);
      s.staff = Math.max(20, s.staff - n);
      toast(s, `Мобілізація: штат зменшився на ${n}. Оформіть бронювання працівників.`, 'warn');
    },
  },
  {
    id: 'ice_storm', w: 1.5, cond: (s) => s.season === 'winter', run: (s) => {
      const lines = s.lines.filter((l) => l.kv === 110 && l.built && !l.cable && l.hp > 10);
      for (let i = 0; i < 2 && lines.length; i++) {
        const l = lines.splice(Math.floor(rnd(s) * lines.length), 1)[0];
        l.hp = Math.max(0, l.hp - 22);
      }
      s.gridDirty = true;
      toast(s, 'Ожеледь пошкодила лінії 110 кВ', 'warn');
    },
  },
  {
    id: 'journalists', w: 2, run: (s) => {
      s.choice = {
        id: 'journalists', title: 'Журналісти просять коментар',
        text: 'Телемарафон питає, коли в Києві буде стабільне світло. Що відповісте?',
        options: [
          { label: 'Чесно: графіки ще триматимуться', effect: 'honest' },
          { label: 'Пообіцяти світло вже завтра', effect: 'promise' },
        ],
      };
    },
  },
  {
    id: 'fund', w: 2, run: (s) => {
      const m = rndInt(s, 10, 20);
      s.money += m;
      toast(s, `Фонд підтримки енергетики України: +${m} млн`, 'good');
    },
  },
  {
    id: 'donor_kgu', w: 1, cond: (s) => s.unlocked.builds.includes('kgu'), run: (s) => {
      if (buildObjectFree(s, 'kgu')) {
        toast(s, 'Громади-партнери передали когенераційну установку — її вже монтують', 'good');
        news(s, 'Міста-побратими передали Києву когенераційні установки');
      }
    },
  },
  {
    id: 'old_equipment', w: 1, run: (s) => {
      const subs = s.objs.filter((o) => o.kind === 'sub110' && o.built && o.hp > 30);
      if (!subs.length) return;
      const o = pick(s, subs);
      o.hp -= 25;
      s.gridDirty = true;
      toast(s, `${o.name}: аварія через зношене обладнання`, 'warn', o.id);
    },
  },
];

/** Ліміт споживання від Укренерго через дефіцит в енергосистемі країни. */
export function ukrLimit(s: GameState, frac: number, hours: number): void {
  s.flags.limitFrac = Math.min(s.flags.limitUntil && s.flags.limitUntil > s.t ? s.flags.limitFrac ?? 1 : 1, frac);
  s.flags.limitUntil = Math.max(s.flags.limitUntil ?? 0, s.t + hours * 60);
  s.gridDirty = true;
  toast(s, `Укренерго: через дефіцит в енергосистемі ліміт для Києва — ${Math.round(frac * 100)}% попиту на ${hours} год. Черги відключень неминучі.`, 'warn');
  news(s, 'Укренерго запровадило ліміти споживання для регіонів');
}

export const SCRIPTED: Record<string, (s: GameState) => void> = {
  npp_unload_big: (s) => {
    s.importMods.push({ mult: 0, until: s.t + 20 * 60 });
    ukrLimit(s, 0.55, 20);
    toast(s, 'Аварійне розвантаження АЕС! Імпорт у Київ припинено на ~20 годин.', 'bad');
    news(s, 'Енергосистема: аварійні відключення по всій країні, АЕС відʼєднано від мережі');
  },
};

export function applyChoice(s: GameState, effect: string): void {
  if (effect === 'honest') {
    s.trust = Math.min(100, s.trust + 2);
    toast(s, 'Кияни оцінили чесність: довіра +2', 'good');
  } else if (effect === 'promise') {
    s.trust = Math.min(100, s.trust + 5);
    s.flags.promiseAt = s.t + 24 * 60;
    toast(s, 'Довіра +5. Але якщо завтра буде менше 90% світла — буде боляче.', 'warn');
  }
  s.choice = null;
}

export function dailyEvents(s: GameState): void {
  const L = levelById(s.levelId);
  const day = dayOf(s.t);
  for (const e of L.events ?? []) {
    if (e.day !== day) continue;
    const def = EVENTS.find((ev) => ev.id === e.id);
    if (def) def.run(s);
    else SCRIPTED[e.id]?.(s);
  }
  for (const g of L.gifts ?? []) {
    if (g.day !== day) continue;
    s.flags[`gift_${g.def}_${g.day}`] = 1;
  }
  if (!L.randomEvents || s.choice) return;
  if (rnd(s) > 0.45) return;
  const pool = EVENTS.filter((e) => !e.cond || e.cond(s));
  const sum = pool.reduce((a, e) => a + e.w, 0);
  let r = rnd(s) * sum;
  for (const e of pool) {
    r -= e.w;
    if (r <= 0) {
      e.run(s);
      break;
    }
  }
}
