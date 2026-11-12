import { paddedPageCount, printerSideSequence, TRIM_PRESETS } from '@/lib/imposition';
import type { PaperPreset } from '@/lib/imposition';
import type { ImpositionResult, MagazineConfig, Page, SheetImposition, TrimSetting, TrimSize } from '@/lib/types';

export function formatNumber(value: number, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return '–';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return String(rounded + 0).replace('.', ',');
}

export function formatSpine(widthMm: number): string {
  return Number.isFinite(widthMm) ? widthMm.toFixed(1).replace('.', ',') : '–';
}

export function formatTrimNumbers(trim: TrimSize): string {
  return `${formatNumber(trim.widthMm)} × ${formatNumber(trim.heightMm)}`;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

export function joinNumbers(numbers: readonly number[]): string {
  if (numbers.length === 0) return '';
  if (numbers.length === 1) return String(numbers[0]);
  return `${numbers.slice(0, -1).join(', ')} y ${String(numbers[numbers.length - 1])}`;
}

export const TRIM_AUTO = 'auto';
export const TRIM_CUSTOM = 'custom';

export function trimSelectValue(trim: TrimSetting): string {
  if (trim.mode === 'auto') return TRIM_AUTO;
  if (trim.presetId !== null && TRIM_PRESETS.some((preset) => preset.id === trim.presetId)) return trim.presetId;
  return TRIM_CUSTOM;
}

export function trimFromSelect(value: string, current: TrimSize): TrimSetting {
  if (value === TRIM_AUTO) return { mode: 'auto' };
  const preset = TRIM_PRESETS.find((candidate) => candidate.id === value);
  if (preset) return { mode: 'fixed', presetId: preset.id, widthMm: preset.widthMm, heightMm: preset.heightMm };
  return { mode: 'fixed', presetId: null, widthMm: current.widthMm, heightMm: current.heightMm };
}

export const TRIM_LIMITS = { min: 50, max: 1000 } as const;

export const PAPER_CUSTOM = 'custom';

export function paperPresetId(presets: readonly PaperPreset[], gsm: number, caliperMm: number): string | null {
  const match = presets.find((preset) => preset.gsm === gsm && Math.abs(preset.caliperMm - caliperMm) < 1e-6);
  return match ? match.id : null;
}

export function hasCoverPaper(config: Pick<MagazineConfig, 'binding' | 'separateCover'>): boolean {
  return config.binding === 'saddle-stitch' || config.separateCover;
}

export interface Capacity {
  wanted: number;
  padded: number;
  missing: number;
}

export function capacityOf(input: { hasPages: boolean; supplied: number; declared: number | null; preview: number }): Capacity {
  const declared = input.declared !== null && Number.isFinite(input.declared) ? Math.max(0, Math.floor(input.declared)) : null;
  const wanted = input.hasPages ? Math.max(input.supplied, declared ?? 0) : (declared ?? input.preview);
  const padded = paddedPageCount(wanted);
  return { wanted, padded, missing: padded - wanted };
}

export function listPages(numbers: readonly number[]): string {
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  const consecutive = first !== undefined && last !== undefined && last - first === numbers.length - 1;
  if (numbers.length > 3 && consecutive) return `${String(first)}–${String(last)}`;
  return joinNumbers(numbers);
}

export function courtesyNote(input: { capacity: Capacity; autoPadBlanks: boolean; blankNumbers: readonly number[] }): string {
  const { capacity, autoPadBlanks, blankNumbers } = input;
  const blanks = Math.max(capacity.missing, blankNumbers.length);
  if (!autoPadBlanks) {
    return `Cada pliego lleva 4 páginas. Sin cortesías el último queda abierto: añade ${String(blanks)} ${plural(blanks, 'página', 'páginas')} a tus archivos o complétalo aquí.`;
  }
  const where = blankNumbers.length > 0 ? ` (${plural(blankNumbers.length, 'pág.', 'págs.')} ${listPages(blankNumbers)})` : '';
  const extra = blanks - capacity.missing;
  const split =
    extra > 0
      ? ` ${String(extra)} ${plural(extra, 'llega', 'llegan')} al total declarado y ${String(capacity.missing)} ${plural(capacity.missing, 'cierra', 'cierran')} el pliego.`
      : '';
  return `Se completa con ${String(blanks)} ${plural(blanks, 'página de cortesía', 'páginas de cortesía')}${where} hasta ${String(capacity.padded)}.${split}`;
}

export interface ExpectedInput {
  units: number;
  label: string;
  detail: string;
  sequence: string[];
  sample: string;
}

export function expectedInput(
  config: Pick<MagazineConfig, 'inputMode' | 'spreadKind' | 'wraparoundCover' | 'readingDirection'>,
  wanted: number,
  imposition: ImpositionResult,
): ExpectedInput {
  const total = Math.max(1, Math.floor(wanted));
  if (config.inputMode === 'pages') {
    const units = Array.from({ length: total }, (_unused, index) => String(index + 1));
    return { units: total, label: `${String(total)} ${plural(total, 'hoja', 'hojas')}`, detail: 'una por página', sequence: units, sample: sampleOf(units) };
  }
  if (config.spreadKind === 'printer') {
    const units = printerSideSequence(imposition).map((side) => `${String(side.left)}-${String(side.right)}`);
    const sheets = imposition.sheets.length;
    return {
      units: units.length,
      label: `${String(units.length)} ${plural(units.length, 'cara', 'caras')}`,
      detail: `cara y retiro de ${String(sheets)} ${plural(sheets, 'pliego', 'pliegos')}`,
      sequence: units,
      sample: sampleOf(units),
    };
  }
  const rtl = config.readingDirection === 'rtl';
  const pair = (first: number, second: number): string => (rtl ? `${String(second)}-${String(first)}` : `${String(first)}-${String(second)}`);
  const units: string[] = [];
  let last = total;
  if (config.wraparoundCover && total >= 2) {
    units.push(pair(total, 1));
    last = total - 1;
  } else {
    units.push('1');
  }
  for (let page = 2; page <= last; page += 2) units.push(page + 1 <= last ? pair(page, page + 1) : String(page));
  const doubles = units.filter((unit) => unit.includes('-')).length;
  const singles = units.length - doubles;
  const detail =
    doubles === 0
      ? plural(singles, 'suelta', 'todas sueltas')
      : singles === 0
        ? plural(doubles, 'doble', 'todas dobles')
        : `${String(singles)} ${plural(singles, 'suelta', 'sueltas')} y ${String(doubles)} ${plural(doubles, 'doble', 'dobles')}`;
  return { units: units.length, label: `${String(units.length)} ${plural(units.length, 'hoja', 'hojas')}`, detail, sequence: units, sample: sampleOf(units) };
}

function sampleOf(units: readonly string[]): string {
  if (units.length <= 6) return units.join(' · ');
  return `${units.slice(0, 3).join(' · ')} … ${units.slice(-2).join(' · ')}`;
}

export type SlotKind = 'page' | 'courtesy' | 'missing' | 'blank';

export function slotKindOf(
  pageNumber: number,
  blankPageNumbers: ReadonlySet<number>,
  effectivePages: readonly Page[],
  autoPadBlanks: boolean,
): SlotKind {
  if (!blankPageNumbers.has(pageNumber)) return 'page';
  if (effectivePages[pageNumber - 1]?.origin === 'manual-blank') return 'blank';
  return autoPadBlanks ? 'courtesy' : 'missing';
}

export const SLOT_TEXT: Record<Exclude<SlotKind, 'page'>, string> = {
  courtesy: 'cortesía',
  missing: 'falta',
  blank: 'blanca',
};

export function sheetAriaLabel(sheet: SheetImposition, kindOf: (page: number) => SlotKind): string {
  const describe = (page: number): string => {
    const kind = kindOf(page);
    return kind === 'page' ? String(page) : `${String(page)} (${SLOT_TEXT[kind]})`;
  };
  const role = sheet.role === 'cover' ? ', cubierta' : '';
  return (
    `Pliego ${String(sheet.number)}${role}: cara, páginas ${describe(sheet.front.left)} y ${describe(sheet.front.right)}; ` +
    `retiro, páginas ${describe(sheet.back.left)} y ${describe(sheet.back.right)}`
  );
}

export type SheetDensity = 'lg' | 'md' | 'sm';

export function densityFor(sheetCount: number): SheetDensity {
  if (sheetCount <= 4) return 'lg';
  if (sheetCount <= 12) return 'md';
  return 'sm';
}

export interface PageBoxes {
  file: { width: number; height: number };
  bleedInset: number;
  trimInset: number;
  safeInset: number;
  safeFits: boolean;
}

export function pageBoxes(trim: TrimSize, bleedMm: number, marksMm: number, safeMarginMm: number): PageBoxes {
  const bleed = Math.max(0, bleedMm);
  const marks = Math.max(0, marksMm);
  const safe = Math.max(0, safeMarginMm);
  const trimInset = bleed + marks;
  return {
    file: { width: trim.widthMm + 2 * trimInset, height: trim.heightMm + 2 * trimInset },
    bleedInset: marks,
    trimInset,
    safeInset: trimInset + safe,
    safeFits: 2 * safe < Math.min(trim.widthMm, trim.heightMm),
  };
}

export const DEFAULT_BLEED_MM = 3;
export const DEFAULT_MARKS_MM = 5;

export function isDefaultConfig(config: MagazineConfig, defaults: MagazineConfig): boolean {
  return stableJson({ ...config, title: '' }) === stableJson({ ...defaults, title: '' });
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

export function matchTrimPreset(trim: TrimSize): (typeof TRIM_PRESETS)[number] | null {
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= 0.5;
  return (
    TRIM_PRESETS.find(
      (preset) =>
        (near(trim.widthMm, preset.widthMm) && near(trim.heightMm, preset.heightMm)) ||
        (near(trim.widthMm, preset.heightMm) && near(trim.heightMm, preset.widthMm)),
    ) ?? null
  );
}
