// Серіалізований стан гри. Без функцій і DOM — його можна зберегти в localStorage
// і ганяти в Node (тести, бот-балансер).

export type DistrictId =
  | 'obolonskyi' | 'podilskyi' | 'shevchenkivskyi' | 'pecherskyi' | 'holosiivskyi'
  | 'solomianskyi' | 'sviatoshynskyi' | 'desnianskyi' | 'dniprovskyi' | 'darnytskyi';

export type ObjKind =
  | 'tpp' | 'tes' | 'hpp' | 'pspp'
  | 'sub750' | 'sub330' | 'sub110' | 'import'
  | 'kgu' | 'gtu' | 'ses' | 'bess' | 'boiler'
  | 'pn' | 'base' | 'depot' | 'decoy'
  | 'crit';

export type DefType = 'mfg' | 'manpads' | 'gepard' | 'interceptor' | 'ew' | 'radar' | 'nasams' | 'irist' | 'patriot';
export type AmmoType = 'manpads' | 'gepard' | 'interceptor' | 'nasams' | 'irist' | 'patriot';
export type ThreatType = 'shahed' | 'gerbera' | 'jet' | 'recon' | 'kh101' | 'kalibr' | 'iskander' | 'kinzhal' | 'zircon';
export type ThreatClass = 'drone' | 'cruise' | 'ballistic';
export type FirePolicy = 'smart' | 'missiles' | 'ballistic' | 'all';
export type CrewType = 'city' | 'hv' | 'plant';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'hell';
export type WavePolicy = 'mixed' | 'generation' | 'ring' | 'imports' | 'distribution' | 'finish';
export type Season = 'autumn' | 'winter' | 'spring' | 'summer';

export interface PObj {
  id: string;
  kind: ObjKind;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  prot: number;
  /** Генерація / потужність трансформатора / попит критичного споживача, МВт. */
  cap: number;
  district?: DistrictId;
  built: boolean;
  /** Хвилина гри, до якої триває пожежа (0 — немає). */
  fireUntil: number;
  /** Останній розрахунок мережі: видача або транзит, МВт. */
  out: number;
  /** Накопичувачі: заряд і ємність, МВт·год; потужність насоса/заряду, МВт. */
  soc?: number;
  socMax?: number;
  pump?: number;
  /** Знищену станцію повертає до роботи проєкт відновлення. */
  projectUntil?: number;
  /** Критичні споживачі: години дизеля, отримана потужність. */
  backupLeft?: number;
  critServed?: number;
  tempSub?: boolean;
  /** Ручний пріоритет ремонту. */
  priority?: boolean;
  /** Подарунок/стартовий об'єкт, якого не можна продати. */
  fixed?: boolean;
}

export interface Line {
  id: string;
  a: string;
  b: string;
  kv: 110 | 330 | 750;
  cap: number;
  hp: number;
  maxHp: number;
  cable: boolean;
  built: boolean;
  flow: number;
}

export interface Defense {
  id: number;
  type: DefType;
  x: number;
  y: number;
  ammo: number;
  cd: number;
  policy: FirePolicy;
  hp: number;
  built: boolean;
  /** Переїзд: ціль і швидкість у px/хв гри. */
  tx?: number;
  ty?: number;
  idle: number;
  kills: number;
  shots: number;
}

export interface Threat {
  id: number;
  type: ThreatType;
  x: number;
  y: number;
  /** Маршрут: плоский масив [x0,y0,x1,y1,...], pi — індекс наступної точки. */
  path: number[];
  pi: number;
  target: string;
  tx: number;
  ty: number;
  heading: number;
  /** >0 — дрон втратив навігацію і падає (лічильник у бойових секундах). */
  lost: number;
  jammed: boolean;
  reserved: number;
  identified: boolean;
  /** Балістика: прогрес 0..1 для дуги. */
  prog: number;
  dist0: number;
}

export interface Proj {
  id: number;
  def: DefType;
  x: number;
  y: number;
  tid: number;
  speed: number;
  pk: number;
  life: number;
  heading: number;
}

export interface Crew {
  id: number;
  type: CrewType;
  x: number;
  y: number;
  path: number[];
  pi: number;
  state: 'idle' | 'move' | 'work' | 'rest' | 'shelter' | 'injured';
  job: string | null;
  stamina: number;
  injuredUntil: number;
  manual: boolean;
}

export interface DistrictState {
  id: DistrictId;
  name: string;
  pop: number;
  share: number;
  heatSrc: string;
  priority: boolean;
  demand: number;
  served: number;
  frac: number;
  /** Частка, запланована на початку години (графік). */
  plan: number;
  queuesOff: number;
  noHeat: number;
  pn: number;
  cx: number;
  cy: number;
  accFrac: number;
  accEmerg: number;
  accMin: number;
}

export interface PendingSpawn {
  at: number;
  type: ThreatType;
  dir: string;
  target: string;
  group: number;
}

export interface BuildJob {
  id: number;
  kind: 'obj' | 'line' | 'prot' | 'project' | 'def' | 'tech';
  ref: string;
  start: number;
  until: number;
  label: string;
  level?: number;
}

export interface Choice {
  id: string;
  title: string;
  text: string;
  options: { label: string; effect: string }[];
}

export type FxEvent =
  | { t: 'boom'; x: number; y: number; size: number; ground: boolean }
  | { t: 'tracer'; x1: number; y1: number; x2: number; y2: number; color: number }
  | { t: 'launch'; x: number; y: number; def: DefType }
  | { t: 'kill'; x: number; y: number; cls: ThreatClass }
  | { t: 'hit'; id: string }
  | { t: 'sound'; s: string }
  | { t: 'siren'; on: boolean };

export interface Toast {
  text: string;
  kind: 'info' | 'bad' | 'good' | 'warn';
  obj?: string;
}

export interface WaveStats {
  launched: number;
  downed: number;
  hits: number;
  missilesSpent: number;
  adCost: number;
  mwLost: number;
}

export interface GameStats {
  downed: Record<string, number>;
  launched: Record<string, number>;
  hits: number;
  missiles: number;
  adCost: number;
  servedAcc: number;
  hoursAcc: number;
  heatAcc: number;
  heatHours: number;
  minTrust: number;
  critOutage: number;
  critOutageMax: number;
  blackStreak: number;
  blackStreakMax: number;
  wavesDone: number;
  repairsHp: number;
}

export interface GameState {
  version: number;
  mode: 'campaign' | 'endless';
  levelId: string;
  difficulty: Difficulty;
  seed: number;
  rng: number;
  season: Season;
  baseTemp: number;
  tempMods: { d: number; until: number }[];

  /** Хвилини гри від 00:00 першого дня. */
  t: number;
  lastDay: number;
  phase: 'day' | 'alert';
  alertStart: number;
  /** Остання повна хвилина, для годинних/добових подій. */
  tick: number;

  money: number;
  trust: number;
  staff: number;
  staffPending: { n: number; at: number }[];
  transformers: number;
  trDeliveries: { n: number; at: number }[];
  stock: Record<AmmoType, number>;
  importBase: number;
  importMods: { mult: number; until: number }[];
  compensation: { amount: number; at: number }[];
  salaryLate: boolean;

  objs: PObj[];
  lines: Line[];
  districts: DistrictState[];
  defs: Defense[];
  threats: Threat[];
  projs: Proj[];
  crews: Crew[];
  builds: BuildJob[];
  pending: PendingSpawn[];
  nextId: number;

  tech: Record<string, boolean>;
  unlocked: { defs: DefType[]; builds: string[]; prot: number; techs: string[]; threats: ThreatType[] };

  /** Що ворог знає про ППО після розвідки. */
  enemyIntel: { ad: number[]; at: number } | null;
  /** Розклад атак: дні з атакою (номер дня -> бюджет/сценарій). */
  waveIndex: number;
  waveDays: number[];
  waveStats: WaveStats | null;
  lastWaveReport: (WaveStats & { day: number }) | null;
  forecast: { drones: number; missiles: number; ballistic: number; dirs: string[]; policy: WavePolicy; day: number } | null;

  autoRepair: boolean;
  crewRisk: boolean;

  gridDirty: boolean;
  lastDispatch: number;
  genTotal: number;
  demandTotal: number;
  servedTotal: number;
  importUsed: number;

  fx: FxEvent[];
  toasts: Toast[];
  news: string[];
  choice: Choice | null;
  stats: GameStats;
  waveAcc: { t: number };
  flags: Record<string, number>;
  over: null | { win: boolean; reason: string; stars: number; score: number };
  speed: number;
  paused: boolean;
}
