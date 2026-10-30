// Усі числові константи балансу в одному місці. Гроші — у млн ₴, потужність — МВт,
// час — хвилини гри, бойовий час — «бойові секунди» (1 б/с = 1,5 хв гри).
import type { Difficulty } from '../sim/types';

export const B = {
  // ---- час
  // час як у Hearts of Iron: на швидкості 1 одна реальна хвилина = одна година гри
  scaleBase: 1,          // хв гри за реальну секунду на швидкості 1
  speeds: [0, 1, 2, 5, 10, 20] as number[],
  skipScale: 40,         // «До вечора»
  csPerMin: 1 / 1.5,     // бойових секунд на хвилину гри
  dayStartMin: 7 * 60,
  alertMin: 21 * 60,
  nightRepairMult: 0.7,

  // ---- попит
  kyivBaseMW: 950,
  tempRef: 10,
  tempK: 0.032,          // +3,2% на кожен градус нижче +10
  acRef: 25,
  acK: 0.02,             // кондиціонери
  heatTemp: 8,           // нижче — опалювальний сезон
  dayCurve: [0.74, 0.71, 0.7, 0.7, 0.72, 0.78, 0.88, 1.0, 1.08, 1.08, 1.05, 1.03, 1.02, 1.01, 1.0, 1.0, 1.03, 1.1, 1.18, 1.2, 1.17, 1.08, 0.95, 0.83],

  // ---- мережа
  dispatchEveryMin: 15,
  lineCost: 0.05,
  genCost: { import: 0.6, hppPeak: 0.2, hppOff: 5, tpp: 1.2, tes: 1.0, kgu: 3.0, gtu: 2.8, ses: 0, storPeak: 1, storOff: 4, mustRun: -5, edge: 0.8 } as Record<string, number>,
  chargeValue: 2,
  queueValue: [100, 96, 92, 88, 84, 80],
  priorityBonus: 10,
  critValue: 1000,
  mustRunFrac: 0.4,
  hppDailyHours: 5,

  // ---- економіка
  tariff: 0.0025,         // млн ₴ за МВт·год (маржа)
  fuelK: 0.001,          // млн ₴ за МВт·год на одиницю genCost
  collectBase: 0.75,
  grantBase: 4,
  salary: 0.06,          // млн ₴/людина/добу
  vehicleUpkeep: 0.05,
  compensationShare: 0.4,
  compensationDelayMin: 2 * 1440,
  hireCost: 3,
  hireN: 5,
  hireDelayMin: 1440,
  transformerCost: 35,
  transformerDelayMin: 3 * 1440,
  matCost: { tpp: 0.25, tes: 0.25, hpp: 0.25, pspp: 0.2, sub750: 0.2, sub330: 0.2, sub110: 0.1, line: 0.05, small: 0.1 } as Record<string, number>,
  projectCostPerHp: 0.35,
  projectDays: 1.5,

  // ---- довіра
  trustStart: 70,
  trustGood: 0.25,
  trustPlanned: 0.75,
  trustEmerg: 2.4,
  trustCrit: 1.5,
  trustHeat: 0.45,
  trustQuick: 3,
  trustMetro: 1.2,
  businessTariff: 1.8,
  pnMitigation: 0.4 / 3,  // за кожен пункт (до 3)
  blackoutFrac: 0.1,
  blackoutHours: 12,

  // ---- бригади
  crewSpeed: 5.3,        // px за хв гри
  staminaWork: 4,
  staminaMove: 1,
  staminaRest: 10,
  injuryRadius: 12,
  injuryChance: 0.5,

  // ---- бій
  debrisChance: 0.25,
  debrisRadius: 6,
  debrisDmg: 5,
  missRadius: [10, 20] as [number, number],
  splashRadius: 6,
  fireChanceMissile: 1,
  fireChanceDrone: 0.3,
  fireHours: [1, 3] as [number, number],
  fireDmgPerHour: 2,
  reconAccBonus: 0.1,
  ewLoseChance: 0.08,
  ewCruiseAccPenalty: 0.3,
  radarPkBonus: 0.1,
  reloadIdleCs: 20,
  waveBudgetK: 1.4,
};

export interface DiffSpec {
  name: string;
  budget: number;
  acc: number;
  money: number;
  income: number;
  repair: number;
  trustLoss: number;
  intelErr: number; // -1 = немає розвідки
  doubleTap: number;
}

export const DIFF: Record<Difficulty, DiffSpec> = {
  easy: { name: 'Легко', budget: 0.7, acc: -0.15, money: 1.5, income: 1.25, repair: 1.3, trustLoss: 0.7, intelErr: 0, doubleTap: 0 },
  normal: { name: 'Нормально', budget: 1, acc: 0, money: 1, income: 1, repair: 1, trustLoss: 1, intelErr: 0.25, doubleTap: 0.1 },
  hard: { name: 'Складно', budget: 1.5, acc: 0.05, money: 0.8, income: 0.9, repair: 0.9, trustLoss: 1.2, intelErr: 0.5, doubleTap: 0.25 },
  hell: { name: 'Пекло', budget: 2.0, acc: 0.1, money: 0.6, income: 0.75, repair: 0.8, trustLoss: 1.5, intelErr: -1, doubleTap: 0.4 },
};

export function hpAvail(hp: number, maxHp: number): number {
  const f = hp / maxHp;
  if (f >= 0.75) return 1;
  if (f >= 0.5) return 0.6;
  if (f >= 0.25) return 0.3;
  return 0;
}
