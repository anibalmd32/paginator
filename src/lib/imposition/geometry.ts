import type { MagazineConfig, NormRect, Page, PageGeometry, SourceUnit, SpineEstimate, TrimSize } from '@/lib/types';

import type { UnitKind } from './segmentation';

const FALLBACK_TRIM: TrimSize = { widthMm: 210, heightMm: 297 };

const ASSUMED_IMAGE_TRIM_WIDTH_MM = 210;

function isPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

export function fileMarginMm(config: MagazineConfig): number {
  return nonNegative(config.bleedMm) + nonNegative(config.marksMm);
}

function physicalSizeMm(unit: SourceUnit): TrimSize | null {
  return isPositive(unit.widthMm) && isPositive(unit.heightMm)
    ? { widthMm: unit.widthMm, heightMm: unit.heightMm }
    : null;
}

function hasPixelSize(unit: SourceUnit): boolean {
  return isPositive(unit.width) && isPositive(unit.height);
}

export function expectedUnitSizeMm(kind: UnitKind, config: MagazineConfig, trim: TrimSize): TrimSize {
  const margin = fileMarginMm(config);
  return {
    widthMm: (kind === 'double' ? 2 : 1) * trim.widthMm + 2 * margin,
    heightMm: trim.heightMm + 2 * margin,
  };
}

export interface PageTrimEstimate {
  widthMm: number;
  heightMm: number;
  measured: boolean;
}

export function estimatePageTrim(page: Page, unit: SourceUnit | null, config: MagazineConfig): PageTrimEstimate | null {
  if (!unit || page.unitId === null) return null;
  const margin = fileMarginMm(config);
  const pagesAcross = page.half === 'full' ? 1 : 2;

  const physical = physicalSizeMm(unit);
  if (physical) {
    const widthMm = (physical.widthMm - 2 * margin) / pagesAcross;
    const heightMm = physical.heightMm - 2 * margin;
    return widthMm > 0 && heightMm > 0 ? { widthMm, heightMm, measured: true } : null;
  }

  if (!hasPixelSize(unit)) return null;
  const pxPerMm = unit.width / (pagesAcross * ASSUMED_IMAGE_TRIM_WIDTH_MM + 2 * margin);
  const heightMm = unit.height / pxPerMm - 2 * margin;
  return heightMm > 0 ? { widthMm: ASSUMED_IMAGE_TRIM_WIDTH_MM, heightMm, measured: false } : null;
}

export function resolveTrim(config: MagazineConfig, units: SourceUnit[], pages: Page[]): TrimSize {
  if (config.trim.mode === 'fixed') {
    const { widthMm, heightMm } = config.trim;
    return isPositive(widthMm) && isPositive(heightMm) ? { widthMm, heightMm } : { ...FALLBACK_TRIM };
  }

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const measured: PageTrimEstimate[] = [];
  const assumed: PageTrimEstimate[] = [];
  for (const page of pages) {
    if (page.unitId === null) continue;
    const estimate = estimatePageTrim(page, unitById.get(page.unitId) ?? null, config);
    if (estimate) (estimate.measured ? measured : assumed).push(estimate);
  }

  const sample = measured.length > 0 ? measured : assumed;
  if (sample.length === 0) return { ...FALLBACK_TRIM };
  return {
    widthMm: roundTo(median(sample.map((estimate) => estimate.widthMm)), 1),
    heightMm: roundTo(median(sample.map((estimate) => estimate.heightMm)), 1),
  };
}

interface BoxMm {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toNormRect(box: BoxMm, size: TrimSize): NormRect {
  const left = roundTo(clamp01(box.x0 / size.widthMm), 6);
  const right = roundTo(clamp01(box.x1 / size.widthMm), 6);
  const top = roundTo(clamp01(box.y0 / size.heightMm), 6);
  const bottom = roundTo(clamp01(box.y1 / size.heightMm), 6);
  return { x: left, y: top, w: roundTo(Math.max(0, right - left), 6), h: roundTo(Math.max(0, bottom - top), 6) };
}

function layoutSizeMm(unit: SourceUnit, expected: TrimSize): TrimSize | null {
  const physical = physicalSizeMm(unit);
  if (physical) return physical;
  if (!hasPixelSize(unit) || !isPositive(expected.widthMm) || !isPositive(expected.heightMm)) return null;
  const pxPerMm = Math.min(unit.width / expected.widthMm, unit.height / expected.heightMm);
  return { widthMm: unit.width / pxPerMm, heightMm: unit.height / pxPerMm };
}

export function pageGeometry(page: Page, unit: SourceUnit | null, config: MagazineConfig, trim: TrimSize): PageGeometry {
  const whole = (): NormRect => ({ x: 0, y: 0, w: 1, h: 1 });
  if (!unit || page.unitId === null) return { source: whole(), bleed: whole(), trim: whole(), safe: whole() };

  const half = page.half;
  const source = (): NormRect =>
    half === 'left' ? { x: 0, y: 0, w: 0.5, h: 1 } : half === 'right' ? { x: 0.5, y: 0, w: 0.5, h: 1 } : whole();

  const expected = expectedUnitSizeMm(half === 'full' ? 'single' : 'double', config, trim);
  const size = isPositive(trim.widthMm) && isPositive(trim.heightMm) ? layoutSizeMm(unit, expected) : null;
  if (!size) return { source: source(), bleed: source(), trim: source(), safe: source() };

  const spine = size.widthMm / 2;
  const top = (size.heightMm - trim.heightMm) / 2;
  const trimBox: BoxMm = { x0: spine - trim.widthMm / 2, x1: spine + trim.widthMm / 2, y0: top, y1: top + trim.heightMm };
  if (half === 'left') {
    trimBox.x0 = spine - trim.widthMm;
    trimBox.x1 = spine;
  } else if (half === 'right') {
    trimBox.x0 = spine;
    trimBox.x1 = spine + trim.widthMm;
  }

  const bleed = nonNegative(config.bleedMm);
  const bleedBox: BoxMm = {
    x0: half === 'right' ? trimBox.x0 : trimBox.x0 - bleed,
    x1: half === 'left' ? trimBox.x1 : trimBox.x1 + bleed,
    y0: trimBox.y0 - bleed,
    y1: trimBox.y1 + bleed,
  };

  const safeX = Math.min(nonNegative(config.safeMarginMm), trim.widthMm / 2);
  const safeY = Math.min(nonNegative(config.safeMarginMm), trim.heightMm / 2);
  const safeBox: BoxMm = {
    x0: trimBox.x0 + safeX,
    x1: trimBox.x1 - safeX,
    y0: trimBox.y0 + safeY,
    y1: trimBox.y1 - safeY,
  };

  return {
    source: source(),
    bleed: toNormRect(bleedBox, size),
    trim: toNormRect(trimBox, size),
    safe: toNormRect(safeBox, size),
  };
}

export function estimateSpine(pageCount: number, config: MagazineConfig): SpineEstimate {
  const pages = Number.isFinite(pageCount) ? Math.max(0, pageCount) : 0;
  const leaves = Math.ceil(pages / 2);
  const saddle = config.binding === 'saddle-stitch';
  const hasCover = saddle || config.separateCover;

  const coverLeaves = hasCover ? Math.min(2, leaves) : 0;
  const interiorLeaves = leaves - coverLeaves;
  const interiorCaliper = nonNegative(config.paper.interiorCaliperMm);
  const coverCaliper = nonNegative(config.paper.coverCaliperMm);
  const sheets = Math.ceil(pages / 4);

  return {
    widthMm: roundTo(interiorLeaves * interiorCaliper + coverLeaves * coverCaliper, 2),
    interiorLeaves,
    coverLeaves,
    creepMm: saddle ? roundTo(Math.max(0, sheets - 1) * interiorCaliper, 2) : 0,
  };
}
