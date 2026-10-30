// Палітра гри. Кольори в hex і як упаковані ABGR-числа для ImageData (little-endian).
import type { Season } from '../sim/types';

export const C = {
  outline: '#11131a',
  night: '#0e1428',
  waterDeep: '#1b4a75',
  water: '#245f90',
  waterLight: '#3c80b4',
  waterShine: '#9fd0f0',
  ice: '#c9e1ef',
  iceDark: '#9fbfd3',
  sand: '#c9b27c',
  road: '#7b7f8c',
  roadLight: '#a3a8b4',
  roadDark: '#4b4f5a',
  bridge: '#c7cbd4',
  window: '#ffd166',
  windowHot: '#fff1b0',
  windowWarm: '#ffb45c',
  yellow: '#ffd400',
  blue: '#0057b7',
  red: '#e63946',
  orange: '#ff8c42',
  green: '#4ade80',
  white: '#f4f6fb',
  grey: '#9aa0ad',
  smoke: '#b8bcc6',
  smokeDark: '#3a3d45',
  fire1: '#ffd166',
  fire2: '#ff8c42',
  fire3: '#e63946',
  tracer: '#ffdf7a',
  missileTrail: '#e8ecf4',
};

export interface SeasonPal {
  grass: string[];
  field: string[];
  forest: string[];
  urban: string[];
  street: string;
  roof: string[];
  wall: string[];
  snow: boolean;
}

export const SEASONS: Record<Season, SeasonPal> = {
  autumn: {
    grass: ['#4b5a32', '#566536', '#62703c'],
    field: ['#7d7a3e', '#8f8146', '#6a6a38', '#5b6236', '#987a48'],
    forest: ['#2c3a22', '#4a4a24', '#7a5a26', '#9a6a2a', '#3a4a26'],
    urban: ['#4a4c52', '#525560', '#45484f'],
    street: '#62656f',
    roof: ['#6b4234', '#86513b', '#3e4351', '#5a5f6c'],
    wall: ['#9a9fae', '#b2b3bb', '#7c8191', '#b8a28a'],
    snow: false,
  },
  winter: {
    grass: ['#dfe7ee', '#d2dce6', '#e8eef4'],
    field: ['#e4ebf1', '#d8e1ea', '#eef3f7', '#cfd9e3', '#e0e8ef'],
    forest: ['#2c3e33', '#3e5244', '#d6e0e8', '#53685a', '#c4d0da'],
    urban: ['#9aa4b2', '#a8b1be', '#8f99a8'],
    street: '#7a8290',
    roof: ['#e6edf3', '#d4dde6', '#eef3f7', '#c9d3dd'],
    wall: ['#8d93a3', '#a3a7b2', '#727889', '#a8957f'],
    snow: true,
  },
  spring: {
    grass: ['#4f7a3a', '#5c8842', '#6a964a'],
    field: ['#6f8a3e', '#8c9448', '#5e7a38', '#9aa255', '#7a6a42'],
    forest: ['#244a2a', '#2f5e33', '#3d7240', '#4f8a4a', '#2a5030'],
    urban: ['#4a4d55', '#545862', '#464951'],
    street: '#646872',
    roof: ['#6b4234', '#86513b', '#3e4351', '#5a5f6c'],
    wall: ['#9a9fae', '#b2b3bb', '#7c8191', '#b8a28a'],
    snow: false,
  },
  summer: {
    grass: ['#5a7a34', '#678a3a', '#749640'],
    field: ['#a39a4a', '#c2ad5a', '#8a9442', '#b9a24e', '#7e8a3e'],
    forest: ['#21452a', '#2c5a32', '#3a6e3c', '#4a8044', '#264c2d'],
    urban: ['#555861', '#5f626c', '#4f525b'],
    street: '#6c707b',
    roof: ['#6b4234', '#86513b', '#3e4351', '#5a5f6c'],
    wall: ['#a2a7b4', '#b9bac2', '#868b9a', '#c0aa90'],
    snow: false,
  },
};

/** '#rrggbb' -> 0xAABBGGRR для Uint32Array поверх ImageData. */
export function packColor(hex: string, a = 255): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const r = Math.round(r1 + (r2 - r1) * t), g = Math.round(g1 + (g2 - g1) * t), bb = Math.round(b1 + (b2 - b1) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bb).toString(16).slice(1);
}
