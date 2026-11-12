import { describe, expect, test } from 'bun:test';

import type { ImpositionResult, Page } from '@/lib/types';

import { computeImposition } from './imposition';
import { canMoveSheet, movableSheetRange, reorderSheets, sheetContentKey, sheetOrderAfterMove, slotPageNumbers } from './sheetOrder';

function pages(count: number): Page[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${String(index + 1)}`,
    origin: 'file' as const,
    unitId: `u${String(index + 1)}`,
    half: 'full' as const,
    detectedFolio: null,
  }));
}

function ids(list: readonly Page[]): string[] {
  return list.map((page) => page.id);
}

function contentOf(list: readonly Page[], imposition: ImpositionResult, sheetIndex: number): string[] {
  const sheet = imposition.sheets[sheetIndex];
  if (!sheet) throw new Error('sin pliego');
  return slotPageNumbers(sheet).map((n) => list[n - 1]?.id ?? '?');
}

const saddle = (n: number, readingDirection: 'ltr' | 'rtl' = 'ltr'): ImpositionResult =>
  computeImposition(n, { binding: 'saddle-stitch', signaturePages: 16, separateCover: false, readingDirection });

const perfect = (n: number, signaturePages: number, separateCover: boolean): ImpositionResult =>
  computeImposition(n, { binding: 'perfect-bound', signaturePages, separateCover, readingDirection: 'ltr' });

describe('sheetOrderAfterMove', () => {
  test('saca el pliego y lo inserta en el destino', () => {
    expect(sheetOrderAfterMove(4, 0, 2)).toEqual([1, 2, 0, 3]);
    expect(sheetOrderAfterMove(4, 3, 1)).toEqual([0, 3, 1, 2]);
    expect(sheetOrderAfterMove(3, 1, 1)).toEqual([0, 1, 2]);
  });
});

describe('reorderSheets', () => {
  test('el pliego movido conserva sus cuatro páginas en las mismas casillas', () => {
    const imposition = saddle(16);
    const list = pages(16);
    const before = contentOf(list, imposition, 0);
    const moved = reorderSheets(list, imposition, 0, 2);
    expect(moved).not.toBeNull();
    expect(contentOf(moved ?? [], imposition, 2)).toEqual(before);
    expect(contentOf(moved ?? [], imposition, 0)).toEqual(contentOf(list, imposition, 1));
    expect(contentOf(moved ?? [], imposition, 1)).toEqual(contentOf(list, imposition, 2));
    expect(contentOf(moved ?? [], imposition, 3)).toEqual(contentOf(list, imposition, 3));
  });

  test('renumera en lectura: en 8 páginas a caballo, invertir los pliegos intercambia 1-2/7-8 con 3-4/5-6', () => {
    const moved = reorderSheets(pages(8), saddle(8), 1, 0);
    expect(ids(moved ?? [])).toEqual(['p3', 'p4', 'p1', 'p2', 'p7', 'p8', 'p5', 'p6']);
  });

  test('es una permutación: no pierde ni duplica páginas', () => {
    const imposition = perfect(48, 16, true);
    const list = pages(48);
    for (let from = 1; from < imposition.sheets.length; from += 1) {
      for (let to = 1; to < imposition.sheets.length; to += 1) {
        if (from === to) continue;
        const moved = reorderSheets(list, imposition, from, to) ?? [];
        expect(new Set(ids(moved)).size).toBe(48);
        expect(reorderSheets(moved, imposition, to, from)).toEqual(list);
      }
    }
  });

  test('funciona igual de derecha a izquierda', () => {
    const imposition = saddle(12, 'rtl');
    const list = pages(12);
    const moved = reorderSheets(list, imposition, 2, 0) ?? [];
    expect(contentOf(moved, imposition, 0)).toEqual(contentOf(list, imposition, 2));
    expect(reorderSheets(moved, imposition, 0, 2)).toEqual(list);
  });

  test('cruza cuadernillos en rústica sin tocar la cubierta suelta', () => {
    const imposition = perfect(36, 16, true);
    const list = pages(36);
    const cover = contentOf(list, imposition, 0);
    const moved = reorderSheets(list, imposition, 1, imposition.sheets.length - 1) ?? [];
    expect(contentOf(moved, imposition, 0)).toEqual(cover);
    expect(contentOf(moved, imposition, imposition.sheets.length - 1)).toEqual(contentOf(list, imposition, 1));
  });

  test('rechaza movimientos imposibles', () => {
    const imposition = perfect(20, 16, true);
    const list = pages(20);
    expect(reorderSheets(list, imposition, 0, 2)).toBeNull();
    expect(reorderSheets(list, imposition, 2, 0)).toBeNull();
    expect(reorderSheets(list, imposition, 1, 1)).toBeNull();
    expect(reorderSheets(list, imposition, 1, 9)).toBeNull();
    expect(reorderSheets(pages(19), imposition, 1, 2)).toBeNull();
  });
});

describe('movableSheetRange y canMoveSheet', () => {
  test('a caballo se mueve cualquier pliego, también el exterior', () => {
    expect(movableSheetRange(saddle(16))).toEqual({ first: 0, last: 3 });
    expect(canMoveSheet(saddle(16), 0, 3)).toBe(true);
  });

  test('con un solo pliego no hay nada que mover', () => {
    expect(movableSheetRange(saddle(4))).toBeNull();
    expect(movableSheetRange(perfect(8, 16, true))).toBeNull();
  });

  test('la cubierta suelta de rústica queda fija', () => {
    expect(movableSheetRange(perfect(20, 16, true))).toEqual({ first: 1, last: 4 });
    expect(movableSheetRange(perfect(20, 16, false))).toEqual({ first: 0, last: 4 });
  });
});

describe('sheetContentKey', () => {
  test('sigue al contenido del pliego tras moverlo', () => {
    const imposition = saddle(16);
    const list = pages(16);
    const key = sheetContentKey(list, imposition.sheets[0]!);
    const moved = reorderSheets(list, imposition, 0, 3) ?? [];
    expect(sheetContentKey(moved, imposition.sheets[3]!)).toBe(key);
  });
});
