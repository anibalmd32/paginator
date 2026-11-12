import { describe, expect, test } from 'bun:test';

import type { BindingType, ImpositionResult, ReadingDirection } from '@/lib/types';

import {
  blanksNeeded,
  computeImposition,
  computeSpreads,
  expectedSide,
  paddedPageCount,
  printerSideSequence,
  spreadIndexOfPage,
} from './imposition';
import type { ImpositionOptions } from './imposition';
import { sheetNotation } from './testkit';

function options(overrides: Partial<ImpositionOptions> = {}): ImpositionOptions {
  return { binding: 'saddle-stitch', signaturePages: 16, separateCover: true, readingDirection: 'ltr', ...overrides };
}

const saddle = (n: number, direction: ReadingDirection = 'ltr'): ImpositionResult =>
  computeImposition(n, options({ readingDirection: direction }));

const perfect = (n: number, signaturePages: number, separateCover: boolean, direction: ReadingDirection = 'ltr'): ImpositionResult =>
  computeImposition(n, options({ binding: 'perfect-bound', signaturePages, separateCover, readingDirection: direction }));

describe('paddedPageCount y blanksNeeded', () => {
  test('redondea al siguiente múltiplo de 4 con mínimo 4', () => {
    const table: [number, number][] = [
      [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 8], [6, 8], [7, 8], [8, 8], [9, 12], [15, 16], [16, 16], [17, 20], [63, 64], [65, 68],
    ];
    for (const [n, expected] of table) expect(paddedPageCount(n)).toBe(expected);
  });

  test('tolera entradas raras', () => {
    expect(paddedPageCount(-3)).toBe(4);
    expect(paddedPageCount(Number.NaN)).toBe(4);
    expect(paddedPageCount(4.2)).toBe(8);
  });

  test('blancas necesarias', () => {
    const table: [number, number][] = [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0], [5, 3], [6, 2], [7, 1], [8, 0], [30, 2], [32, 0]];
    for (const [n, expected] of table) expect(blanksNeeded(n)).toBe(expected);
  });
});

describe('grapada a caballo: tablas a mano', () => {
  test('N = 4', () => {
    expect(sheetNotation(saddle(4).sheets)).toBe('4|1 2|3');
  });

  test('N = 8 (ejemplo de la especificación)', () => {
    expect(sheetNotation(saddle(8).sheets)).toBe('8|1 2|7 / 6|3 4|5');
  });

  test('N = 12', () => {
    expect(sheetNotation(saddle(12).sheets)).toBe('12|1 2|11 / 10|3 4|9 / 8|5 6|7');
  });

  test('N = 16', () => {
    expect(sheetNotation(saddle(16).sheets)).toBe('16|1 2|15 / 14|3 4|13 / 12|5 6|11 / 10|7 8|9');
  });

  test('N = 32', () => {
    expect(sheetNotation(saddle(32).sheets)).toBe(
      '32|1 2|31 / 30|3 4|29 / 28|5 6|27 / 26|7 8|25 / 24|9 10|23 / 22|11 12|21 / 20|13 14|19 / 18|15 16|17',
    );
  });

  test('RTL es el espejo: N = 8 y N = 12', () => {
    expect(sheetNotation(saddle(8, 'rtl').sheets)).toBe('1|8 7|2 / 3|6 5|4');
    expect(sheetNotation(saddle(12, 'rtl').sheets)).toBe('1|12 11|2 / 3|10 9|4 / 5|8 7|6');
  });

  test('un solo cuadernillo; el pliego exterior es la cubierta', () => {
    const result = saddle(16);
    expect(result.signatures).toHaveLength(1);
    expect(result.signatures[0]).toEqual({
      index: 0,
      role: 'interior',
      sheets: 4,
      pages: 16,
      pageNumbers: Array.from({ length: 16 }, (_, i) => i + 1),
      firstSheetIndex: 0,
    });
    expect(result.sheets.map((sheet) => sheet.role)).toEqual(['cover', 'interior', 'interior', 'interior']);
    expect(result.sheets.map((sheet) => sheet.signature)).toEqual([0, 0, 0, 0]);
    expect(result.sheets.map((sheet) => sheet.indexInSignature)).toEqual([0, 1, 2, 3]);
    expect(result.sheets.map((sheet) => sheet.number)).toEqual([1, 2, 3, 4]);
  });

  test('signaturePages y separateCover no afectan a la grapada', () => {
    const base = saddle(24);
    const other = computeImposition(24, options({ signaturePages: 8, separateCover: false }));
    expect(other.sheets).toEqual(base.sheets);
  });
});

describe('lomo cuadrado: tablas a mano', () => {
  test('N = 4 con cubierta aparte: solo la cubierta, sin tripa', () => {
    const result = perfect(4, 16, true);
    expect(sheetNotation(result.sheets)).toBe('4|1 2|3');
    expect(result.sheets[0]?.role).toBe('cover');
    expect(result.signatures).toHaveLength(1);
    expect(result.signatures[0]?.role).toBe('cover');
    expect(result.signatures[0]?.pageNumbers).toEqual([1, 2, 3, 4]);
  });

  test('N = 4 sin cubierta aparte: un cuadernillo de tripa', () => {
    const result = perfect(4, 16, false);
    expect(sheetNotation(result.sheets)).toBe('4|1 2|3');
    expect(result.sheets[0]?.role).toBe('interior');
    expect(result.signatures.map((signature) => signature.role)).toEqual(['interior']);
  });

  test('N = 8, cubierta aparte, cuadernillos de 16: cubierta + resto de 4', () => {
    expect(sheetNotation(perfect(8, 16, true).sheets)).toBe('8|1 2|7 / 6|3 4|5');
    expect(perfect(8, 16, true).sheets.map((sheet) => sheet.signature)).toEqual([0, 1]);
  });

  test('N = 12, cubierta aparte, cuadernillos de 4', () => {
    const result = perfect(12, 4, true);
    expect(sheetNotation(result.sheets)).toBe('12|1 2|11 / 6|3 4|5 / 10|7 8|9');
    expect(result.signatures.map((signature) => signature.pageNumbers)).toEqual([
      [1, 2, 11, 12],
      [3, 4, 5, 6],
      [7, 8, 9, 10],
    ]);
  });

  test('N = 12, sin cubierta, cuadernillos de 8: 8 + resto de 4', () => {
    const result = perfect(12, 8, false);
    expect(sheetNotation(result.sheets)).toBe('8|1 2|7 / 6|3 4|5 / 12|9 10|11');
    expect(result.signatures.map((signature) => signature.pages)).toEqual([8, 4]);
  });

  test('N = 16, cubierta aparte, cuadernillos de 8: cubierta + 8 + resto de 4', () => {
    const result = perfect(16, 8, true);
    expect(sheetNotation(result.sheets)).toBe('16|1 2|15 / 10|3 4|9 / 8|5 6|7 / 14|11 12|13');
    expect(result.signatures.map((signature) => [signature.role, signature.sheets, signature.firstSheetIndex])).toEqual([
      ['cover', 1, 0],
      ['interior', 2, 1],
      ['interior', 1, 3],
    ]);
    expect(result.sheets.map((sheet) => [sheet.signature, sheet.indexInSignature, sheet.sheetsInSignature])).toEqual([
      [0, 0, 1],
      [1, 0, 2],
      [1, 1, 2],
      [2, 0, 1],
    ]);
  });

  test('N = 16, sin cubierta, cuadernillos de 4: cuatro pliegos sueltos', () => {
    expect(sheetNotation(perfect(16, 4, false).sheets)).toBe('4|1 2|3 / 8|5 6|7 / 12|9 10|11 / 16|13 14|15');
  });

  test('N = 16, sin cubierta, cuadernillos de 16: igual que la grapada', () => {
    expect(sheetNotation(perfect(16, 16, false).sheets)).toBe(sheetNotation(saddle(16).sheets));
  });

  test('N = 32, cubierta aparte, cuadernillos de 16: cubierta + 16 + resto de 12', () => {
    const result = perfect(32, 16, true);
    expect(sheetNotation(result.sheets)).toBe(
      '32|1 2|31 / 18|3 4|17 / 16|5 6|15 / 14|7 8|13 / 12|9 10|11 / 30|19 20|29 / 28|21 22|27 / 26|23 24|25',
    );
    expect(result.signatures.map((signature) => signature.pages)).toEqual([4, 16, 12]);
    expect(result.sheets.map((sheet) => sheet.role)).toEqual([
      'cover', 'interior', 'interior', 'interior', 'interior', 'interior', 'interior', 'interior',
    ]);
  });

  test('N = 32, sin cubierta, cuadernillos de 16: dos cuadernillos completos', () => {
    expect(sheetNotation(perfect(32, 16, false).sheets)).toBe(
      '16|1 2|15 / 14|3 4|13 / 12|5 6|11 / 10|7 8|9 / 32|17 18|31 / 30|19 20|29 / 28|21 22|27 / 26|23 24|25',
    );
  });

  test('N = 32, sin cubierta, cuadernillos de 8', () => {
    expect(sheetNotation(perfect(32, 8, false).sheets)).toBe(
      '8|1 2|7 / 6|3 4|5 / 16|9 10|15 / 14|11 12|13 / 24|17 18|23 / 22|19 20|21 / 32|25 26|31 / 30|27 28|29',
    );
  });

  test('RTL: N = 16 con cubierta y cuadernillos de 8', () => {
    expect(sheetNotation(perfect(16, 8, true, 'rtl').sheets)).toBe('1|16 15|2 / 3|10 9|4 / 5|8 7|6 / 11|14 13|12');
  });

  test('un tamaño de cuadernillo ilegible no lanza', () => {
    expect(sheetNotation(perfect(8, 6, false).sheets)).toBe('4|1 2|3 / 8|5 6|7');
    expect(perfect(8, Number.NaN, false).sheets).toHaveLength(2);
    expect(perfect(8, 0, false).sheets).toHaveLength(2);
  });
});

describe('computeImposition: entradas no válidas', () => {
  test('lanza RangeError si no es múltiplo de 4 ≥ 4', () => {
    for (const n of [0, 1, 2, 3, 5, 6, 7, 10, -4, 4.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computeImposition(n, options())).toThrow(RangeError);
    }
  });
});

describe('pliegos de lectura', () => {
  test('N = 8 LTR', () => {
    expect(computeSpreads(8, 'ltr')).toEqual([
      { index: 0, left: null, right: 1 },
      { index: 1, left: 2, right: 3 },
      { index: 2, left: 4, right: 5 },
      { index: 3, left: 6, right: 7 },
      { index: 4, left: 8, right: null },
    ]);
  });

  test('N = 4 RTL: espejo', () => {
    expect(computeSpreads(4, 'rtl')).toEqual([
      { index: 0, left: 1, right: null },
      { index: 1, left: 3, right: 2 },
      { index: 2, left: null, right: 4 },
    ]);
  });

  test('totales que no cierran pliego no lanzan', () => {
    expect(computeSpreads(0, 'ltr')).toEqual([]);
    expect(computeSpreads(3, 'ltr')).toEqual([
      { index: 0, left: null, right: 1 },
      { index: 1, left: 2, right: 3 },
    ]);
  });

  test('spreadIndexOfPage y expectedSide', () => {
    expect([1, 2, 3, 4, 5, 8].map(spreadIndexOfPage)).toEqual([0, 1, 1, 2, 2, 4]);
    expect(expectedSide(1, 'ltr')).toBe('right');
    expect(expectedSide(2, 'ltr')).toBe('left');
    expect(expectedSide(1, 'rtl')).toBe('left');
    expect(expectedSide(2, 'rtl')).toBe('right');
  });
});

describe('printerSideSequence', () => {
  test('N = 8 grapada: pliego 1 cara, pliego 1 retiro, pliego 2 cara, pliego 2 retiro', () => {
    expect(printerSideSequence(saddle(8))).toEqual([
      { sheetIndex: 0, face: 'front', left: 8, right: 1 },
      { sheetIndex: 0, face: 'back', left: 2, right: 7 },
      { sheetIndex: 1, face: 'front', left: 6, right: 3 },
      { sheetIndex: 1, face: 'back', left: 4, right: 5 },
    ]);
  });
});

interface Case {
  n: number;
  binding: BindingType;
  signaturePages: number;
  separateCover: boolean;
}

function allCases(): Case[] {
  const cases: Case[] = [];
  for (let n = 4; n <= 128; n += 4) {
    cases.push({ n, binding: 'saddle-stitch', signaturePages: 16, separateCover: true });
    for (const signaturePages of [4, 8, 12, 16, 24, 32]) {
      for (const separateCover of [true, false]) cases.push({ n, binding: 'perfect-bound', signaturePages, separateCover });
    }
  }
  return cases;
}

const impose = (c: Case, readingDirection: ReadingDirection): ImpositionResult =>
  computeImposition(c.n, { binding: c.binding, signaturePages: c.signaturePages, separateCover: c.separateCover, readingDirection });

function readThrough(result: ImpositionResult): number[] {
  const ltr = result.readingDirection === 'ltr';
  const gather = (sheetIndexes: number[]): number[] => {
    const firstHalves: number[] = [];
    const secondHalves: number[] = [];
    for (const index of sheetIndexes) {
      const sheet = result.sheets[index];
      if (!sheet) throw new Error('pliego inexistente');
      firstHalves.push(...(ltr ? [sheet.front.right, sheet.back.left] : [sheet.front.left, sheet.back.right]));
      secondHalves.unshift(...(ltr ? [sheet.back.right, sheet.front.left] : [sheet.back.left, sheet.front.right]));
    }
    return [...firstHalves, ...secondHalves];
  };

  const blocks = result.signatures.map((signature) =>
    gather(Array.from({ length: signature.sheets }, (_, j) => signature.firstSheetIndex + j)),
  );
  const first = result.signatures[0];
  if (first && first.role === 'cover' && blocks.length > 0) {
    const [cover, ...interior] = blocks;
    if (!cover) throw new Error('sin cubierta');
    return [...cover.slice(0, 2), ...interior.flat(), ...cover.slice(2)];
  }
  return blocks.flat();
}

describe('invariantes (N = 4…128, ambas encuadernaciones, cuadernillos 4…32, LTR y RTL)', () => {
  const cases = allCases();

  test('cada página 1…N aparece exactamente una vez y placements la ubica', () => {
    for (const c of cases) {
      for (const direction of ['ltr', 'rtl'] as const) {
        const result = impose(c, direction);
        expect(result.pageCount).toBe(c.n);
        expect(result.sheets).toHaveLength(c.n / 4);
        const seen = result.sheets.flatMap((sheet) => [sheet.front.left, sheet.front.right, sheet.back.left, sheet.back.right]);
        expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: c.n }, (_, i) => i + 1));

        expect(result.placements).toHaveLength(c.n);
        result.placements.forEach((placement, i) => {
          expect(placement.pageNumber).toBe(i + 1);
          const sheet = result.sheets[placement.sheetIndex];
          expect(sheet?.[placement.face][placement.position]).toBe(i + 1);
          expect(sheet?.signature).toBe(placement.signature);
        });
      }
    }
  });

  test('índices, numeración y cuadernillos coherentes', () => {
    for (const c of cases) {
      const result = impose(c, 'ltr');
      result.sheets.forEach((sheet, i) => {
        expect(sheet.index).toBe(i);
        expect(sheet.number).toBe(i + 1);
      });
      let nextSheet = 0;
      result.signatures.forEach((signature, i) => {
        expect(signature.index).toBe(i);
        expect(signature.firstSheetIndex).toBe(nextSheet);
        expect(signature.pages).toBe(signature.sheets * 4);
        expect(signature.pageNumbers).toHaveLength(signature.pages);
        nextSheet += signature.sheets;
        for (let j = 0; j < signature.sheets; j += 1) {
          const sheet = result.sheets[signature.firstSheetIndex + j];
          expect(sheet?.signature).toBe(i);
          expect(sheet?.indexInSignature).toBe(j);
          expect(sheet?.sheetsInSignature).toBe(signature.sheets);
        }
      });
      expect(nextSheet).toBe(c.n / 4);

      if (c.binding === 'perfect-bound') {
        const interior = result.signatures.filter((signature) => signature.role === 'interior');
        interior.slice(0, -1).forEach((signature) => expect(signature.pages).toBe(c.signaturePages));
        const last = interior[interior.length - 1];
        if (last) {
          expect(last.pages).toBeLessThanOrEqual(c.signaturePages);
          expect(last.pages % 4).toBe(0);
        }
        for (const signature of interior) {
          const [firstPage] = signature.pageNumbers;
          expect(signature.pageNumbers).toEqual(Array.from({ length: signature.pages }, (_, k) => (firstPage ?? 0) + k));
        }
        expect(result.signatures.filter((signature) => signature.role === 'cover')).toHaveLength(c.separateCover ? 1 : 0);
      }
    }
  });

  test('anverso y reverso de la misma hoja: front.right/back.left y back.right/front.left son consecutivos', () => {
    for (const c of cases) {
      for (const sheet of impose(c, 'ltr').sheets) {
        expect(sheet.front.right % 2).toBe(1);
        expect(sheet.back.left).toBe(sheet.front.right + 1);
        expect(sheet.back.right % 2).toBe(1);
        expect(sheet.front.left).toBe(sheet.back.right + 1);
      }
      for (const sheet of impose(c, 'rtl').sheets) {
        expect(sheet.front.left % 2).toBe(1);
        expect(sheet.back.right).toBe(sheet.front.left + 1);
        expect(sheet.back.left % 2).toBe(1);
        expect(sheet.front.right).toBe(sheet.back.left + 1);
      }
    }
  });

  test('grapada: las dos páginas de cada cara suman N + 1', () => {
    for (let n = 4; n <= 128; n += 4) {
      for (const direction of ['ltr', 'rtl'] as const) {
        for (const sheet of saddle(n, direction).sheets) {
          expect(sheet.front.left + sheet.front.right).toBe(n + 1);
          expect(sheet.back.left + sheet.back.right).toBe(n + 1);
        }
      }
    }
  });

  test('lomo cuadrado: las dos páginas de cada cara suman primera + última del cuadernillo', () => {
    for (const c of cases) {
      if (c.binding !== 'perfect-bound') continue;
      const result = impose(c, 'ltr');
      for (const signature of result.signatures) {
        const sum = (signature.pageNumbers[0] ?? 0) + (signature.pageNumbers[signature.pageNumbers.length - 1] ?? 0);
        for (let j = 0; j < signature.sheets; j += 1) {
          const sheet = result.sheets[signature.firstSheetIndex + j];
          expect((sheet?.front.left ?? 0) + (sheet?.front.right ?? 0)).toBe(sum);
          expect((sheet?.back.left ?? 0) + (sheet?.back.right ?? 0)).toBe(sum);
        }
      }
    }
  });

  test('RTL es el espejo exacto de LTR', () => {
    for (const c of cases) {
      const ltr = impose(c, 'ltr');
      const rtl = impose(c, 'rtl');
      expect(rtl.sheets).toEqual(
        ltr.sheets.map((sheet) => ({
          ...sheet,
          front: { left: sheet.front.right, right: sheet.front.left },
          back: { left: sheet.back.right, right: sheet.back.left },
        })),
      );
      expect(rtl.signatures).toEqual(ltr.signatures);
      expect(rtl.spreads).toEqual(ltr.spreads.map((spread) => ({ index: spread.index, left: spread.right, right: spread.left })));
      rtl.placements.forEach((placement, i) => {
        const mirror = ltr.placements[i];
        expect(placement.sheetIndex).toBe(mirror?.sheetIndex ?? -1);
        expect(placement.face).toBe(mirror?.face ?? 'front');
        expect(placement.position).toBe(mirror?.position === 'left' ? 'right' : 'left');
      });
    }
  });

  test('al montar el ejemplar con los pliegos, las páginas se leen 1…N en orden', () => {
    for (const c of cases) {
      for (const direction of ['ltr', 'rtl'] as const) {
        expect(readThrough(impose(c, direction))).toEqual(Array.from({ length: c.n }, (_, i) => i + 1));
      }
    }
  });

  test('pliegos de lectura: impares a la derecha en LTR (izquierda en RTL) y expectedSide lo refleja', () => {
    for (let n = 4; n <= 128; n += 4) {
      for (const direction of ['ltr', 'rtl'] as const) {
        const spreads = computeSpreads(n, direction);
        expect(spreads).toHaveLength(n / 2 + 1);
        const seen: number[] = [];
        spreads.forEach((spread, s) => {
          expect(spread.index).toBe(s);
          for (const side of ['left', 'right'] as const) {
            const page = spread[side];
            if (page === null) continue;
            seen.push(page);
            expect(expectedSide(page, direction)).toBe(side);
            expect(spreadIndexOfPage(page)).toBe(s);
            expect(page % 2 === 1).toBe(direction === 'ltr' ? side === 'right' : side === 'left');
          }
        });
        expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        expect(spreads[0]?.[direction === 'ltr' ? 'left' : 'right']).toBeNull();
        expect(spreads[n / 2]?.[direction === 'ltr' ? 'right' : 'left']).toBeNull();
        expect(computeImposition(n, options({ readingDirection: direction })).spreads).toEqual(spreads);
      }
    }
  });

  test('en un pliego de lectura interior, las dos páginas enfrentadas están en caras distintas o en el centro del cuadernillo', () => {
    for (const c of cases) {
      const result = impose(c, 'ltr');
      for (const spread of result.spreads) {
        if (spread.left === null || spread.right === null) continue;
        const a = result.placements[spread.left - 1];
        const b = result.placements[spread.right - 1];
        if (!a || !b) throw new Error('sin ubicación');
        expect(a.position).toBe('left');
        expect(b.position).toBe('right');
        if (a.sheetIndex === b.sheetIndex) {
          const sheet = result.sheets[a.sheetIndex];
          expect(a.face).toBe('back');
          expect(b.face).toBe('back');
          expect(sheet?.indexInSignature).toBe((sheet?.sheetsInSignature ?? 0) - 1);
        }
      }
    }
  });

  test('printerSideSequence y su inversa reconstruyen 1…N', () => {
    for (const c of cases) {
      for (const direction of ['ltr', 'rtl'] as const) {
        const result = impose(c, direction);
        const sides = printerSideSequence(result);
        expect(sides).toHaveLength(c.n / 2);
        const rebuilt = new Array<string | undefined>(c.n).fill(undefined);
        sides.forEach((side, k) => {
          expect(side.sheetIndex).toBe(Math.floor(k / 2));
          expect(side.face).toBe(k % 2 === 0 ? 'front' : 'back');
          rebuilt[side.left - 1] = `${String(k)}:left`;
          rebuilt[side.right - 1] = `${String(k)}:right`;
        });
        expect(rebuilt.every((slot) => slot !== undefined)).toBe(true);
        expect(new Set(rebuilt).size).toBe(c.n);
        result.placements.forEach((placement, i) => {
          const k = placement.sheetIndex * 2 + (placement.face === 'back' ? 1 : 0);
          expect(rebuilt[i]).toBe(`${String(k)}:${placement.position}`);
        });
      }
    }
  });
});
