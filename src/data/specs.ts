// Характеристики ППО, загроз, будівель, захисту, бригад і технологій.
import type { AmmoType, CrewType, DefType, ObjKind, ThreatClass, ThreatType } from '../sim/types';

export interface ThreatSpec {
  name: string;
  short: string;
  cls: ThreatClass;
  speed: number; // px за бойову секунду
  dmg: number;
  acc: number;
  cost: number;
  decoy?: boolean;
  recon?: boolean;
}

export const THREATS: Record<ThreatType, ThreatSpec> = {
  shahed: { name: 'Шахед', short: 'Шахед', cls: 'drone', speed: 7, dmg: 22, acc: 0.85, cost: 1 },
  gerbera: { name: 'Гербера (дрон-імітатор)', short: 'Гербера', cls: 'drone', speed: 7, dmg: 0, acc: 0, cost: 0.4, decoy: true },
  jet: { name: 'Реактивний шахед', short: 'Реакт. шахед', cls: 'drone', speed: 20, dmg: 24, acc: 0.85, cost: 3 },
  recon: { name: 'Розвідувальний БпЛА', short: 'Розвідник', cls: 'drone', speed: 6, dmg: 0, acc: 0, cost: 2, recon: true },
  kh101: { name: 'Крилата ракета Х-101', short: 'Х-101', cls: 'cruise', speed: 26, dmg: 60, acc: 0.9, cost: 7 },
  kalibr: { name: 'Крилата ракета «Калібр»', short: 'Калібр', cls: 'cruise', speed: 24, dmg: 50, acc: 0.88, cost: 6 },
  iskander: { name: 'Балістична ракета «Іскандер-М»', short: 'Іскандер', cls: 'ballistic', speed: 80, dmg: 65, acc: 0.92, cost: 9 },
  kinzhal: { name: 'Аеробалістична ракета «Кинджал»', short: 'Кинджал', cls: 'ballistic', speed: 120, dmg: 75, acc: 0.92, cost: 12 },
  zircon: { name: 'Ракета «Циркон»', short: 'Циркон', cls: 'ballistic', speed: 140, dmg: 70, acc: 0.9, cost: 14 },
};

export type DefKind = 'gun' | 'missile' | 'aura' | 'sensor';

export interface DefSpec {
  name: string;
  short: string;
  kind: DefKind;
  cost: number;
  upkeep: number;
  range: number;
  rate: number; // пострілів за бойову секунду
  mag: number;
  ammo?: AmmoType;
  ammoCost: number;
  projSpeed: number;
  pk: Partial<Record<ThreatType, number>>;
  deployH: number;
  hp: number;
  moveSpeed: number; // px за хв гри
  needsPower?: boolean;
  desc: string;
}

const P = (sh: number, jet: number, cr: number, isk = 0, kin = 0, zir = 0) => ({
  shahed: sh, gerbera: sh, recon: sh, jet, kh101: cr, kalibr: cr, iskander: isk, kinzhal: kin, zircon: zir,
});

export const DEFS: Record<DefType, DefSpec> = {
  mfg: {
    name: 'Мобільна вогнева група', short: 'МВГ', kind: 'gun', cost: 6, upkeep: 0.2, range: 22, rate: 1.25, mag: 9999,
    ammoCost: 0, projSpeed: 0, pk: P(0.3, 0.1, 0.02), deployH: 1, hp: 30, moveSpeed: 6,
    desc: 'Пікап з великокаліберним кулеметом і прожектором. Дешево, але б’є лише зблизька.',
  },
  manpads: {
    name: 'Група ПЗРК', short: 'ПЗРК', kind: 'missile', cost: 12, upkeep: 0.3, range: 36, rate: 1 / 3, mag: 4,
    ammo: 'manpads', ammoCost: 0.6, projSpeed: 50, pk: P(0.6, 0.4, 0.4), deployH: 1, hp: 25, moveSpeed: 6,
    desc: 'Переносні зенітні ракети. Можуть збити крилату ракету, але ракет мало.',
  },
  gepard: {
    name: 'ЗСУ «Гепард»', short: 'Гепард', kind: 'gun', cost: 40, upkeep: 0.6, range: 32, rate: 1 / 0.6, mag: 40,
    ammo: 'gepard', ammoCost: 0.1, projSpeed: 0, pk: P(0.55, 0.35, 0.2), deployH: 2, hp: 60, moveSpeed: 4,
    desc: 'Зенітна самохідна установка з двома 35-мм гарматами. Найкраща проти дронів.',
  },
  interceptor: {
    name: 'Дрони-перехоплювачі', short: 'Перехоп.', kind: 'missile', cost: 18, upkeep: 0.4, range: 60, rate: 1 / 1.5, mag: 10,
    ammo: 'interceptor', ammoCost: 0.05, projSpeed: 25, pk: P(0.7, 0.3, 0), deployH: 2, hp: 25, moveSpeed: 6,
    desc: 'Команда операторів FPV-перехоплювачів. Дешеві постріли, велика зона.',
  },
  ew: {
    name: 'Станція РЕБ', short: 'РЕБ', kind: 'aura', cost: 22, upkeep: 0.3, range: 40, rate: 0, mag: 0,
    ammoCost: 0, projSpeed: 0, pk: {}, deployH: 3, hp: 30, moveSpeed: 2, needsPower: true,
    desc: 'Глушить навігацію: дрони збиваються з курсу, крилаті ракети мажуть. Потребує світла в районі.',
  },
  radar: {
    name: 'РЛС', short: 'РЛС', kind: 'sensor', cost: 30, upkeep: 0.3, range: 140, rate: 0, mag: 0,
    ammoCost: 0, projSpeed: 0, pk: {}, deployH: 4, hp: 35, moveSpeed: 2,
    desc: 'Розпізнає Гербери-імітатори та дає +10% влучності ППО в зоні огляду.',
  },
  nasams: {
    name: 'ЗРК NASAMS', short: 'NASAMS', kind: 'missile', cost: 220, upkeep: 2, range: 72, rate: 0.5, mag: 12,
    ammo: 'nasams', ammoCost: 2.5, projSpeed: 80, pk: P(0.85, 0.85, 0.8), deployH: 8, hp: 60, moveSpeed: 3,
    desc: 'Зенітний ракетний комплекс середньої дальності. Надійно б’є крилаті ракети.',
  },
  irist: {
    name: 'ЗРК IRIS-T SLM', short: 'IRIS-T', kind: 'missile', cost: 260, upkeep: 2, range: 80, rate: 0.5, mag: 8,
    ammo: 'irist', ammoCost: 3.5, projSpeed: 90, pk: P(0.9, 0.9, 0.9), deployH: 8, hp: 60, moveSpeed: 3,
    desc: 'Сучасний ЗРК середньої дальності. Дорогі ракети — не витрачайте їх на шахеди.',
  },
  patriot: {
    name: 'ЗРК Patriot', short: 'Patriot', kind: 'missile', cost: 650, upkeep: 4, range: 100, rate: 1 / 1.5, mag: 8,
    ammo: 'patriot', ammoCost: 12, projSpeed: 160, pk: P(0.95, 0.95, 0.95, 0.75, 0.55, 0.35), deployH: 12, hp: 80, moveSpeed: 2,
    desc: 'Єдиний засіб проти балістики. Кожна ракета PAC-3 коштує як підстанція.',
  },
};

export const AMMO_NAMES: Record<AmmoType, string> = {
  manpads: 'Ракети ПЗРК', gepard: 'Набої 35 мм (черги)', interceptor: 'Дрони-перехоплювачі', nasams: 'Ракети AMRAAM (NASAMS)', irist: 'Ракети IRIS-T', patriot: 'Ракети PAC-3 (Patriot)',
};
export const AMMO_PACK: Record<AmmoType, number> = { manpads: 4, gepard: 20, interceptor: 10, nasams: 4, irist: 4, patriot: 2 };

export interface BuildSpec {
  id: string;
  kind: ObjKind;
  name: string;
  cost: number;
  days: number;
  cap: number;
  hp: number;
  inCity: boolean;
  socMax?: number;
  desc: string;
}

export const BUILDS: Record<string, BuildSpec> = {
  kgu: { id: 'kgu', kind: 'kgu', name: 'Когенераційна установка', cost: 25, days: 2, cap: 5, hp: 40, inCity: true, desc: '5 МВт + тепло для району. Працює острівно, коли район відрізано від мережі. Дорогий газ.' },
  gtu: { id: 'gtu', kind: 'gtu', name: 'Мобільна ГТУ', cost: 90, days: 3, cap: 25, hp: 70, inCity: true, desc: 'Газотурбінна установка на 25 МВт. Живить район напряму.' },
  ses: { id: 'ses', kind: 'ses', name: 'Сонячна станція', cost: 35, days: 2, cap: 10, hp: 50, inCity: true, desc: 'До 10 МВт удень. Влітку — багато, взимку — мало. Паливо безкоштовне.' },
  bess: { id: 'bess', kind: 'bess', name: 'Батарея ДТЕК (BESS)', cost: 140, days: 4, cap: 50, hp: 60, inCity: true, socMax: 100, desc: '50 МВт / 100 МВт·год. Заряджається вночі, віддає в пік і миттєво закриває аварійні провали.' },
  boiler: { id: 'boiler', kind: 'boiler', name: 'Модульна котельня', cost: 8, days: 1, cap: 0, hp: 30, inCity: true, desc: 'Тепло для району, якщо ТЕЦ вибито. Лише взимку має сенс.' },
  pn: { id: 'pn', kind: 'pn', name: 'Пункт незламності', cost: 3, days: 0.5, cap: 0, hp: 20, inCity: true, desc: 'Тепло, зв’язок і зарядка. Кияни менше злі на відключення в районі (до 3 на район).' },
  sub110: { id: 'sub110', kind: 'sub110', name: 'Підстанція 110 кВ', cost: 45, days: 3, cap: 160, hp: 60, inCity: true, desc: 'Ще один ввід живлення в район. Потрібна ЛЕП до кільця чи станції.' },
  sub330: { id: 'sub330', kind: 'sub330', name: 'Підстанція 330 кВ', cost: 300, days: 8, cap: 800, hp: 160, inCity: false, desc: 'Новий вузол кільця. Підключіть ЛЕП 330 кВ.' },
  base: { id: 'base', kind: 'base', name: 'База бригад', cost: 30, days: 2, cap: 0, hp: 60, inCity: false, desc: 'Бригади відпочивають і стартують звідси. Ставте на іншому березі.' },
  depot: { id: 'depot', kind: 'depot', name: 'Склад обладнання', cost: 40, days: 2, cap: 0, hp: 60, inCity: false, desc: '+2 трансформатори одразу, дешевші поставки.' },
  decoy: { id: 'decoy', kind: 'decoy', name: 'Макет підстанції', cost: 3, days: 0.5, cap: 0, hp: 20, inCity: false, desc: 'Приманка. Якщо ворог не мав розвідки, частина дронів полетить сюди.' },
};

export interface LineSpec { id: string; name: string; kv: 110 | 330; cap: number; hp: number; costKm: number; kmPerDay: number; cable: boolean }
export const LINE_SPECS: Record<string, LineSpec> = {
  line110: { id: 'line110', name: 'ЛЕП 110 кВ', kv: 110, cap: 120, hp: 30, costKm: 1.5, kmPerDay: 5, cable: false },
  cable110: { id: 'cable110', name: 'Кабель 110 кВ (підземний)', kv: 110, cap: 120, hp: 30, costKm: 5, kmPerDay: 2, cable: true },
  line330: { id: 'line330', name: 'ЛЕП 330 кВ', kv: 330, cap: 600, hp: 50, costKm: 6, kmPerDay: 3, cable: false },
};
export const PX_PER_KM = 8;
export const MAX_LINE_PX = 140;
export const WATER_LINE_MULT = 2.5;

/** Клас об’єкта для захисту та матеріалів. */
export function protClass(kind: ObjKind): 'plant' | 'sub' | 'sub110' | 'small' | null {
  if (kind === 'tpp' || kind === 'tes' || kind === 'hpp' || kind === 'pspp') return 'plant';
  if (kind === 'sub750' || kind === 'sub330') return 'sub';
  if (kind === 'sub110') return 'sub110';
  if (kind === 'kgu' || kind === 'gtu' || kind === 'bess' || kind === 'ses') return 'small';
  return null;
}

export const PROT_COST: Record<string, (number | null)[]> = {
  plant: [10, 80, 250],
  sub: [4, 30, 90],
  sub110: [2, 12, null],
  small: [1.5, 8, null],
};
export const PROT_DAYS = [1, 3, 6];
export const PROT_NAMES = ['Без захисту', 'Р1 «Габіони»', 'Р2 «Бетонний захист»', 'Р3 «Капітальне укриття»'];
/** Множники урону [дрони, ракети] за рівнем захисту. */
export const PROT_MULT: [number, number][] = [[1, 1], [0.7, 0.9], [0.3, 0.65], [0.1, 0.35]];

export interface CrewSpec { name: string; short: string; hire: number; people: number; speed: number; fixes: ObjKind[]; lines: number[] }
export const CREWS: Record<CrewType, CrewSpec> = {
  city: { name: 'Аварійна бригада ДТЕК', short: 'ДТЕК', hire: 4, people: 5, speed: 10, fixes: ['sub110', 'kgu', 'gtu', 'ses', 'bess', 'boiler', 'pn', 'base', 'depot', 'decoy', 'crit'], lines: [110] },
  hv: { name: 'Високовольтна бригада', short: 'ВН', hire: 8, people: 8, speed: 8, fixes: ['sub330', 'sub750', 'import'], lines: [330, 750] },
  plant: { name: 'Бригада «Енергоремонт»', short: 'Енергоремонт', hire: 12, people: 12, speed: 5, fixes: ['tpp', 'tes', 'hpp', 'pspp'], lines: [] },
};

export interface TechSpec { id: string; name: string; cost: number; desc: string }
export const TECHS: TechSpec[] = [
  { id: 'searchlights', name: 'Прожектори для МВГ', cost: 15, desc: 'МВГ влучають на 50% краще вночі.' },
  { id: 'thermal', name: 'Тепловізори', cost: 25, desc: 'Дальність МВГ і «Гепардів» +25%.' },
  { id: 'acoustic', name: 'Акустична мережа', cost: 40, desc: 'Сенсори по всьому місту: гармати +10% влучності.' },
  { id: 'identify', name: 'Ідентифікація цілей', cost: 30, desc: 'Усі Гербери розпізнаються: ЗРК не витрачають на них ракети.' },
  { id: 'remote', name: 'Дистанційне керування ПС', cost: 35, desc: 'Ремонт ВН-бригад +15%, лінії до 110 кВ ремонтуються швидше.' },
  { id: 'mobilesub', name: 'Мобільні підстанції', cost: 50, desc: 'Знищена ПС 110 одразу дає 50% потужності, поки її ремонтують.' },
  { id: 'trreserve', name: 'Резерв трансформаторів', cost: 40, desc: '+2 трансформатори, поставки на 30% дешевші.' },
  { id: 'reservation', name: 'Бронювання працівників', cost: 20, desc: 'Мобілізація не забирає енергетиків.' },
  { id: 'training', name: 'Навчальний центр', cost: 45, desc: 'Бригади ремонтують на 25% швидше, +10 людей у штат.' },
  { id: 'firefight', name: 'Протипожежні системи', cost: 25, desc: 'Пожежі вдвічі коротші та слабші.' },
  { id: 'ufls', name: 'АЧР нового покоління', cost: 30, desc: 'Аварійні відключення злять киян удвічі менше.' },
  { id: 'shelters', name: 'Укриття для бригад', cost: 30, desc: 'Ризик поранень під час ремонту в тривогу −70%.' },
  { id: 'airforce', name: 'Інтеграція з Повітряними силами', cost: 60, desc: 'ЗРК +8% влучності.' },
  { id: 'interceptor2', name: 'Перехоплювачі v2', cost: 35, desc: 'Перехоплювачі +20% проти реактивних шахедів, +2 у магазин.' },
  { id: 'decentral', name: 'Програма децентралізації', cost: 40, desc: 'КГУ, ГТУ і СЕС на 25% дешевші та будуються на день швидше.' },
  { id: 'contractor', name: 'Другий підрядник', cost: 30, desc: '+1 одночасне будівництво.' },
  { id: 'pn2', name: 'Пункти незламності 2.0', cost: 20, desc: 'Старлінки й обігрівачі: пункти вдвічі ефективніші.' },
];
export const TECH_BY_ID: Record<string, TechSpec> = Object.fromEntries(TECHS.map((t) => [t.id, t]));
