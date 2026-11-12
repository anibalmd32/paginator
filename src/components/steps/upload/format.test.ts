import { describe, expect, test } from 'bun:test';

import { DEFAULT_CONFIG, TRIM_PRESETS } from '@/lib/imposition';
import type { MagazineConfig, Page, SourceUnit } from '@/lib/types';

import { formatBytes, formatTrim, moveDestination, orderLoadIssues, segmentationSummary, slotLabel, storeIndexOf } from './format';

function unit(id: string, order: number, width: number, height: number): SourceUnit {
  return { id, assetId: 'a', indexInAsset: order, order, label: id, width, height, widthMm: null, heightMm: null, filenameNumber: null, folios: [] };
}

function page(id: string, origin: Page['origin'] = 'file'): Page {
  return { id, origin, unitId: origin === 'file' ? id : null, half: 'full', detectedFolio: null };
}

describe('textos de carga', () => {
  test('pesos de archivo con coma decimal', () => {
    expect(formatBytes(840_000)).toBe('840 kB');
    expect(formatBytes(2_400_000)).toBe('2,4 MB');
    expect(formatBytes(12_400_000)).toBe('12 MB');
  });

  test('formato con nombre y medidas', () => {
    expect(formatTrim({ widthMm: 210, heightMm: 297 }, TRIM_PRESETS)).toBe('A4 210 × 297 mm');
    expect(formatTrim({ widthMm: 200, heightMm: 260.5 }, TRIM_PRESETS)).toBe('200 × 260,5 mm');
  });

  test('un formato reconocido se escribe con sus medidas nominales, en la orientación del trabajo', () => {
    expect(formatTrim({ widthMm: 210, heightMm: 296.8 }, TRIM_PRESETS)).toBe('A4 210 × 297 mm');
    expect(formatTrim({ widthMm: 297.2, heightMm: 210 }, TRIM_PRESETS)).toBe('A4 297 × 210 mm');
  });

  test('casilla física', () => {
    expect(slotLabel({ pageNumber: 5, sheetIndex: 2, face: 'back', position: 'left', signature: 0 })).toBe('Pliego 3 · retiro · izq.');
  });

  test('resumen de pliegos de lectura con portada y contraportada sueltas', () => {
    const config: MagazineConfig = { ...DEFAULT_CONFIG, inputMode: 'spreads', spreadKind: 'reader', wraparoundCover: false };
    const units = [unit('p', 0, 210, 297), ...Array.from({ length: 7 }, (_, i) => unit(`d${String(i)}`, i + 1, 420, 297)), unit('c', 8, 210, 297)];
    const kinds = new Map(units.map((u) => [u.id, u.width > 300 ? ('double' as const) : ('single' as const)]));
    const summary = segmentationSummary(config, units, kinds, 16);
    expect(summary.headline).toBe('7 hojas dobles + 2 sueltas → 16 páginas');
    expect(summary.breakdown).toBe('1 portada suelta + 7 dobles + 1 contraportada suelta');
  });
});

describe('incidencias de carga', () => {
  test('primero lo grave y, a igual gravedad, lo que trae arreglo; el resto en el orden del pre-vuelo', () => {
    const issues = [
      { id: 'folio-1', severity: 'warning' },
      { id: 'dobles', severity: 'warning', fix: { label: 'Tratar como pliegos' } },
      { id: 'cortesias', severity: 'info' },
      { id: 'folio-2', severity: 'warning' },
      { id: 'lados', severity: 'error', fix: { label: 'La primera hoja es contraportada + portada' } },
    ];
    expect(orderLoadIssues(issues).map((issue) => issue.id)).toEqual(['lados', 'dobles', 'folio-1', 'folio-2', 'cortesias']);
  });
});

describe('reordenar', () => {
  test('las cortesías automáticas no tienen índice en el store', () => {
    const pages = [page('a'), page('b'), page('c')];
    const effective = [pages[0], pages[1], page('x', 'auto-blank'), pages[2]].filter((p): p is Page => p !== undefined);
    expect(storeIndexOf(3, effective, pages)).toBeNull();
    expect(storeIndexOf(4, effective, pages)).toBe(2);
  });

  test('destino de movePage antes y después', () => {
    expect(moveDestination(0, 2, true)).toBe(2);
    expect(moveDestination(3, 1, false)).toBe(1);
    expect(moveDestination(0, 2, false)).toBe(1);
  });
});
