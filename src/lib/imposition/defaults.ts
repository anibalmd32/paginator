import type { MagazineConfig, TrimSize } from '@/lib/types';

export interface TrimPreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export interface PaperPreset {
  id: string;
  label: string;
  gsm: number;
  caliperMm: number;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export const TRIM_PRESETS: readonly TrimPreset[] = deepFreeze([
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210 },
  { id: 'b5', label: 'B5', widthMm: 176, heightMm: 250 },
  { id: 'letter', label: 'Carta', widthMm: 216, heightMm: 279 },
  { id: 'half-letter', label: 'Media carta', widthMm: 140, heightMm: 216 },
  { id: 'magazine', label: 'Revista', widthMm: 205, heightMm: 275 },
  { id: 'tabloid', label: 'Tabloide', widthMm: 279, heightMm: 432 },
  { id: 'square', label: 'Cuadrado', widthMm: 210, heightMm: 210 },
]);

export const INTERIOR_PAPERS: readonly PaperPreset[] = deepFreeze([
  { id: 'coated-90', label: 'Estucado 90 g', gsm: 90, caliperMm: 0.07 },
  { id: 'coated-115', label: 'Estucado 115 g', gsm: 115, caliperMm: 0.09 },
  { id: 'coated-135', label: 'Estucado 135 g', gsm: 135, caliperMm: 0.105 },
  { id: 'coated-150', label: 'Estucado 150 g', gsm: 150, caliperMm: 0.12 },
  { id: 'offset-90', label: 'Offset 90 g', gsm: 90, caliperMm: 0.11 },
]);

export const COVER_PAPERS: readonly PaperPreset[] = deepFreeze([
  { id: 'coated-200', label: 'Estucado 200 g', gsm: 200, caliperMm: 0.17 },
  { id: 'coated-250', label: 'Estucado 250 g', gsm: 250, caliperMm: 0.22 },
  { id: 'coated-300', label: 'Estucado 300 g', gsm: 300, caliperMm: 0.27 },
  { id: 'board-350', label: 'Cartulina 350 g', gsm: 350, caliperMm: 0.42 },
]);

export const SIGNATURE_PAGE_OPTIONS: readonly number[] = Object.freeze([4, 8, 12, 16, 24, 32]);

export const DEFAULT_CONFIG: MagazineConfig = deepFreeze<MagazineConfig>({
  title: 'Revista sin título',

  inputMode: 'pages',
  spreadKind: 'reader',
  wraparoundCover: false,

  binding: 'saddle-stitch',
  signaturePages: 16,
  separateCover: true,

  declaredPageCount: null,
  autoPadBlanks: true,
  blankPlacement: 'before-back-cover',

  readingDirection: 'ltr',

  trim: { mode: 'auto' },
  bleedMm: 0,
  marksMm: 0,
  safeMarginMm: 5,

  paper: {
    interiorGsm: 115,
    interiorCaliperMm: 0.09,
    coverGsm: 250,
    coverCaliperMm: 0.22,
  },
});

const PRESET_TOLERANCE_MM = 0.5;

export function findTrimPreset(trim: TrimSize): TrimPreset | null {
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= PRESET_TOLERANCE_MM;
  for (const preset of TRIM_PRESETS) {
    const upright = near(trim.widthMm, preset.widthMm) && near(trim.heightMm, preset.heightMm);
    const rotated = near(trim.widthMm, preset.heightMm) && near(trim.heightMm, preset.widthMm);
    if (upright || rotated) return preset;
  }
  return null;
}
