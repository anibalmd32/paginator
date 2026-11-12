import { describe, expect, test } from 'bun:test';

import type { NormRect, Page } from '@/lib/types';

import { DEFAULT_CONFIG } from './defaults';
import { estimateSpine, expectedUnitSizeMm, pageGeometry, resolveTrim } from './geometry';
import { buildPages, createManualBlank } from './segmentation';
import { imageUnit, makeConfig, pdfUnit } from './testkit';

const A4 = { widthMm: 210, heightMm: 297 };

function page(unitId: string, half: Page['half']): Page {
  return { id: `${unitId}:${half}`, origin: 'file', unitId, half, detectedFolio: null };
}

function expectRect(actual: NormRect, expected: NormRect): void {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
  expect(actual.w).toBeCloseTo(expected.w, 5);
  expect(actual.h).toBeCloseTo(expected.h, 5);
}

function mm(x0: number, x1: number, y0: number, y1: number, W: number, H: number): NormRect {
  return { x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H };
}

describe('expectedUnitSizeMm', () => {
  test('simple y doble, con sangrado y marcas', () => {
    const config = makeConfig({ bleedMm: 3, marksMm: 5 });
    expect(expectedUnitSizeMm('single', config, A4)).toEqual({ widthMm: 226, heightMm: 313 });
    expect(expectedUnitSizeMm('double', config, A4)).toEqual({ widthMm: 436, heightMm: 313 });
  });

  test('a corte: el archivo es exactamente el formato', () => {
    const config = makeConfig();
    expect(expectedUnitSizeMm('single', config, A4)).toEqual(A4);
    expect(expectedUnitSizeMm('double', config, A4)).toEqual({ widthMm: 420, heightMm: 297 });
  });

  test('medidas negativas o NaN de configuración cuentan como 0', () => {
    const config = makeConfig({ bleedMm: -3, marksMm: Number.NaN });
    expect(expectedUnitSizeMm('single', config, A4)).toEqual(A4);
  });
});

describe('resolveTrim', () => {
  test('formato fijo: tal cual, sin mirar los archivos', () => {
    const config = makeConfig({ trim: { mode: 'fixed', presetId: 'a5', widthMm: 148, heightMm: 210 } });
    const units = [pdfUnit(0, 210, 297)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual({ widthMm: 148, heightMm: 210 });
  });

  test('formato fijo inservible: A4', () => {
    const config = makeConfig({ trim: { mode: 'fixed', presetId: null, widthMm: 0, heightMm: 210 } });
    expect(resolveTrim(config, [], [])).toEqual(A4);
  });

  test('sin páginas (o solo blancas): A4', () => {
    expect(resolveTrim(makeConfig(), [], [])).toEqual(A4);
    expect(resolveTrim(makeConfig(), [], [createManualBlank()])).toEqual(A4);
  });

  test("PDF con sangrado de 3 mm: descuenta 2·m'", () => {
    const config = makeConfig({ bleedMm: 3 });
    const units = [pdfUnit(0, 216, 303), pdfUnit(1, 216, 303), pdfUnit(2, 216, 303)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual(A4);
  });

  test('PDF de pliegos dobles con sangrado y marcas: mitad del ancho útil', () => {
    const config = makeConfig({ inputMode: 'spreads', bleedMm: 3, marksMm: 5 });
    const units = [pdfUnit(0, 436, 313), pdfUnit(1, 436, 313)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual(A4);
  });

  test('mediana: una portada de otro tamaño no cambia el formato', () => {
    const config = makeConfig();
    const units = [pdfUnit(0, 230, 310), pdfUnit(1, 205, 275), pdfUnit(2, 205, 275), pdfUnit(3, 205, 275)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual({ widthMm: 205, heightMm: 275 });
  });

  test('redondea a 0,1 mm', () => {
    const config = makeConfig();
    const units = [pdfUnit(0, 209.97, 297.04)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual(A4);
  });

  test('imágenes: ancho supuesto de 210 mm y el alto por la proporción', () => {
    const config = makeConfig();
    const units = [imageUnit(0, 2100, 2970), imageUnit(1, 2100, 2970)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual(A4);
  });

  test('imágenes con sangrado: la escala sale del ancho total esperado (210 + 2·3)', () => {
    const config = makeConfig({ bleedMm: 3 });
    const units = [imageUnit(0, 2160, 3030)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual(A4);
  });

  test('imágenes dobles: escala con dos páginas de ancho', () => {
    const config = makeConfig({ inputMode: 'spreads', bleedMm: 3 });
    const units = [imageUnit(0, 4260, 3030)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual(A4);
  });

  test('si hay PDF e imágenes, mandan las medidas reales', () => {
    const config = makeConfig();
    const units = [pdfUnit(0, 148, 210), imageUnit(1, 1000, 2000), imageUnit(2, 1000, 2000)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual({ widthMm: 148, heightMm: 210 });
  });

  test('medidas absurdas no lanzan y caen a A4', () => {
    const config = makeConfig({ bleedMm: 500 });
    const units = [pdfUnit(0, 210, 297), imageUnit(1, 0, 0)];
    expect(resolveTrim(config, units, buildPages(units, config))).toEqual(A4);
  });
});

describe('pageGeometry', () => {
  test('página en blanco: todo {0,0,1,1}', () => {
    const whole = { x: 0, y: 0, w: 1, h: 1 };
    const geometry = pageGeometry(createManualBlank(), null, makeConfig({ bleedMm: 3 }), A4);
    expect(geometry).toEqual({ source: whole, bleed: whole, trim: whole, safe: whole });
  });

  test('página entera a corte: corte = sangrado = unidad; segura reducida 5 mm', () => {
    const unit = pdfUnit(0, 210, 297);
    const g = pageGeometry(page(unit.id, 'full'), unit, makeConfig(), A4);
    expectRect(g.source, { x: 0, y: 0, w: 1, h: 1 });
    expectRect(g.trim, { x: 0, y: 0, w: 1, h: 1 });
    expectRect(g.bleed, g.trim);
    expectRect(g.safe, mm(5, 205, 5, 292, 210, 297));
  });

  test('página entera PDF con sangrado 3 y marcas 5: corte centrado', () => {
    const config = makeConfig({ bleedMm: 3, marksMm: 5, safeMarginMm: 10 });
    const unit = pdfUnit(0, 226, 313);
    const g = pageGeometry(page(unit.id, 'full'), unit, config, A4);
    expectRect(g.trim, mm(8, 218, 8, 305, 226, 313));
    expectRect(g.bleed, mm(5, 221, 5, 308, 226, 313));
    expectRect(g.safe, mm(18, 208, 18, 295, 226, 313));
    expectRect(g.source, { x: 0, y: 0, w: 1, h: 1 });
  });

  test('página entera imagen: misma caja que el PDF equivalente (corte / total esperado)', () => {
    const config = makeConfig({ bleedMm: 3 });
    const image = imageUnit(0, 2160, 3030);
    const pdf = pdfUnit(1, 216, 303);
    const gi = pageGeometry(page(image.id, 'full'), image, config, A4);
    const gp = pageGeometry(page(pdf.id, 'full'), pdf, config, A4);
    expectRect(gi.trim, mm(3, 213, 3, 300, 216, 303));
    expectRect(gi.trim, gp.trim);
    expectRect(gi.bleed, gp.bleed);
    expectRect(gi.bleed, { x: 0, y: 0, w: 1, h: 1 });
  });

  test('imagen con otra proporción: el corte conserva su proporción y queda centrado', () => {
    const unit = imageUnit(0, 2100, 5940);
    const g = pageGeometry(page(unit.id, 'full'), unit, makeConfig(), A4);
    expectRect(g.trim, mm(0, 210, 148.5, 445.5, 210, 594));
  });

  test('mitades de un doble PDF con sangrado: sin sangrado en el lomo', () => {
    const config = makeConfig({ inputMode: 'spreads', bleedMm: 3, safeMarginMm: 5 });
    const unit = pdfUnit(0, 426, 303);
    const W = 426;
    const H = 303;
    const left = pageGeometry(page(unit.id, 'left'), unit, config, A4);
    const right = pageGeometry(page(unit.id, 'right'), unit, config, A4);

    expectRect(left.source, { x: 0, y: 0, w: 0.5, h: 1 });
    expectRect(right.source, { x: 0.5, y: 0, w: 0.5, h: 1 });
    expectRect(left.trim, mm(3, 213, 3, 300, W, H));
    expectRect(right.trim, mm(213, 423, 3, 300, W, H));
    expectRect(left.bleed, mm(0, 213, 0, 303, W, H));
    expectRect(right.bleed, mm(213, 426, 0, 303, W, H));
    expect(left.bleed.x + left.bleed.w).toBe(0.5);
    expect(right.bleed.x).toBe(0.5);
    expectRect(left.safe, mm(8, 208, 8, 295, W, H));
    expectRect(right.safe, mm(218, 418, 8, 295, W, H));
  });

  test('mitades de un doble a corte (imagen)', () => {
    const config = makeConfig({ inputMode: 'spreads' });
    const unit = imageUnit(0, 4200, 2970);
    const left = pageGeometry(page(unit.id, 'left'), unit, config, A4);
    const right = pageGeometry(page(unit.id, 'right'), unit, config, A4);
    expectRect(left.trim, { x: 0, y: 0, w: 0.5, h: 1 });
    expectRect(right.trim, { x: 0.5, y: 0, w: 0.5, h: 1 });
    expectRect(left.bleed, left.trim);
    expectRect(right.bleed, right.trim);
  });

  test('PDF que no cuadra: el corte va centrado a su tamaño y el sangrado se recorta a la unidad', () => {
    const unit = pdfUnit(0, 210, 297);
    const g = pageGeometry(page(unit.id, 'full'), unit, makeConfig({ bleedMm: 3 }), A4);
    expectRect(g.trim, { x: 0, y: 0, w: 1, h: 1 });
    expectRect(g.bleed, { x: 0, y: 0, w: 1, h: 1 });
  });

  test('todas las cajas quedan dentro de [0, 1] y anidadas: segura ⊂ corte ⊂ sangrado ⊂ unidad', () => {
    const cases = [
      { unit: pdfUnit(0, 216, 303), half: 'full' as const, bleedMm: 3, safe: 5 },
      { unit: pdfUnit(0, 426, 303), half: 'left' as const, bleedMm: 3, safe: 5 },
      { unit: pdfUnit(0, 426, 303), half: 'right' as const, bleedMm: 3, safe: 400 },
      { unit: imageUnit(0, 1000, 1414), half: 'full' as const, bleedMm: 5, safe: 400 },
      { unit: imageUnit(0, 3000, 1000), half: 'left' as const, bleedMm: 0, safe: 5 },
    ];
    const inside = (inner: NormRect, outer: NormRect): void => {
      expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1e-6);
      expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1e-6);
      expect(inner.x + inner.w).toBeLessThanOrEqual(outer.x + outer.w + 1e-6);
      expect(inner.y + inner.h).toBeLessThanOrEqual(outer.y + outer.h + 1e-6);
    };
    for (const { unit, half, bleedMm, safe } of cases) {
      const g = pageGeometry(page(unit.id, half), unit, makeConfig({ bleedMm, marksMm: 2, safeMarginMm: safe }), A4);
      for (const rect of [g.source, g.bleed, g.trim, g.safe]) inside(rect, { x: 0, y: 0, w: 1, h: 1 });
      inside(g.safe, g.trim);
      inside(g.trim, g.bleed);
    }
  });

  test('unidad sin medidas utilizables: se enseña tal cual, sin lanzar', () => {
    const unit = imageUnit(0, 0, 0);
    const g = pageGeometry(page(unit.id, 'right'), unit, makeConfig(), A4);
    expect(g.trim).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
  });
});

describe('estimateSpine', () => {
  const paper = { interiorGsm: 115, coverGsm: 250, interiorCaliperMm: 0.09, coverCaliperMm: 0.22 };

  test('grapada 32 páginas: 14 hojas de tripa + 2 de cubierta; creep = 7 · 0,09', () => {
    const spine = estimateSpine(32, makeConfig({ binding: 'saddle-stitch', paper }));
    expect(spine).toEqual({ widthMm: 1.7, interiorLeaves: 14, coverLeaves: 2, creepMm: 0.63 });
  });

  test('lomo cuadrado con cubierta aparte: 2 hojas de cubierta, sin creep', () => {
    const spine = estimateSpine(100, makeConfig({ binding: 'perfect-bound', separateCover: true, paper }));
    expect(spine).toEqual({ widthMm: 4.76, interiorLeaves: 48, coverLeaves: 2, creepMm: 0 });
  });

  test('lomo cuadrado sin cubierta aparte: todo tripa', () => {
    const spine = estimateSpine(100, makeConfig({ binding: 'perfect-bound', separateCover: false, paper }));
    expect(spine).toEqual({ widthMm: 4.5, interiorLeaves: 50, coverLeaves: 0, creepMm: 0 });
  });

  test('papel por defecto (115 g / 250 g)', () => {
    expect(estimateSpine(8, DEFAULT_CONFIG)).toEqual({ widthMm: 0.62, interiorLeaves: 2, coverLeaves: 2, creepMm: 0.09 });
  });

  test('entradas raras no lanzan', () => {
    expect(estimateSpine(0, DEFAULT_CONFIG)).toEqual({ widthMm: 0, interiorLeaves: 0, coverLeaves: 0, creepMm: 0 });
    expect(estimateSpine(Number.NaN, DEFAULT_CONFIG).widthMm).toBe(0);
    expect(estimateSpine(2, DEFAULT_CONFIG).coverLeaves).toBe(1);
  });
});
