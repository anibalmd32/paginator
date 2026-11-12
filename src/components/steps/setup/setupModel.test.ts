import { describe, expect, test } from 'bun:test';

import { buildPages, computeImposition, DEFAULT_CONFIG, INTERIOR_PAPERS, paddedPageCount } from '@/lib/imposition';
import { a4Spread, makeConfig, pdfUnit } from '@/lib/imposition/testkit';
import type { MagazineConfig, Page } from '@/lib/types';

import {
  capacityOf,
  courtesyNote,
  expectedInput,
  formatNumber,
  formatSpine,
  isDefaultConfig,
  joinNumbers,
  listPages,
  pageBoxes,
  paperPresetId,
  sheetAriaLabel,
  slotKindOf,
  trimFromSelect,
  trimSelectValue,
} from './setupModel';

describe('números de taller', () => {
  test('coma decimal sin ceros de relleno', () => {
    expect(formatNumber(3)).toBe('3');
    expect(formatNumber(0.9)).toBe('0,9');
    expect(formatNumber(2.25, 2)).toBe('2,25');
  });

  test('el lomo lleva siempre un decimal', () => {
    expect(formatSpine(0.98)).toBe('1,0');
    expect(formatSpine(3.24)).toBe('3,2');
  });

  test('listas de páginas', () => {
    expect(joinNumbers([17])).toBe('17');
    expect(joinNumbers([17, 18])).toBe('17 y 18');
    expect(joinNumbers([17, 18, 19])).toBe('17, 18 y 19');
  });
});

describe('formato de corte', () => {
  test('el desplegable refleja automático, catálogo y a medida', () => {
    expect(trimSelectValue({ mode: 'auto' })).toBe('auto');
    expect(trimSelectValue({ mode: 'fixed', presetId: 'a5', widthMm: 148, heightMm: 210 })).toBe('a5');
    expect(trimSelectValue({ mode: 'fixed', presetId: null, widthMm: 170, heightMm: 240 })).toBe('custom');
  });

  test('«Personalizado» parte del formato vigente', () => {
    expect(trimFromSelect('custom', { widthMm: 205, heightMm: 275 })).toEqual({ mode: 'fixed', presetId: null, widthMm: 205, heightMm: 275 });
    expect(trimFromSelect('a4', { widthMm: 1, heightMm: 1 })).toEqual({ mode: 'fixed', presetId: 'a4', widthMm: 210, heightMm: 297 });
    expect(trimFromSelect('auto', { widthMm: 1, heightMm: 1 })).toEqual({ mode: 'auto' });
  });
});

describe('papel', () => {
  test('reconoce el papel de catálogo por gramaje y calibre', () => {
    expect(paperPresetId(INTERIOR_PAPERS, 115, 0.09)).toBe('coated-115');
    expect(paperPresetId(INTERIOR_PAPERS, 90, 0.11)).toBe('offset-90');
    expect(paperPresetId(INTERIOR_PAPERS, 100, 0.1)).toBeNull();
  });
});

describe('cierre de pliego', () => {
  test('18 declaradas sin archivos: faltan 2', () => {
    expect(capacityOf({ hasPages: false, supplied: 0, declared: 18, preview: 16 })).toEqual({ wanted: 18, padded: 20, missing: 2 });
  });

  test('sin total declarado ni archivos: la previsión cierra', () => {
    expect(capacityOf({ hasPages: false, supplied: 0, declared: null, preview: 16 }).missing).toBe(0);
  });

  test('con archivos manda lo aportado, salvo un declarado mayor', () => {
    expect(capacityOf({ hasPages: true, supplied: 22, declared: null, preview: 16 })).toEqual({ wanted: 22, padded: 24, missing: 2 });
    expect(capacityOf({ hasPages: true, supplied: 22, declared: 30, preview: 16 })).toEqual({ wanted: 30, padded: 32, missing: 2 });
  });
});

describe('aviso de cierre de pliego', () => {
  test('18 declaradas sin archivos: dos cortesías, con su sitio', () => {
    const capacity = capacityOf({ hasPages: false, supplied: 0, declared: 18, preview: 16 });
    expect(courtesyNote({ capacity, autoPadBlanks: true, blankNumbers: [18, 19] })).toBe('Se completa con 2 páginas de cortesía (págs. 18 y 19) hasta 20.');
    expect(courtesyNote({ capacity, autoPadBlanks: false, blankNumbers: [18, 19] })).toBe(
      'Cada pliego lleva 4 páginas. Sin cortesías el último queda abierto: añade 2 páginas a tus archivos o complétalo aquí.',
    );
  });

  test('24 aportadas y 26 declaradas: cuenta las cuatro cortesías que enseña la maqueta', () => {
    const capacity = capacityOf({ hasPages: true, supplied: 24, declared: 26, preview: 16 });
    expect(courtesyNote({ capacity, autoPadBlanks: true, blankNumbers: [24, 25, 26, 27] })).toBe(
      'Se completa con 4 páginas de cortesía (págs. 24–27) hasta 28. 2 llegan al total declarado y 2 cierran el pliego.',
    );
    expect(courtesyNote({ capacity, autoPadBlanks: false, blankNumbers: [24, 25, 26, 27] })).toContain('añade 4 páginas');
  });

  test('una sola página', () => {
    const capacity = capacityOf({ hasPages: true, supplied: 23, declared: null, preview: 16 });
    expect(courtesyNote({ capacity, autoPadBlanks: true, blankNumbers: [23] })).toBe('Se completa con 1 página de cortesía (pág. 23) hasta 24.');
  });

  test('las series largas se dan como tramo', () => {
    expect(listPages([18, 19])).toBe('18 y 19');
    expect(listPages([24, 25, 26, 27])).toBe('24–27');
    expect(listPages([3, 4, 9, 10])).toBe('3, 4, 9 y 10');
  });
});

describe('archivos esperados', () => {
  const roundTrip = (overrides: Partial<MagazineConfig>, total: number): { sequence: string[]; folios: (number | null)[] } => {
    const config = makeConfig(overrides);
    const expected = expectedInput(config, total, computeImposition(paddedPageCount(total), config));
    const units = expected.sequence.map((unit, order) => {
      const [left, right] = unit.split('-').map(Number);
      return right === undefined ? pdfUnit(order, 210, 297, [{ value: left ?? 0, x: 0.5, y: 0.96 }]) : a4Spread(order, left ?? null, right);
    });
    return { sequence: expected.sequence, folios: buildPages(units, config).map((page) => page.detectedFolio) };
  };
  const upTo = (total: number): number[] => Array.from({ length: total }, (_unused, index) => index + 1);

  test('páginas sueltas: una hoja por página', () => {
    const expected = expectedInput(makeConfig(), 16, computeImposition(16, makeConfig()));
    expect(expected).toMatchObject({ units: 16, label: '16 hojas', detail: 'una por página', sample: '1 · 2 · 3 … 15 · 16' });
  });

  test('pliegos de lectura: portada y contraportada sueltas', () => {
    const config = makeConfig({ inputMode: 'spreads' });
    const expected = expectedInput(config, 16, computeImposition(16, config));
    expect(expected).toMatchObject({ units: 9, label: '9 hojas', detail: '2 sueltas y 7 dobles', sample: '1 · 2-3 · 4-5 … 14-15 · 16' });
    expect(roundTrip({ inputMode: 'spreads' }, 16).folios).toEqual(upTo(16));
  });

  test('cubierta envolvente: contraportada + portada en la primera hoja', () => {
    const { sequence, folios } = roundTrip({ inputMode: 'spreads', wraparoundCover: true }, 16);
    expect(sequence.slice(0, 2)).toEqual(['16-1', '2-3']);
    expect(sequence).toHaveLength(8);
    expect(folios).toEqual(upTo(16));
  });

  test('RTL invierte las parejas', () => {
    const { sequence, folios } = roundTrip({ inputMode: 'spreads', wraparoundCover: true, readingDirection: 'rtl' }, 8);
    expect(sequence).toEqual(['1-8', '3-2', '5-4', '7-6']);
    expect(folios).toEqual(upTo(8));
  });

  test('pliegos de imprenta: cara y retiro en orden de máquina', () => {
    const { sequence, folios } = roundTrip({ inputMode: 'spreads', spreadKind: 'printer' }, 8);
    expect(sequence).toEqual(['8-1', '2-7', '6-3', '4-5']);
    expect(folios).toEqual(upTo(8));
    const config = makeConfig({ inputMode: 'spreads', spreadKind: 'printer' });
    expect(expectedInput(config, 8, computeImposition(8, config))).toMatchObject({ label: '4 caras', detail: 'cara y retiro de 2 pliegos' });
  });

  test('un total que no cierra pliego', () => {
    expect(roundTrip({ inputMode: 'spreads' }, 18).sequence).toHaveLength(10);
    expect(roundTrip({ inputMode: 'spreads' }, 17).sequence.at(-1)).toBe('16-17');
  });
});

describe('casillas', () => {
  const blanks = new Set([18, 19]);
  const pages: Page[] = Array.from({ length: 20 }, (_, index) => ({
    id: String(index),
    origin: index === 17 ? 'manual-blank' : index === 18 ? 'auto-blank' : 'file',
    unitId: index === 17 || index === 18 ? null : `u${String(index)}`,
    half: 'full',
    detectedFolio: null,
  }));

  test('cortesía, falta y blanca a mano', () => {
    expect(slotKindOf(1, blanks, pages, true)).toBe('page');
    expect(slotKindOf(19, blanks, pages, true)).toBe('courtesy');
    expect(slotKindOf(19, blanks, pages, false)).toBe('missing');
    expect(slotKindOf(18, blanks, pages, false)).toBe('blank');
  });

  test('8 páginas a caballo: [8|1] [2|7] · [6|3] [4|5]', () => {
    const imposition = computeImposition(8, DEFAULT_CONFIG);
    const labels = imposition.sheets.map((sheet) => sheetAriaLabel(sheet, () => 'page'));
    expect(labels).toEqual([
      'Pliego 1, cubierta: cara, páginas 8 y 1; retiro, páginas 2 y 7',
      'Pliego 2: cara, páginas 6 y 3; retiro, páginas 4 y 5',
    ]);
  });
});

describe('cajas de la página', () => {
  test('marcas fuera, sangrado y corte dentro', () => {
    const boxes = pageBoxes({ widthMm: 210, heightMm: 297 }, 3, 5, 5);
    expect(boxes.file).toEqual({ width: 226, height: 313 });
    expect(boxes.bleedInset).toBe(5);
    expect(boxes.trimInset).toBe(8);
    expect(boxes.safeInset).toBe(13);
    expect(boxes.safeFits).toBe(true);
    expect(pageBoxes({ widthMm: 100, heightMm: 100 }, 0, 0, 50).safeFits).toBe(false);
  });
});

describe('restablecer', () => {
  test('el nombre del trabajo no cuenta', () => {
    expect(isDefaultConfig({ ...DEFAULT_CONFIG, title: 'Otra' }, DEFAULT_CONFIG)).toBe(true);
    expect(isDefaultConfig({ ...DEFAULT_CONFIG, binding: 'perfect-bound' }, DEFAULT_CONFIG)).toBe(false);
  });
});
