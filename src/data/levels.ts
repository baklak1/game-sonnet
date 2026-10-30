// Кампанія «Хроніка 2022–2026». Події надихнуті реальними, але цифри та перебіг — ігрові.
import type { AmmoType, DefType, Season, ThreatType, WavePolicy } from '../sim/types';

export interface WaveGroupDef {
  at: number;        // хвилин від 21:00
  type: ThreatType;
  n: number;
  dir: string;
  every?: number;    // хв між пусками в групі
  target?: string;   // id обʼєкта
}

export interface WaveDef {
  day: number;
  budget?: number;
  policy?: WavePolicy;
  groups?: WaveGroupDef[];
  title?: string;
  after?: string;    // id сценарної події після хвилі
}

export type Goal =
  | { type: 'survive'; minTrust: number }
  | { type: 'heat'; min: number }
  | { type: 'protect'; ids: string[]; min: number }
  | { type: 'gen'; mw: number }
  | { type: 'avg'; min: number }
  | { type: 'bess'; mw: number }
  | { type: 'distributed'; mw: number }
  | { type: 'endless' };

export interface LevelDef {
  id: string;
  num: number;
  title: string;
  period: string;
  brief: string;
  mech: string[];
  season: Season;
  baseTemp: number;
  days: number;
  money: number;
  staff: number;
  crews: [number, number, number];
  transformers: number;
  importBase: number;
  stock: Partial<Record<AmmoType, number>>;
  defs: [DefType, number, number][];
  objHp?: Record<string, number>;
  extraObjs?: { build: string; x: number; y: number }[];
  techs?: string[];
  unlock: { defs: DefType[]; builds: string[]; prot: number; techs: string[]; threats: ThreatType[] };
  waves: WaveDef[];
  gifts?: { day: number; def: DefType; x: number; y: number; text: string }[];
  events?: { day: number; id: string }[];
  randomEvents: boolean;
  goal: Goal;
  stars: [number, number];
  tutorial?: boolean;
}

const BASIC_TECH = ['searchlights', 'thermal', 'training', 'firefight', 'reservation'];
const MID_TECH = [...BASIC_TECH, 'acoustic', 'remote', 'trreserve', 'ufls', 'shelters', 'pn2', 'contractor'];
const ALL_TECH = [...MID_TECH, 'identify', 'mobilesub', 'airforce', 'interceptor2', 'decentral'];
const GRID_BUILDS = ['pn', 'base', 'depot', 'decoy', 'line110', 'cable110', 'sub110'];

export const LEVELS: LevelDef[] = [
  {
    id: 'c1', num: 1, title: 'Шахеди над Києвом', period: 'Жовтень 2022',
    brief: 'Осінь 2022-го. Росія вперше масово запускає по Києву іранські дрони-камікадзе «Шахед». Їхня мета — підстанції й ТЕЦ. У вас кілька мобільних вогневих груп, аварійні бригади ДТЕК і віра в те, що до зими все вдасться втримати.',
    mech: ['Мобільні вогневі групи: ставте їх на шляху дронів до підстанцій', 'Бригади самі їдуть ремонтувати пошкоджене (авторемонт)', 'Коли світла не вистачає, вмикаються черги відключень'],
    season: 'autumn', baseTemp: 9, days: 6, money: 60, staff: 30, crews: [2, 1, 1], transformers: 2, importBase: 600,
    stock: { manpads: 8 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256]],
    unlock: { defs: ['mfg', 'manpads'], builds: ['pn', 'base'], prot: 1, techs: BASIC_TECH, threats: ['shahed'] },
    waves: [
      { day: 1, policy: 'distribution', groups: [{ at: 40, type: 'shahed', n: 4, dir: 'N', every: 4 }, { at: 160, type: 'shahed', n: 4, dir: 'NE', every: 4 }] },
      { day: 3, policy: 'ring', groups: [{ at: 30, type: 'shahed', n: 5, dir: 'N', every: 3 }, { at: 120, type: 'shahed', n: 5, dir: 'E', every: 3 }, { at: 250, type: 'shahed', n: 4, dir: 'S', every: 3 }] },
      { day: 5, policy: 'mixed', groups: [{ at: 20, type: 'shahed', n: 6, dir: 'N', every: 3 }, { at: 110, type: 'shahed', n: 6, dir: 'NE', every: 3 }, { at: 200, type: 'shahed', n: 4, dir: 'E', every: 3 }, { at: 300, type: 'shahed', n: 4, dir: 'S', every: 3 }] },
    ],
    randomEvents: false,
    goal: { type: 'survive', minTrust: 30 },
    stars: [0.8, 0.92],
    tutorial: true,
  },
  {
    id: 'c2', num: 2, title: 'Ракетна осінь', period: 'Листопад 2022',
    brief: 'До дронів додаються крилаті ракети Х-101 і «Калібри». Удари йдуть по всій енергосистемі, і 23 листопада атомні станції аварійно розвантажуються — Київ залишається без імпорту. Партнери передають перший NASAMS.',
    mech: ['Крилаті ракети швидкі: проти них потрібні ПЗРК, «Гепард» і ЗРК', 'NASAMS — подарунок: оберіть позицію', 'ПС 750 «Київська» — ворота імпорту з АЕС. Бережіть її'],
    season: 'autumn', baseTemp: 3, days: 8, money: 90, staff: 40, crews: [3, 2, 1], transformers: 2, importBase: 600,
    stock: { manpads: 12, gepard: 40, nasams: 12 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['manpads', 52, 220]],
    unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar'], builds: GRID_BUILDS, prot: 1, techs: BASIC_TECH, threats: ['shahed', 'kh101', 'kalibr'] },
    waves: [
      { day: 1, budget: 22, policy: 'distribution' },
      { day: 3, budget: 30, policy: 'ring' },
      { day: 5, budget: 34, policy: 'imports' },
      {
        day: 7, policy: 'imports', title: '23 листопада', after: 'npp_unload_big',
        groups: [
          { at: 30, type: 'shahed', n: 8, dir: 'N', every: 3 }, { at: 90, type: 'shahed', n: 8, dir: 'E', every: 3 },
          { at: 380, type: 'kh101', n: 8, dir: 'E', every: 2 }, { at: 400, type: 'kalibr', n: 6, dir: 'S', every: 2 },
          { at: 420, type: 'kh101', n: 4, dir: 'SE', every: 2, target: 'k750' },
        ],
      },
    ],
    gifts: [{ day: 2, def: 'nasams', x: 300, y: 200, text: 'Прибув ЗРК NASAMS. Його вже розгорнуто біля Нивок — за потреби перемістіть.' }],
    randomEvents: true,
    goal: { type: 'survive', minTrust: 10 },
    stars: [0.7, 0.85],
  },
  {
    id: 'c3', num: 3, title: 'Темрява і холод', period: 'Грудень 2022',
    brief: 'Морози. ТЕЦ гріють місто, тож удар по ТЕЦ — це ще й холодні батареї. У районах розгортають Пункти незламності. Перші когенераційні установки й модульні котельні дають районам шанс пережити ніч.',
    mech: ['Тепло: якщо ТЕЦ вибито, райони мерзнуть, і довіра падає', 'Пункти незламності зменшують злість киян через відключення', 'КГУ і котельні дають тепло і світло локально'],
    season: 'winter', baseTemp: -6, days: 10, money: 120, staff: 45, crews: [4, 2, 2], transformers: 3, importBase: 450,
    stock: { manpads: 12, gepard: 80, nasams: 12 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['manpads', 52, 220], ['nasams', 300, 200]],
    objHp: { tec5: 0.85 },
    unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar'], builds: [...GRID_BUILDS, 'kgu', 'boiler'], prot: 1, techs: [...BASIC_TECH, 'pn2', 'ufls'], threats: ['shahed', 'kh101', 'kalibr'] },
    waves: [
      { day: 2, budget: 25, policy: 'generation' },
      { day: 4, budget: 32, policy: 'mixed' },
      { day: 6, budget: 38, policy: 'generation' },
      { day: 8, budget: 44, policy: 'ring' },
      { day: 10, budget: 50, policy: 'generation' },
    ],
    gifts: [{ day: 1, def: 'gepard', x: 410, y: 225, text: 'Партнери передали ЗСУ «Гепард». Вона вже на лівому березі.' }],
    events: [{ day: 5, id: 'cold_snap' }],
    randomEvents: true,
    goal: { type: 'heat', min: 0.6 },
    stars: [0.65, 0.8],
  },
  {
    id: 'c4', num: 4, title: 'Ніч балістики', period: 'Травень 2023',
    brief: 'Росія запускає по Києву «Кинджали» й «Іскандери», які вважала неперехоплюваними. Тепер у Києві є Patriot. Кожна ракета PAC-3 коштує як підстанція, тож політика вогню вирішує все.',
    mech: ['Балістику збиває лише Patriot', 'Політика вогню ЗРК: «Розумна» не витрачає дорогі ракети на дрони', 'РЕБ збиває дрони з курсу, але потребує світла'],
    season: 'spring', baseTemp: 14, days: 6, money: 160, staff: 50, crews: [4, 2, 2], transformers: 3, importBase: 650,
    stock: { manpads: 12, gepard: 80, nasams: 16, patriot: 16 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['mfg', 250, 200], ['manpads', 52, 220], ['manpads', 360, 240], ['gepard', 410, 225], ['nasams', 300, 200]],
    unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar', 'ew', 'patriot'], builds: [...GRID_BUILDS, 'kgu', 'boiler', 'gtu'], prot: 1, techs: MID_TECH, threats: ['shahed', 'kh101', 'kalibr', 'iskander', 'kinzhal'] },
    waves: [
      { day: 1, budget: 30, policy: 'imports' },
      { day: 3, budget: 40, policy: 'generation' },
      {
        day: 5, policy: 'mixed', title: '16 травня',
        groups: [
          { at: 60, type: 'shahed', n: 10, dir: 'S', every: 3 }, { at: 150, type: 'shahed', n: 8, dir: 'E', every: 3 },
          { at: 390, type: 'kalibr', n: 3, dir: 'S', every: 3 }, { at: 405, type: 'kinzhal', n: 6, dir: 'S', every: 1 },
          { at: 410, type: 'iskander', n: 4, dir: 'NE', every: 1 },
        ],
      },
    ],
    gifts: [{ day: 1, def: 'patriot', x: 330, y: 230, text: 'Patriot заступив на чергування в центрі міста. Його ракети — рідкісні й дорогі.' }],
    randomEvents: true,
    goal: { type: 'protect', ids: ['k750', 'tec5'], min: 0.25 },
    stars: [0.75, 0.9],
  },
  {
    id: 'c5', num: 5, title: 'Удар по генерації', period: 'Березень 2024',
    brief: 'Новий етап: ворог цілить у станції, а не лише в мережі. Енергетики будують захист: габіони, а тепер і бетонні укриття проти шахедів. Прибуває IRIS-T.',
    mech: ['Захист Р2 «Бетон» сильно зменшує урон від дронів', 'Проєкт відновлення повертає зруйновану станцію до роботи', 'IRIS-T — найточніший ЗРК, але ракети дорогі'],
    season: 'spring', baseTemp: 3, days: 8, money: 200, staff: 55, crews: [5, 3, 2], transformers: 3, importBase: 500,
    stock: { manpads: 12, gepard: 120, nasams: 16, patriot: 12, irist: 12 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['mfg', 250, 200], ['gepard', 410, 225], ['gepard', 340, 110], ['nasams', 300, 200], ['patriot', 330, 230]],
    unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar', 'ew', 'patriot', 'irist'], builds: [...GRID_BUILDS, 'kgu', 'boiler', 'gtu', 'sub330', 'line330'], prot: 2, techs: MID_TECH, threats: ['shahed', 'kh101', 'kalibr', 'iskander', 'kinzhal'] },
    waves: [
      { day: 1, budget: 40, policy: 'generation' },
      { day: 3, budget: 48, policy: 'generation' },
      { day: 5, budget: 56, policy: 'generation' },
      { day: 7, budget: 64, policy: 'finish' },
    ],
    gifts: [{ day: 1, def: 'irist', x: 455, y: 440, text: 'IRIS-T SLM розгорнуто біля Трипільської ТЕС. Вирішіть, кого він прикриватиме.' }],
    randomEvents: true,
    goal: { type: 'gen', mw: 1000 },
    stars: [0.7, 0.85],
  },
  {
    id: 'c6', num: 6, title: 'Трипілля', period: 'Квітень 2024',
    brief: '11 квітня 2024 року Росія знищила Трипільську ТЕС — найбільшу станцію Київщини. Чи зможете ви її вберегти? Якщо ні, доведеться жити з дефіцитом, лімітами Укренерго й довгими графіками, а станцію відновлювати проєктами.',
    mech: ['Друга атака — масований удар по Трипільській ТЕС', 'Ліміти імпорту від Укренерго', 'Розподілена генерація (КГУ, ГТУ) рятує, коли великих станцій немає'],
    season: 'spring', baseTemp: 10, days: 10, money: 220, staff: 55, crews: [5, 3, 2], transformers: 3, importBase: 400,
    stock: { manpads: 12, gepard: 120, nasams: 16, patriot: 12, irist: 12 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['mfg', 250, 200], ['gepard', 410, 225], ['gepard', 340, 110], ['nasams', 300, 200], ['patriot', 330, 230], ['irist', 455, 440]],
    unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar', 'ew', 'patriot', 'irist'], builds: [...GRID_BUILDS, 'kgu', 'boiler', 'gtu', 'sub330', 'line330'], prot: 2, techs: MID_TECH, threats: ['shahed', 'kh101', 'kalibr', 'iskander', 'kinzhal'] },
    waves: [
      { day: 1, budget: 40, policy: 'generation' },
      {
        day: 2, policy: 'generation', title: '11 квітня',
        groups: [
          { at: 40, type: 'shahed', n: 10, dir: 'S', every: 3, target: 'tryp' }, { at: 120, type: 'shahed', n: 10, dir: 'SE', every: 3, target: 'tryp' },
          { at: 380, type: 'kh101', n: 8, dir: 'SE', every: 2, target: 'tryp' }, { at: 395, type: 'kh101', n: 4, dir: 'E', every: 2 },
          { at: 410, type: 'iskander', n: 4, dir: 'S', every: 1, target: 'tryp' },
        ],
      },
      { day: 4, budget: 50, policy: 'generation' },
      { day: 6, budget: 56, policy: 'imports' },
      { day: 8, budget: 62, policy: 'finish' },
      { day: 10, budget: 70, policy: 'generation' },
    ],
    events: [{ day: 3, id: 'import_limit' }, { day: 7, id: 'import_limit' }],
    randomEvents: true,
    goal: { type: 'avg', min: 0.55 },
    stars: [0.65, 0.8],
  },
  {
    id: 'c7', num: 7, title: 'Спека', period: 'Липень 2024',
    brief: 'Літо після знищення великих станцій. Спека вмикає кондиціонери, імпорт обмежений, а графіки по 16 годин стають звичними. Сонячні станції працюють на повну, але тільки вдень.',
    mech: ['Спека: попит росте від кондиціонерів', 'Сонячні станції дешеві та безкоштовні в роботі', 'Ворог бʼє по кільцю 330 кВ і ПС 750'],
    season: 'summer', baseTemp: 29, days: 8, money: 230, staff: 55, crews: [5, 3, 2], transformers: 4, importBase: 350,
    stock: { manpads: 12, gepard: 120, nasams: 16, patriot: 12, irist: 16 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['mfg', 250, 200], ['gepard', 410, 225], ['gepard', 340, 110], ['nasams', 300, 200], ['patriot', 330, 230], ['irist', 380, 280]],
    objHp: { tryp: 0.05 },
    unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar', 'ew', 'patriot', 'irist'], builds: [...GRID_BUILDS, 'kgu', 'boiler', 'gtu', 'ses', 'sub330', 'line330'], prot: 2, techs: MID_TECH, threats: ['shahed', 'kh101', 'kalibr', 'iskander', 'kinzhal'] },
    waves: [
      { day: 2, budget: 45, policy: 'ring' },
      { day: 4, budget: 55, policy: 'imports' },
      { day: 6, budget: 60, policy: 'ring' },
      { day: 8, budget: 70, policy: 'mixed' },
    ],
    events: [{ day: 3, id: 'heatwave' }],
    randomEvents: true,
    goal: { type: 'avg', min: 0.6 },
    stars: [0.7, 0.85],
  },
  {
    id: 'c8', num: 8, title: 'Батареї', period: 'Вересень 2025',
    brief: '11 вересня 2025 року ДТЕК разом з Fluence запустили 200 МВт промислових батарей. Батарея не горить, як ТЕЦ: вона миттєво закриває аварійні провали. Ворог відповідає реактивними шахедами, імітаторами-«Герберами» і повторними ударами по ремонтниках.',
    mech: ['Батареї ДТЕК: заряд уночі, віддача в пік, миттєвий резерв', 'Дрони-перехоплювачі — дешеві постріли по шахедах', 'Гербери-імітатори: без РЛС на них марнуються ракети', 'Розвідник: якщо долетить, ворог знатиме вашу ППО'],
    season: 'autumn', baseTemp: 12, days: 10, money: 260, staff: 60, crews: [6, 3, 2], transformers: 4, importBase: 450,
    stock: { manpads: 12, gepard: 160, nasams: 16, patriot: 12, irist: 16, interceptor: 40 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['mfg', 250, 200], ['gepard', 410, 225], ['gepard', 340, 110], ['nasams', 300, 200], ['patriot', 330, 230], ['irist', 380, 280], ['interceptor', 360, 170]],
    objHp: { tryp: 0.05, tec5: 0.85, tec6: 0.8 },
    extraObjs: [{ build: 'bess', x: 400, y: 228 }],
    unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar', 'ew', 'patriot', 'irist', 'interceptor'], builds: [...GRID_BUILDS, 'kgu', 'boiler', 'gtu', 'ses', 'bess', 'sub330', 'line330'], prot: 2, techs: ALL_TECH, threats: ['shahed', 'gerbera', 'jet', 'recon', 'kh101', 'kalibr', 'iskander', 'kinzhal'] },
    waves: [
      { day: 1, budget: 50, policy: 'mixed' },
      { day: 3, budget: 55, policy: 'distribution' },
      { day: 4, budget: 60, policy: 'finish' },
      { day: 6, budget: 70, policy: 'generation' },
      { day: 8, budget: 75, policy: 'ring' },
      { day: 10, budget: 85, policy: 'mixed' },
    ],
    randomEvents: true,
    goal: { type: 'bess', mw: 100 },
    stars: [0.7, 0.85],
  },
  {
    id: 'c9', num: 9, title: 'Облога світла', period: 'Зима 2025–2026',
    brief: 'Найважча зима. 27 грудня ворог одночасно бʼє по ТЕЦ-5, ТЕЦ-6, Дарницькій ТЕЦ і Київській ГЕС. 9 січня — знову по ТЕЦ, 3 лютого — по Дарницькій. Мороз до −20. Завдання одне: не дати Києву зануритися в повну темряву.',
    mech: ['Усі загрози, включно з «Цирконом»', 'Сценарні масовані удари по ТЕЦ', 'Без тепла довіра тане швидко — котельні й КГУ рятують'],
    season: 'winter', baseTemp: -9, days: 14, money: 300, staff: 65, crews: [6, 4, 3], transformers: 5, importBase: 400,
    stock: { manpads: 16, gepard: 200, nasams: 16, patriot: 16, irist: 20, interceptor: 60 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['mfg', 250, 200], ['mfg', 440, 230], ['mfg', 345, 100], ['gepard', 410, 225], ['gepard', 340, 110], ['gepard', 385, 250], ['interceptor', 360, 170], ['interceptor', 430, 160], ['nasams', 300, 200], ['irist', 380, 280], ['patriot', 330, 230], ['radar', 350, 180], ['ew', 400, 210]],
    objHp: { tryp: 0.05, tec5: 0.7, tec6: 0.6, darn: 0.8 },
    extraObjs: [{ build: 'bess', x: 400, y: 228 }, { build: 'bess', x: 300, y: 225 }],
    unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar', 'ew', 'patriot', 'irist', 'interceptor'], builds: [...GRID_BUILDS, 'kgu', 'boiler', 'gtu', 'ses', 'bess', 'sub330', 'line330'], prot: 3, techs: ALL_TECH, threats: ['shahed', 'gerbera', 'jet', 'recon', 'kh101', 'kalibr', 'iskander', 'kinzhal', 'zircon'] },
    waves: [
      { day: 1, budget: 60, policy: 'mixed' },
      {
        day: 2, policy: 'generation', title: '27 грудня',
        groups: [
          { at: 30, type: 'shahed', n: 12, dir: 'N', every: 2, target: 'tec6' }, { at: 80, type: 'shahed', n: 12, dir: 'S', every: 2, target: 'tec5' },
          { at: 140, type: 'gerbera', n: 10, dir: 'E', every: 2 }, { at: 200, type: 'shahed', n: 8, dir: 'NE', every: 2, target: 'khpp' },
          { at: 380, type: 'kh101', n: 6, dir: 'E', every: 2, target: 'tec5' }, { at: 390, type: 'kh101', n: 6, dir: 'SE', every: 2, target: 'darn' },
          { at: 410, type: 'iskander', n: 4, dir: 'NE', every: 1, target: 'tec6' }, { at: 420, type: 'kinzhal', n: 2, dir: 'S', every: 1, target: 'khpp' },
        ],
      },
      { day: 4, budget: 65, policy: 'finish' },
      {
        day: 5, policy: 'generation', title: '9 січня',
        groups: [
          { at: 40, type: 'shahed', n: 14, dir: 'S', every: 2, target: 'tec5' }, { at: 90, type: 'jet', n: 4, dir: 'N', every: 2, target: 'tec6' },
          { at: 150, type: 'gerbera', n: 10, dir: 'NE', every: 2 }, { at: 370, type: 'kalibr', n: 6, dir: 'S', every: 2, target: 'tec5' },
          { at: 395, type: 'kh101', n: 6, dir: 'E', every: 2, target: 'tec6' }, { at: 415, type: 'zircon', n: 2, dir: 'S', every: 1, target: 'tec5' },
        ],
      },
      { day: 7, budget: 70, policy: 'ring' },
      { day: 9, budget: 80, policy: 'mixed' },
      {
        day: 10, policy: 'generation', title: '3 лютого',
        groups: [
          { at: 40, type: 'shahed', n: 12, dir: 'E', every: 2, target: 'darn' }, { at: 120, type: 'shahed', n: 10, dir: 'SE', every: 2 },
          { at: 180, type: 'gerbera', n: 10, dir: 'N', every: 2 }, { at: 380, type: 'kh101', n: 8, dir: 'E', every: 2, target: 'darn' },
          { at: 410, type: 'iskander', n: 4, dir: 'NE', every: 1, target: 'brov' },
        ],
      },
      { day: 12, budget: 90, policy: 'finish' },
      { day: 14, budget: 100, policy: 'mixed' },
    ],
    events: [{ day: 3, id: 'cold_snap' }, { day: 8, id: 'cold_snap' }],
    randomEvents: true,
    goal: { type: 'survive', minTrust: 20 },
    stars: [0.55, 0.7],
  },
  {
    id: 'c10', num: 10, title: 'Розподілена генерація', period: '2026',
    brief: 'Київ вирішив не складати всі яйця в один кошик. План міста — 200 МВт розподіленої генерації: когенерація, газотурбінні установки, сонце й батареї в кожному районі. Будуйте швидше, ніж ворог руйнує.',
    mech: ['Мета: 200 МВт розподіленої генерації (КГУ, ГТУ, СЕС, BESS)', 'Програма децентралізації здешевлює будівництво', 'Острівна робота: район з власною генерацією не гасне повністю'],
    season: 'spring', baseTemp: 9, days: 12, money: 350, staff: 65, crews: [6, 4, 3], transformers: 5, importBase: 450,
    stock: { manpads: 16, gepard: 200, nasams: 16, patriot: 12, irist: 16, interceptor: 60 },
    defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['mfg', 250, 200], ['gepard', 410, 225], ['gepard', 340, 110], ['interceptor', 360, 170], ['nasams', 300, 200], ['irist', 380, 280], ['patriot', 330, 230], ['radar', 350, 180]],
    objHp: { tryp: 0.05, tec5: 0.75, tec6: 0.7, darn: 0.7 },
    unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar', 'ew', 'patriot', 'irist', 'interceptor'], builds: [...GRID_BUILDS, 'kgu', 'boiler', 'gtu', 'ses', 'bess', 'sub330', 'line330'], prot: 3, techs: ALL_TECH, threats: ['shahed', 'gerbera', 'jet', 'recon', 'kh101', 'kalibr', 'iskander', 'kinzhal', 'zircon'] },
    waves: [
      { day: 1, budget: 50, policy: 'distribution' },
      { day: 3, budget: 60, policy: 'mixed' },
      { day: 5, budget: 70, policy: 'distribution' },
      { day: 7, budget: 80, policy: 'generation' },
      { day: 9, budget: 90, policy: 'mixed' },
      { day: 11, budget: 100, policy: 'finish' },
    ],
    randomEvents: true,
    goal: { type: 'distributed', mw: 200 },
    stars: [0.65, 0.8],
  },
];

export const ENDLESS: LevelDef = {
  id: 'endless', num: 0, title: 'Безкінечна оборона', period: 'Київ-2026',
  brief: 'Атаки не припиняються. Кожна хвиля сильніша за попередню. Скільки ночей Київ протримається зі світлом?',
  mech: ['Хвилі ростуть без кінця', 'Нові загрози й технології відкриваються з номером хвилі', 'Рекорд — кількість відбитих хвиль'],
  season: 'autumn', baseTemp: 5, days: 99999, money: 220, staff: 55, crews: [5, 3, 2], transformers: 4, importBase: 450,
  stock: { manpads: 12, gepard: 120, nasams: 12, irist: 8, patriot: 8, interceptor: 30 },
  defs: [['mfg', 326, 140], ['mfg', 372, 256], ['mfg', 420, 150], ['mfg', 250, 200], ['gepard', 410, 225], ['nasams', 300, 200]],
  objHp: { tryp: 0.05, tec5: 0.7, tec6: 0.5, darn: 0.6 },
  unlock: { defs: ['mfg', 'manpads', 'gepard', 'nasams', 'radar', 'ew', 'interceptor'], builds: [...GRID_BUILDS, 'kgu', 'boiler', 'gtu', 'ses', 'bess', 'sub330', 'line330'], prot: 2, techs: MID_TECH, threats: ['shahed', 'gerbera'] },
  waves: [],
  randomEvents: true,
  goal: { type: 'endless' },
  stars: [0.7, 0.85],
};

/** Відкриття в безкінечному режимі за номером хвилі. */
export const ENDLESS_UNLOCKS: { wave: number; threats?: ThreatType[]; defs?: DefType[]; prot?: number; techs?: string[]; text: string }[] = [
  { wave: 3, threats: ['kh101', 'recon'], text: 'Ворог почав застосовувати крилаті ракети та розвідку.' },
  { wave: 4, threats: ['kalibr'], defs: ['irist'], text: 'Доступний IRIS-T. Ворог додав «Калібри».' },
  { wave: 6, threats: ['iskander', 'jet'], defs: ['patriot'], text: 'Балістика й реактивні шахеди. Доступний Patriot.' },
  { wave: 8, prot: 3, techs: ['identify', 'mobilesub', 'airforce', 'interceptor2', 'decentral'], text: 'Відкрито Р3 і нові технології.' },
  { wave: 9, threats: ['kinzhal'], text: 'Ворог застосовує «Кинджали».' },
  { wave: 14, threats: ['zircon'], text: 'Зʼявилися «Циркони».' },
];

export function levelById(id: string): LevelDef {
  if (id === 'endless') return ENDLESS;
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
