import type { ImpositionResult, IssueSeverity, SheetImposition, Spread } from '@/lib/types';
import { COVER_STOCK, NEUTRAL_STOCK, signatureStock } from '@/styles/stock';

export type CantoUnit = 'leaf' | 'sheet';

export const COVER_WEIGHT = 1.75;

export interface CantoSlice {
  index: number;
  leafIndex: number | null;
  sheetIndex: number;
  signature: number;
  interiorOrdinal: number | null;
  isCover: boolean;
  indexInSignature: number;
  rise: number;
  fill: string;
  ink: string;
  stockName: string;
  weight: number;
  start: number;
  pages: number[];
}

export interface CantoModel {
  unit: CantoUnit;
  slices: CantoSlice[];
  totalWeight: number;
  leafCount: number;
  leavesBySheet: Map<number, number[]>;
  signatureStarts: number[];
  rtl: boolean;
}

function sheetPages(sheet: SheetImposition): number[] {
  return [sheet.front.left, sheet.front.right, sheet.back.left, sheet.back.right].sort((a, b) => a - b);
}

function stockFor(isCover: boolean, interiorOrdinal: number | null, interiorCount: number) {
  if (isCover) return COVER_STOCK;
  if (interiorCount <= 1 || interiorOrdinal === null) return NEUTRAL_STOCK;
  const stock = signatureStock(interiorOrdinal);
  return { name: stock.name, cssVar: stock.cssVar, inkVar: stock.inkVar };
}

export function sheetRise(sheet: SheetImposition): number {
  if (sheet.sheetsInSignature <= 1) return 0;
  return sheet.indexInSignature / (sheet.sheetsInSignature - 1);
}

export function buildCantoModel(imposition: ImpositionResult, unit: CantoUnit): CantoModel {
  const interiorSignatures = imposition.signatures.filter((signature) => signature.role === 'interior');
  const ordinalBySignature = new Map<number, number>();
  interiorSignatures.forEach((signature, ordinal) => ordinalBySignature.set(signature.index, ordinal));
  const interiorCount = interiorSignatures.length;
  const leafCount = Math.floor(imposition.pageCount / 2);

  const leavesBySheet = new Map<number, number[]>();
  for (let leaf = 0; leaf < leafCount; leaf += 1) {
    const sheetIndex = imposition.placements[2 * leaf]?.sheetIndex;
    if (sheetIndex === undefined) continue;
    const list = leavesBySheet.get(sheetIndex);
    if (list) list.push(leaf);
    else leavesBySheet.set(sheetIndex, [leaf]);
  }

  const slices: CantoSlice[] = [];
  const signatureStarts: number[] = [];
  let cursor = 0;
  let lastSignature = -1;

  const push = (leafIndex: number | null, sheet: SheetImposition, pages: number[]): void => {
    const isCover = sheet.role === 'cover';
    const interiorOrdinal = ordinalBySignature.get(sheet.signature) ?? null;
    const stock = stockFor(isCover, interiorOrdinal, interiorCount);
    const weight = isCover ? COVER_WEIGHT : 1;
    const rise = sheetRise(sheet);
    if (sheet.signature !== lastSignature) {
      signatureStarts.push(slices.length);
      lastSignature = sheet.signature;
    }
    slices.push({
      index: slices.length,
      leafIndex,
      sheetIndex: sheet.index,
      signature: sheet.signature,
      interiorOrdinal,
      isCover,
      indexInSignature: sheet.indexInSignature,
      rise,
      fill: stock.cssVar,
      ink: stock.inkVar,
      stockName: stock.name,
      weight,
      start: cursor,
      pages,
    });
    cursor += weight;
  };

  if (unit === 'leaf') {
    for (let leaf = 0; leaf < leafCount; leaf += 1) {
      const sheetIndex = imposition.placements[2 * leaf]?.sheetIndex;
      const sheet = sheetIndex === undefined ? undefined : imposition.sheets[sheetIndex];
      if (!sheet) continue;
      push(leaf, sheet, [2 * leaf + 1, 2 * leaf + 2]);
    }
  } else {
    for (const sheet of imposition.sheets) push(null, sheet, sheetPages(sheet));
  }

  return { unit, slices, totalWeight: cursor, leafCount, leavesBySheet, signatureStarts, rtl: imposition.readingDirection === 'rtl' };
}

export function positionToWeight(model: CantoModel, position: number): number {
  const clamped = Math.min(Math.max(position, 0), model.slices.length);
  const whole = Math.floor(clamped);
  const slice = model.slices[whole];
  if (!slice) return model.totalWeight;
  return slice.start + (clamped - whole) * slice.weight;
}

export function weightToPosition(model: CantoModel, weight: number): number {
  if (weight <= 0) return 0;
  if (weight >= model.totalWeight) return model.slices.length;
  for (const slice of model.slices) {
    if (weight < slice.start + slice.weight) return slice.index + (weight - slice.start) / slice.weight;
  }
  return model.slices.length;
}

export function sliceAtWeight(model: CantoModel, weight: number): CantoSlice | null {
  if (model.slices.length === 0) return null;
  for (const slice of model.slices) {
    if (weight < slice.start + slice.weight) return slice;
  }
  return model.slices[model.slices.length - 1] ?? null;
}

export function spreadAt(imposition: ImpositionResult, opening: number): Spread | null {
  return imposition.spreads[opening] ?? null;
}

export function openingLabel(imposition: ImpositionResult, opening: number): string {
  const leafCount = Math.floor(imposition.pageCount / 2);
  const n = Math.min(Math.max(Math.round(opening), 0), leafCount);
  if (n === 0) return 'Portada';
  if (n === leafCount) return 'Contraportada';
  const spread = spreadAt(imposition, n);
  const left = spread?.left ?? 2 * n;
  const right = spread?.right ?? 2 * n + 1;
  return `Págs. ${Math.min(left, right)}–${Math.max(left, right)}`;
}

export function formatPageRuns(pages: readonly number[]): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  let previous = start;
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current !== undefined && previous !== undefined && current === previous + 1) {
      previous = current;
      continue;
    }
    if (start !== undefined && previous !== undefined) runs.push(start === previous ? `${start}` : `${start}–${previous}`);
    start = current;
    previous = current;
  }
  return runs.join(' · ');
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { info: 1, warning: 2, error: 3 };

export function worstSeverity(a: IssueSeverity | undefined, b: IssueSeverity | undefined): IssueSeverity | undefined {
  if (!a) return b;
  if (!b) return a;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export const SEVERITY_TEXT: Record<IssueSeverity, string> = {
  error: 'con errores',
  warning: 'con avisos',
  info: 'con notas',
};
