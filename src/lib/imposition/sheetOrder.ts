import type { ImpositionResult, Page, SheetFace, SheetImposition, SlotPosition } from '@/lib/types';

export interface SheetRange {
  first: number;
  last: number;
}

const SLOTS: readonly (readonly [SheetFace, SlotPosition])[] = [
  ['front', 'left'],
  ['front', 'right'],
  ['back', 'left'],
  ['back', 'right'],
];

export function slotPageNumbers(sheet: SheetImposition): [number, number, number, number] {
  return [sheet.front.left, sheet.front.right, sheet.back.left, sheet.back.right];
}

export function movableSheetRange(imposition: Pick<ImpositionResult, 'sheets' | 'binding'>): SheetRange | null {
  const { sheets } = imposition;
  const separateCover = imposition.binding === 'perfect-bound' && sheets[0]?.role === 'cover' && sheets[0].sheetsInSignature === 1;
  const first = separateCover ? 1 : 0;
  const last = sheets.length - 1;
  return last - first >= 1 ? { first, last } : null;
}

export function canMoveSheet(imposition: Pick<ImpositionResult, 'sheets' | 'binding'>, from: number, to: number): boolean {
  const range = movableSheetRange(imposition);
  if (!range || from === to) return false;
  const inside = (index: number): boolean => Number.isInteger(index) && index >= range.first && index <= range.last;
  return inside(from) && inside(to);
}

export function sheetOrderAfterMove(count: number, from: number, to: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  const [moved] = order.splice(from, 1);
  if (moved === undefined) return order;
  order.splice(to, 0, moved);
  return order;
}

export function reorderSheets(effectivePages: readonly Page[], imposition: Pick<ImpositionResult, 'sheets' | 'binding' | 'pageCount'>, from: number, to: number): Page[] | null {
  if (effectivePages.length !== imposition.pageCount || !canMoveSheet(imposition, from, to)) return null;
  const { sheets } = imposition;
  const order = sheetOrderAfterMove(sheets.length, from, to);
  const next: Page[] = [...effectivePages];
  order.forEach((sourceIndex, targetIndex) => {
    const source = sheets[sourceIndex];
    const target = sheets[targetIndex];
    if (!source || !target || sourceIndex === targetIndex) return;
    for (const [face, position] of SLOTS) {
      const page = effectivePages[source[face][position] - 1];
      if (page) next[target[face][position] - 1] = page;
    }
  });
  return next;
}

export function sheetContentKey(effectivePages: readonly Page[], sheet: SheetImposition): string {
  return slotPageNumbers(sheet)
    .map((pageNumber) => effectivePages[pageNumber - 1]?.id ?? `#${String(pageNumber)}`)
    .join('|');
}
