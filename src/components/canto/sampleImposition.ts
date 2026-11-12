import type { BindingType, ImpositionResult, PagePlacement, ReadingDirection, SheetImposition, SheetRole, SignatureInfo, Spread } from '@/lib/types';

interface SignaturePlan {
  role: SheetRole;
  pages: number[];
  outerRole: SheetRole;
}

function nestedSheets(pages: readonly number[]): { front: [number, number]; back: [number, number] }[] {
  const count = pages.length;
  const sheets: { front: [number, number]; back: [number, number] }[] = [];
  for (let j = 0; j < count / 4; j += 1) {
    const at = (index: number): number => pages[index] ?? 0;
    sheets.push({ front: [at(count - 1 - 2 * j), at(2 * j)], back: [at(2 * j + 1), at(count - 2 - 2 * j)] });
  }
  return sheets;
}

function build(pageCount: number, binding: BindingType, plans: readonly SignaturePlan[], readingDirection: ReadingDirection): ImpositionResult {
  const sheets: SheetImposition[] = [];
  const signatures: SignatureInfo[] = [];
  const placements: PagePlacement[] = [];

  plans.forEach((plan, signatureIndex) => {
    const nested = nestedSheets(plan.pages);
    const firstSheetIndex = sheets.length;
    nested.forEach((sides, j) => {
      const sheet: SheetImposition = {
        index: sheets.length,
        number: sheets.length + 1,
        signature: signatureIndex,
        indexInSignature: j,
        sheetsInSignature: nested.length,
        role: j === 0 ? plan.outerRole : plan.role,
        front: { left: sides.front[0], right: sides.front[1] },
        back: { left: sides.back[0], right: sides.back[1] },
      };
      sheets.push(sheet);
      const slots: [number, PagePlacement['face'], PagePlacement['position']][] = [
        [sheet.front.left, 'front', 'left'],
        [sheet.front.right, 'front', 'right'],
        [sheet.back.left, 'back', 'left'],
        [sheet.back.right, 'back', 'right'],
      ];
      for (const [pageNumber, face, position] of slots) {
        placements[pageNumber - 1] = { pageNumber, sheetIndex: sheet.index, face, position, signature: signatureIndex };
      }
    });
    signatures.push({
      index: signatureIndex,
      role: plan.role,
      sheets: nested.length,
      pages: nested.length * 4,
      pageNumbers: [...plan.pages].sort((a, b) => a - b),
      firstSheetIndex,
    });
  });

  const spreads: Spread[] = [];
  for (let index = 0; index <= pageCount / 2; index += 1) {
    spreads.push({ index, left: index === 0 ? null : 2 * index, right: index === pageCount / 2 ? null : 2 * index + 1 });
  }

  return { pageCount, binding, readingDirection, sheets, signatures, placements, spreads };
}

const range = (first: number, last: number): number[] => Array.from({ length: last - first + 1 }, (_, index) => first + index);

export function sampleSaddleStitch(pageCount: number, readingDirection: ReadingDirection = 'ltr'): ImpositionResult {
  return build(pageCount, 'saddle-stitch', [{ role: 'interior', outerRole: 'cover', pages: range(1, pageCount) }], readingDirection);
}

export function samplePerfectBound(pageCount: number, signaturePages: number, separateCover = true, readingDirection: ReadingDirection = 'ltr'): ImpositionResult {
  const plans: SignaturePlan[] = [];
  let first = 1;
  let last = pageCount;
  if (separateCover) {
    plans.push({ role: 'cover', outerRole: 'cover', pages: [1, 2, pageCount - 1, pageCount] });
    first = 3;
    last = pageCount - 2;
  }
  for (let start = first; start <= last; start += signaturePages) {
    const end = Math.min(start + signaturePages - 1, last);
    plans.push({ role: 'interior', outerRole: 'interior', pages: range(start, end) });
  }
  return build(pageCount, 'perfect-bound', plans, readingDirection);
}
