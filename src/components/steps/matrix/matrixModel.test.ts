import { describe, expect, test } from 'bun:test';

import { DEFAULT_CONFIG } from '@/lib/imposition';
import { computeDerived } from '@/lib/store/derived';
import type { MagazineConfig, Page, SourceUnit } from '@/lib/types';

import { buildSignatureBlocks, firstFlaggedPage, nextFlaggedSheet, readingPartner, sheetRangeText, type SheetRowModel } from './matrixModel';

function fixture(count: number, patch: Partial<MagazineConfig> = {}) {
  const config: MagazineConfig = { ...DEFAULT_CONFIG, ...patch };
  const units: SourceUnit[] = Array.from({ length: count }, (_, index) => ({
    id: `u${index}`,
    assetId: 'a',
    indexInAsset: index,
    order: index,
    label: `p. ${index + 1}`,
    width: 595,
    height: 842,
    widthMm: 210,
    heightMm: 297,
    filenameNumber: null,
    folios: [],
  }));
  const pages: Page[] = units.map((unit) => ({ id: `p-${unit.id}`, origin: 'file', unitId: unit.id, half: 'full', detectedFolio: null }));
  return { config, derived: computeDerived(config, units, pages) };
}

describe('matriz de pliegos', () => {
  test('16 págs. a caballo: [16|1] [2|15] en el pliego exterior', () => {
    const { config, derived } = fixture(16, { binding: 'saddle-stitch', readingDirection: 'ltr' });
    const blocks = buildSignatureBlocks(derived, config);
    expect(blocks).toHaveLength(1);
    const first = blocks[0]?.rows[0];
    expect(first?.slots.map((slot) => slot.page)).toEqual([16, 1, 2, 15]);
    expect(first?.slots.map((slot) => slot.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(blocks[0]?.rows.map((row) => row.sheet.number)).toEqual([1, 2, 3, 4]);
    expect(blocks[0]?.title).toBe('Cuadernillo único');
  });

  test('RTL invierte las casillas como dicta la imposición', () => {
    const { config, derived } = fixture(8, { binding: 'saddle-stitch', readingDirection: 'rtl' });
    const row = buildSignatureBlocks(derived, config)[0]?.rows[0];
    expect(row?.slots.map((slot) => slot.page)).toEqual([1, 8, 7, 2]);
  });

  test('14 págs. sin cortesías automáticas: los huecos quedan abiertos', () => {
    const { config, derived } = fixture(14, { binding: 'saddle-stitch', autoPadBlanks: false });
    const slots = buildSignatureBlocks(derived, config).flatMap((block) => block.rows.flatMap((row) => row.slots));
    const open = slots.filter((slot) => slot.open);
    expect(open).toHaveLength(2);
    expect(open.every((slot) => slot.worst === 'error')).toBe(true);
  });

  test('lomo cuadrado con cubierta aparte: bloque «Cubierta» y cuadernillos numerados', () => {
    const { config, derived } = fixture(48, { binding: 'perfect-bound', separateCover: true, signaturePages: 16 });
    const blocks = buildSignatureBlocks(derived, config);
    expect(blocks[0]?.title).toBe('Cubierta');
    expect(blocks[0]?.rows[0]?.slots.map((slot) => slot.page)).toEqual([48, 1, 2, 47]);
    expect(blocks.slice(1).map((block) => block.title)).toEqual(['Cuadernillo 1', 'Cuadernillo 2', 'Cuadernillo 3']);
    expect(blocks[1]?.stock.name).toBe('Celeste');
  });

  test('compañera de pliego de lectura', () => {
    expect(readingPartner(1, 16)).toBeNull();
    expect(readingPartner(16, 16)).toBeNull();
    expect(readingPartner(2, 16)).toBe(3);
    expect(readingPartner(3, 16)).toBe(2);
  });

  test('siguiente pliego con incidencias, con vuelta al principio', () => {
    expect(nextFlaggedSheet([2, 5], null)).toBe(2);
    expect(nextFlaggedSheet([2, 5], 2)).toBe(5);
    expect(nextFlaggedSheet([2, 5], 5)).toBe(2);
    expect(nextFlaggedSheet([], 1)).toBeNull();
    expect(sheetRangeText(3, 3)).toBe('pliego 3');
    const slots = [
      { page: 8, worst: undefined },
      { page: 1, worst: 'warning' },
      { page: 2, worst: undefined },
      { page: 7, worst: undefined },
    ] as unknown as SheetRowModel['slots'];
    expect(firstFlaggedPage({ slots })).toBe(1);
  });
});
