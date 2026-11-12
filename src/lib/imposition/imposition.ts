import type {
  BindingType,
  ImpositionResult,
  MagazineConfig,
  PagePlacement,
  ReadingDirection,
  SheetFace,
  SheetImposition,
  SheetRole,
  SheetSide,
  SignatureInfo,
  SlotPosition,
  Spread,
} from '@/lib/types';

export type ImpositionOptions = Pick<
  MagazineConfig,
  'binding' | 'signaturePages' | 'separateCover' | 'readingDirection'
>;

export interface PrinterSide {
  sheetIndex: number;
  face: SheetFace;
  left: number;
  right: number;
}

const PAGES_PER_SHEET = 4;

const FALLBACK_SIGNATURE_PAGES = 16;

export function paddedPageCount(n: number): number {
  if (!Number.isFinite(n) || n <= PAGES_PER_SHEET) return PAGES_PER_SHEET;
  return Math.ceil(n / PAGES_PER_SHEET) * PAGES_PER_SHEET;
}

export function blanksNeeded(n: number): number {
  const count = Number.isFinite(n) ? Math.max(0, Math.ceil(n)) : 0;
  return paddedPageCount(count) - count;
}

export function normalizeSignaturePages(signaturePages: number): number {
  if (!Number.isFinite(signaturePages)) return FALLBACK_SIGNATURE_PAGES;
  return Math.max(PAGES_PER_SHEET, Math.floor(signaturePages / PAGES_PER_SHEET) * PAGES_PER_SHEET);
}

interface SignaturePlan {
  first: number;
  last: number;
  sheetCount: number;
  role: SheetRole;
  outerSheetRole: SheetRole;
}

function planSignatures(pageCount: number, options: ImpositionOptions): SignaturePlan[] {
  if (options.binding === 'saddle-stitch') {
    return [
      { first: 1, last: pageCount, sheetCount: pageCount / PAGES_PER_SHEET, role: 'interior', outerSheetRole: 'cover' },
    ];
  }

  const plans: SignaturePlan[] = [];
  let interiorFirst = 1;
  let interiorLast = pageCount;
  if (options.separateCover) {
    plans.push({ first: 1, last: pageCount, sheetCount: 1, role: 'cover', outerSheetRole: 'cover' });
    interiorFirst = 3;
    interiorLast = pageCount - 2;
  }

  const size = normalizeSignaturePages(options.signaturePages);
  for (let first = interiorFirst; first <= interiorLast; first += size) {
    const last = Math.min(first + size - 1, interiorLast);
    plans.push({
      first,
      last,
      sheetCount: (last - first + 1) / PAGES_PER_SHEET,
      role: 'interior',
      outerSheetRole: 'interior',
    });
  }
  return plans;
}

function sheetSides(first: number, last: number, j: number, rtl: boolean): { front: SheetSide; back: SheetSide } {
  const low = first + 2 * j;
  const high = last - 2 * j;
  const front: SheetSide = { left: high, right: low };
  const back: SheetSide = { left: low + 1, right: high - 1 };
  if (!rtl) return { front, back };
  return {
    front: { left: front.right, right: front.left },
    back: { left: back.right, right: back.left },
  };
}

export function computeImposition(pageCount: number, options: ImpositionOptions): ImpositionResult {
  if (!Number.isInteger(pageCount) || pageCount < PAGES_PER_SHEET || pageCount % PAGES_PER_SHEET !== 0) {
    throw new RangeError(
      `No se pueden imponer ${String(pageCount)} páginas: el total debe ser un múltiplo de 4 (mínimo 4).`,
    );
  }

  const rtl = options.readingDirection === 'rtl';
  const sheets: SheetImposition[] = [];
  const signatures: SignatureInfo[] = [];
  const placements = new Array<PagePlacement | undefined>(pageCount).fill(undefined);

  planSignatures(pageCount, options).forEach((plan, signatureIndex) => {
    const firstSheetIndex = sheets.length;
    const pageNumbers: number[] = [];

    for (let j = 0; j < plan.sheetCount; j += 1) {
      const index = sheets.length;
      const { front, back } = sheetSides(plan.first, plan.last, j, rtl);
      sheets.push({
        index,
        number: index + 1,
        signature: signatureIndex,
        indexInSignature: j,
        sheetsInSignature: plan.sheetCount,
        role: j === 0 ? plan.outerSheetRole : 'interior',
        front,
        back,
      });

      const faces: [SheetFace, SheetSide][] = [
        ['front', front],
        ['back', back],
      ];
      for (const [face, side] of faces) {
        const slots: [SlotPosition, number][] = [
          ['left', side.left],
          ['right', side.right],
        ];
        for (const [position, pageNumber] of slots) {
          pageNumbers.push(pageNumber);
          placements[pageNumber - 1] = { pageNumber, sheetIndex: index, face, position, signature: signatureIndex };
        }
      }
    }

    signatures.push({
      index: signatureIndex,
      role: plan.role,
      sheets: plan.sheetCount,
      pages: plan.sheetCount * PAGES_PER_SHEET,
      pageNumbers: pageNumbers.sort((a, b) => a - b),
      firstSheetIndex,
    });
  });

  const complete: PagePlacement[] = [];
  for (let n = 1; n <= pageCount; n += 1) {
    const placement = placements[n - 1];
    if (!placement) throw new Error(`Imposición incoherente: la página ${String(n)} no tiene pliego asignado.`);
    complete.push(placement);
  }

  return {
    pageCount,
    binding: options.binding,
    readingDirection: options.readingDirection,
    sheets,
    signatures,
    placements: complete,
    spreads: computeSpreads(pageCount, options.readingDirection),
  };
}

export function computeSpreads(pageCount: number, direction: ReadingDirection): Spread[] {
  const total = Number.isFinite(pageCount) ? Math.max(0, Math.floor(pageCount)) : 0;
  if (total === 0) return [];

  const spreads: Spread[] = [];
  const lastIndex = Math.floor(total / 2);
  for (let index = 0; index <= lastIndex; index += 1) {
    const even = index === 0 ? null : 2 * index;
    const odd = 2 * index + 1 <= total ? 2 * index + 1 : null;
    spreads.push(direction === 'rtl' ? { index, left: odd, right: even } : { index, left: even, right: odd });
  }
  return spreads;
}

export function spreadIndexOfPage(pageNumber: number): number {
  return Math.floor(pageNumber / 2);
}

export function expectedSide(pageNumber: number, direction: ReadingDirection): SlotPosition {
  const odd = Math.abs(pageNumber) % 2 === 1;
  if (direction === 'rtl') return odd ? 'left' : 'right';
  return odd ? 'right' : 'left';
}

export function printerSideSequence(result: ImpositionResult): PrinterSide[] {
  const sides: PrinterSide[] = [];
  for (const sheet of result.sheets) {
    sides.push({ sheetIndex: sheet.index, face: 'front', left: sheet.front.left, right: sheet.front.right });
    sides.push({ sheetIndex: sheet.index, face: 'back', left: sheet.back.left, right: sheet.back.right });
  }
  return sides;
}

export function printerSideIndexOf(placement: Pick<PagePlacement, 'sheetIndex' | 'face'>): number {
  return placement.sheetIndex * 2 + (placement.face === 'back' ? 1 : 0);
}

export function interiorSignatureNumber(sheets: readonly SheetImposition[], binding: BindingType, signatureIndex: number): number | null {
  const separateCover = binding === 'perfect-bound' && sheets[0]?.role === 'cover' && sheets[0].signature === 0;
  if (separateCover && signatureIndex === 0) return null;
  return separateCover ? signatureIndex : signatureIndex + 1;
}
