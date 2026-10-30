// Базова енергосистема Києва: реальні назви великих об’єктів, умовні позиції.
// ПС 110 кВ мають умовні назви за місцевостями. Потужності — з відкритих джерел, округлено.
import type { DistrictId, ObjKind } from '../sim/types';

export interface DistrictDef {
  id: DistrictId;
  name: string;
  pop: number;     // тис. мешканців (приблизно)
  k: number;       // коефіцієнт споживання на мешканця
  heat: string;    // джерело тепла
  lx: number;      // точка підпису
  ly: number;
  style: 'panel' | 'mixed' | 'historic';
}

export const DISTRICTS: DistrictDef[] = [
  { id: 'obolonskyi', name: 'Оболонський', pop: 320, k: 1.0, heat: 'tec6', lx: 340, ly: 138, style: 'panel' },
  { id: 'podilskyi', name: 'Подільський', pop: 200, k: 1.0, heat: 'tec6', lx: 312, ly: 160, style: 'mixed' },
  { id: 'shevchenkivskyi', name: 'Шевченківський', pop: 230, k: 1.3, heat: 'tec5', lx: 318, ly: 190, style: 'historic' },
  { id: 'pecherskyi', name: 'Печерський', pop: 160, k: 1.4, heat: 'tec5', lx: 360, ly: 222, style: 'historic' },
  { id: 'holosiivskyi', name: 'Голосіївський', pop: 250, k: 1.0, heat: 'tec5', lx: 344, ly: 258, style: 'mixed' },
  { id: 'solomianskyi', name: "Солом'янський", pop: 380, k: 1.0, heat: 'tec5', lx: 306, ly: 226, style: 'mixed' },
  { id: 'sviatoshynskyi', name: 'Святошинський', pop: 340, k: 0.95, heat: 'tec5', lx: 248, ly: 196, style: 'panel' },
  { id: 'desnianskyi', name: 'Деснянський', pop: 360, k: 0.95, heat: 'tec6', lx: 430, ly: 128, style: 'panel' },
  { id: 'dniprovskyi', name: 'Дніпровський', pop: 350, k: 1.0, heat: 'tec6', lx: 404, ly: 194, style: 'panel' },
  { id: 'darnytskyi', name: 'Дарницький', pop: 340, k: 1.0, heat: 'darn', lx: 442, ly: 252, style: 'panel' },
];

export interface ObjDef {
  id: string;
  kind: ObjKind;
  name: string;
  x: number;
  y: number;
  cap: number;
  hp: number;
  district?: DistrictId;
  soc?: number;
  pump?: number;
}

export const OBJECTS: ObjDef[] = [
  // ---- генерація
  { id: 'tec5', kind: 'tpp', name: 'ТЕЦ-5', x: 378, y: 246, cap: 700, hp: 220 },
  { id: 'tec6', kind: 'tpp', name: 'ТЕЦ-6', x: 433, y: 140, cap: 500, hp: 190 },
  { id: 'darn', kind: 'tpp', name: 'Дарницька ТЕЦ', x: 418, y: 214, cap: 160, hp: 130 },
  { id: 'khpp', kind: 'hpp', name: 'Київська ГЕС', x: 350, y: 81, cap: 440, hp: 240 },
  { id: 'kpspp', kind: 'pspp', name: 'Київська ГАЕС', x: 340, y: 96, cap: 235, hp: 150, soc: 940, pump: 129 },
  { id: 'tryp', kind: 'tes', name: 'Трипільська ТЕС', x: 470, y: 478, cap: 1800, hp: 280 },
  // ---- магістральна мережа (Укренерго)
  { id: 'k750', kind: 'sub750', name: 'ПС 750 кВ «Київська»', x: 40, y: 212, cap: 999, hp: 150 },
  { id: 'piv', kind: 'sub330', name: 'ПС 330 кВ «Північна»', x: 326, y: 126, cap: 800, hp: 110 },
  { id: 'nyvk', kind: 'sub330', name: 'ПС 330 кВ «Нивки»', x: 290, y: 186, cap: 600, hp: 110 },
  { id: 'zakh', kind: 'sub330', name: 'ПС 330 кВ «Західна»', x: 226, y: 214, cap: 600, hp: 110 },
  { id: 'novo', kind: 'sub330', name: 'ПС 330 кВ «Новокиївська»', x: 270, y: 272, cap: 800, hp: 110 },
  { id: 'zhov', kind: 'sub330', name: 'ПС 330 кВ «Жовтнева»', x: 362, y: 266, cap: 800, hp: 110 },
  { id: 'brov', kind: 'sub330', name: 'ПС 330 кВ «Броварська»', x: 498, y: 186, cap: 800, hp: 110 },
  { id: 'impn', kind: 'import', name: 'Перетік з Чернігівщини', x: 600, y: 24, cap: 150, hp: 120 },
  { id: 'imps', kind: 'import', name: 'Перетік з Черкащини', x: 628, y: 548, cap: 150, hp: 120 },
  // ---- ПС 110 кВ ДТЕК (умовні назви)
  { id: 's_obolon', kind: 'sub110', name: 'ПС 110 кВ «Оболонь»', x: 342, y: 152, cap: 160, hp: 60, district: 'obolonskyi' },
  { id: 's_minska', kind: 'sub110', name: 'ПС 110 кВ «Мінська»', x: 330, y: 140, cap: 160, hp: 60, district: 'obolonskyi' },
  { id: 's_podil', kind: 'sub110', name: 'ПС 110 кВ «Поділ»', x: 344, y: 180, cap: 160, hp: 60, district: 'podilskyi' },
  { id: 's_vynohradar', kind: 'sub110', name: 'ПС 110 кВ «Виноградар»', x: 300, y: 150, cap: 160, hp: 60, district: 'podilskyi' },
  { id: 's_lukianivka', kind: 'sub110', name: 'ПС 110 кВ «Лук’янівка»', x: 322, y: 186, cap: 160, hp: 60, district: 'shevchenkivskyi' },
  { id: 's_center', kind: 'sub110', name: 'ПС 110 кВ «Центр»', x: 340, y: 200, cap: 160, hp: 60, district: 'shevchenkivskyi' },
  { id: 's_pechersk', kind: 'sub110', name: 'ПС 110 кВ «Печерськ»', x: 360, y: 212, cap: 160, hp: 60, district: 'pecherskyi' },
  { id: 's_zvirynets', kind: 'sub110', name: 'ПС 110 кВ «Звіринець»', x: 368, y: 234, cap: 160, hp: 60, district: 'pecherskyi' },
  { id: 's_demiivka', kind: 'sub110', name: 'ПС 110 кВ «Деміївка»', x: 350, y: 244, cap: 160, hp: 60, district: 'holosiivskyi' },
  { id: 's_teremky', kind: 'sub110', name: 'ПС 110 кВ «Теремки»', x: 308, y: 274, cap: 160, hp: 60, district: 'holosiivskyi' },
  { id: 's_chokolivka', kind: 'sub110', name: 'ПС 110 кВ «Чоколівка»', x: 318, y: 216, cap: 160, hp: 60, district: 'solomianskyi' },
  { id: 's_vidradnyi', kind: 'sub110', name: 'ПС 110 кВ «Відрадний»', x: 292, y: 214, cap: 160, hp: 60, district: 'solomianskyi' },
  { id: 's_sviatoshyn', kind: 'sub110', name: 'ПС 110 кВ «Святошин»', x: 252, y: 182, cap: 160, hp: 60, district: 'sviatoshynskyi' },
  { id: 's_borshch', kind: 'sub110', name: 'ПС 110 кВ «Борщагівка»', x: 262, y: 214, cap: 160, hp: 60, district: 'sviatoshynskyi' },
  { id: 's_troieshchyna', kind: 'sub110', name: 'ПС 110 кВ «Троєщина»', x: 418, y: 157, cap: 160, hp: 60, district: 'desnianskyi' },
  { id: 's_lisovyi', kind: 'sub110', name: 'ПС 110 кВ «Лісовий»', x: 446, y: 174, cap: 160, hp: 60, district: 'desnianskyi' },
  { id: 's_voskresenka', kind: 'sub110', name: 'ПС 110 кВ «Воскресенка»', x: 432, y: 188, cap: 160, hp: 60, district: 'dniprovskyi' },
  { id: 's_livoberezhna', kind: 'sub110', name: 'ПС 110 кВ «Лівобережна»', x: 390, y: 204, cap: 160, hp: 60, district: 'dniprovskyi' },
  { id: 's_pozniaky', kind: 'sub110', name: 'ПС 110 кВ «Позняки»', x: 410, y: 244, cap: 160, hp: 60, district: 'darnytskyi' },
  { id: 's_kharkivska', kind: 'sub110', name: 'ПС 110 кВ «Харківська»', x: 448, y: 240, cap: 160, hp: 60, district: 'darnytskyi' },
  // ---- критичні споживачі
  { id: 'c_water_d', kind: 'crit', name: 'Дніпровська водопровідна станція', x: 340, y: 128, cap: 25, hp: 60, district: 'obolonskyi' },
  { id: 'c_water_ds', kind: 'crit', name: 'Деснянська водопровідна станція', x: 440, y: 114, cap: 25, hp: 60, district: 'desnianskyi' },
  { id: 'c_bort', kind: 'crit', name: 'Бортницька станція аерації', x: 440, y: 272, cap: 15, hp: 60, district: 'darnytskyi' },
  // ---- промзони (бізнес-тариф, найнижчий пріоритет у дефіцит) — реальні промзони з OSM
  { id: 'i_telychka', kind: 'industry', name: 'Промзона «Теличка»', x: 371, y: 255, cap: 40, hp: 100, district: 'holosiivskyi' },
  { id: 'i_sviatoshyn', kind: 'industry', name: 'Промзона «Святошин»', x: 268, y: 172, cap: 35, hp: 100, district: 'sviatoshynskyi' },
  { id: 'i_podil', kind: 'industry', name: 'Промзона «Поділ»', x: 350, y: 171, cap: 25, hp: 100, district: 'podilskyi' },
  { id: 'i_troieshchyna', kind: 'industry', name: 'Промзона «Троєщина»', x: 440, y: 132, cap: 30, hp: 100, district: 'desnianskyi' },
  { id: 'i_darnytsia', kind: 'industry', name: 'Промзона «Дарниця»', x: 447, y: 224, cap: 40, hp: 100, district: 'darnytskyi' },
  // ---- сміттєспалювальна ТЕЦ «Енергія»: переважно тепло для Позняків, турбіна ~4 МВт
  { id: 'wte', kind: 'wte', name: 'Сміттєспалювальний завод «Енергія»', x: 432, y: 258, cap: 4, hp: 90, district: 'darnytskyi' },
  // ---- бази бригад
  { id: 'base_r', kind: 'base', name: 'База бригад (правий берег)', x: 318, y: 206, cap: 0, hp: 60 },
  { id: 'base_l', kind: 'base', name: 'База бригад (лівий берег)', x: 424, y: 200, cap: 0, hp: 60 },
];

export interface LineDef { a: string; b: string; kv: 110 | 330 | 750; cap: number }

const L330 = (a: string, b: string, cap = 600): LineDef => ({ a, b, kv: 330, cap });
const L110 = (a: string, b: string): LineDef => ({ a, b, kv: 110, cap: 160 });

export const LINES: LineDef[] = [
  // імпорт з АЕС через ПС 750 «Київська»
  L330('k750', 'piv'), L330('k750', 'zakh'), L330('k750', 'novo'),
  // кільце 330 кВ
  L330('piv', 'nyvk'), L330('nyvk', 'zakh'), L330('zakh', 'novo'), L330('novo', 'zhov'),
  L330('zhov', 'brov'), L330('brov', 'piv'),
  // станції
  L330('khpp', 'piv'), L330('kpspp', 'piv', 400), L330('tec5', 'zhov', 800), L330('tec6', 'brov'),
  L330('darn', 'brov', 300), L330('tryp', 'zhov', 250), L330('tryp', 'novo', 250),
  L330('impn', 'brov', 300), L330('imps', 'tryp', 300),
  // розподіл 110 кВ
  L110('piv', 's_obolon'), L110('piv', 's_minska'), L110('nyvk', 's_minska'),
  L110('nyvk', 's_podil'), L110('piv', 's_vynohradar'),
  L110('nyvk', 's_lukianivka'), L110('nyvk', 's_center'), L110('zhov', 's_center'),
  L110('zhov', 's_pechersk'), L110('zhov', 's_zvirynets'), L110('tec5', 's_zvirynets'),
  L110('tec5', 's_demiivka'), L110('zhov', 's_demiivka'), L110('novo', 's_teremky'),
  L110('zhov', 's_chokolivka'), L110('zakh', 's_vidradnyi'), L110('novo', 's_vidradnyi'),
  L110('zakh', 's_sviatoshyn'), L110('nyvk', 's_sviatoshyn'), L110('zakh', 's_borshch'),
  L110('tec6', 's_troieshchyna'), L110('brov', 's_lisovyi'), L110('tec6', 's_lisovyi'),
  L110('brov', 's_voskresenka'), L110('tec6', 's_voskresenka'), L110('darn', 's_livoberezhna'),
  L110('darn', 's_pozniaky'), L110('brov', 's_pozniaky'), L110('brov', 's_kharkivska'),
];

/** Декоративні лінії 750 кВ за край карти (до АЕС). */
export const EDGE_LINES: [string, number, number, string][] = [
  ['k750', -4, 230, 'до Рівненської та Хмельницької АЕС'],
  ['k750', -4, 150, 'до ЧАЕС (вузол)'],
  ['k750', 60, 590, 'до Вінниці'],
];
