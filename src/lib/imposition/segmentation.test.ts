import { describe, expect, test } from 'bun:test';

import type { BindingType, MagazineConfig, Page, ReadingDirection, SourceUnit } from '@/lib/types';

import { computeImposition, printerSideSequence } from './imposition';
import { applyPadding, buildPages, classifyUnits, createManualBlank } from './segmentation';
import { a4Spread, imageUnit, makeConfig, makeUnit, pdfUnit } from './testkit';

const ids = (pages: Page[]): string[] => pages.map((page) => page.id);

function looseCoverUnits(spreads: number): SourceUnit[] {
  const units = [imageUnit(0, 1000, 1414)];
  for (let i = 1; i <= spreads; i += 1) units.push(imageUnit(i, 2000, 1414));
  units.push(imageUnit(spreads + 1, 1000, 1414));
  return units;
}

describe('classifyUnits', () => {
  test('todas parecidas: manda el modo de entrada', () => {
    const units = [imageUnit(0, 1000, 1414), imageUnit(1, 1000, 1400), imageUnit(2, 1010, 1414)];
    expect([...classifyUnits(units, 'pages').values()]).toEqual(['single', 'single', 'single']);
    expect([...classifyUnits(units, 'spreads').values()]).toEqual(['double', 'double', 'double']);
  });

  test('dos grupos (factor ≥ 1,6): umbral en la media geométrica, con cualquier modo', () => {
    const units = [imageUnit(0, 1000, 1414), imageUnit(1, 2000, 1414), imageUnit(2, 2032, 1430), imageUnit(3, 1000, 1414)];
    for (const mode of ['pages', 'spreads'] as const) {
      const kinds = classifyUnits(units, mode);
      expect(units.map((unit) => kinds.get(unit.id))).toEqual(['single', 'double', 'double', 'single']);
    }
  });

  test('formatos parecidos (A4 y Carta, factor 1,09) no se confunden con dobles', () => {
    const units = [pdfUnit(0, 210, 297), pdfUnit(1, 216, 279)];
    expect([...classifyUnits(units, 'pages').values()]).toEqual(['single', 'single']);
  });

  test('justo en el factor 1,6 ya hay dos grupos; por debajo no', () => {
    const at = [imageUnit(0, 1000, 1000), imageUnit(1, 1600, 1000)];
    expect([...classifyUnits(at, 'pages').values()]).toEqual(['single', 'double']);
    const below = [imageUnit(0, 1000, 1000), imageUnit(1, 1590, 1000)];
    expect([...classifyUnits(below, 'pages').values()]).toEqual(['single', 'single']);
  });

  test('medidas inservibles siguen el modo y no lanzan', () => {
    const units = [imageUnit(0, 0, 0), imageUnit(1, Number.NaN, 100), imageUnit(2, 1000, 1414), imageUnit(3, 2000, 1414)];
    const kinds = classifyUnits(units, 'pages');
    expect(units.map((unit) => kinds.get(unit.id))).toEqual(['single', 'single', 'single', 'double']);
    expect(classifyUnits([], 'spreads').size).toBe(0);
  });
});

describe('buildPages · modo páginas', () => {
  test('cada unidad es una página entera, en orden de carga, con id determinista', () => {
    const units = [imageUnit(2, 1000, 1414, 3), imageUnit(0, 1000, 1414, 1), imageUnit(1, 1000, 1414, 2)];
    const pages = buildPages(units, makeConfig());
    expect(ids(pages)).toEqual(['u0:full', 'u1:full', 'u2:full']);
    expect(pages.map((page) => page.detectedFolio)).toEqual([1, 2, 3]);
    expect(pages.every((page) => page.origin === 'file' && page.half === 'full')).toBe(true);
    expect(units.map((unit) => unit.id)).toEqual(['u2', 'u0', 'u1']);
  });

  test('un doble colado se queda como página entera', () => {
    const units = [imageUnit(0, 1000, 1414), imageUnit(1, 2000, 1414), imageUnit(2, 1000, 1414)];
    expect(ids(buildPages(units, makeConfig()))).toEqual(['u0:full', 'u1:full', 'u2:full']);
  });

  test('sin unidades: sin páginas', () => {
    expect(buildPages([], makeConfig())).toEqual([]);
    expect(buildPages([], makeConfig({ inputMode: 'spreads', spreadKind: 'printer' }))).toEqual([]);
  });
});

describe('buildPages · pliegos de lectura', () => {
  const reader = (overrides: Partial<MagazineConfig> = {}): MagazineConfig =>
    makeConfig({ inputMode: 'spreads', spreadKind: 'reader', ...overrides });

  test('LTR con portada y contraportada sueltas', () => {
    expect(ids(buildPages(looseCoverUnits(3), reader()))).toEqual([
      'u0:full', 'u1:left', 'u1:right', 'u2:left', 'u2:right', 'u3:left', 'u3:right', 'u4:full',
    ]);
  });

  test('RTL con portada y contraportada sueltas: primero la mitad derecha', () => {
    expect(ids(buildPages(looseCoverUnits(2), reader({ readingDirection: 'rtl' })))).toEqual([
      'u0:full', 'u1:right', 'u1:left', 'u2:right', 'u2:left', 'u3:full',
    ]);
  });

  test('cubierta envolvente LTR: la mitad derecha es la página 1 y la izquierda la última', () => {
    const units = [0, 1, 2, 3].map((i) => imageUnit(i, 2000, 1414));
    expect(ids(buildPages(units, reader({ wraparoundCover: true })))).toEqual([
      'u0:right', 'u1:left', 'u1:right', 'u2:left', 'u2:right', 'u3:left', 'u3:right', 'u0:left',
    ]);
  });

  test('cubierta envolvente RTL: al revés', () => {
    const units = [0, 1, 2].map((i) => imageUnit(i, 2000, 1414));
    expect(ids(buildPages(units, reader({ wraparoundCover: true, readingDirection: 'rtl' })))).toEqual([
      'u0:left', 'u1:right', 'u1:left', 'u2:right', 'u2:left', 'u0:right',
    ]);
  });

  test('cubierta envolvente no se aplica si la primera unidad es simple', () => {
    expect(ids(buildPages(looseCoverUnits(1), reader({ wraparoundCover: true })))).toEqual([
      'u0:full', 'u1:left', 'u1:right', 'u2:full',
    ]);
  });

  test('sin cubierta envolvente, todos dobles: todas se parten en orden', () => {
    const units = [0, 1].map((i) => imageUnit(i, 2000, 1414));
    expect(ids(buildPages(units, reader()))).toEqual(['u0:left', 'u0:right', 'u1:left', 'u1:right']);
  });

  test('con cubierta envolvente, cada mitad cae en el lado que le corresponde y los folios salen 1…N', () => {
    const units = [a4Spread(0, 8, 1), a4Spread(1, 2, 3), a4Spread(2, 4, 5), a4Spread(3, 6, 7)];
    const pages = buildPages(units, reader({ wraparoundCover: true }));
    expect(pages.map((page) => page.detectedFolio)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    pages.forEach((page, i) => expect(page.half).toBe((i + 1) % 2 === 1 ? 'right' : 'left'));
  });
});

describe('buildPages · pliegos de imprenta (imposición inversa)', () => {
  const printer = (overrides: Partial<MagazineConfig> = {}): MagazineConfig =>
    makeConfig({ inputMode: 'spreads', spreadKind: 'printer', ...overrides });

  test('N = 8 grapada: caras [8|1] [2|7] [6|3] [4|5] vuelven a 1…8', () => {
    const units = [0, 1, 2, 3].map((i) => imageUnit(i, 2000, 1414));
    expect(ids(buildPages(units, printer()))).toEqual([
      'u0:right', 'u1:left', 'u2:right', 'u3:left', 'u3:right', 'u2:left', 'u1:right', 'u0:left',
    ]);
  });

  test('N = 8 grapada RTL: espejo', () => {
    const units = [0, 1, 2, 3].map((i) => imageUnit(i, 2000, 1414));
    expect(ids(buildPages(units, printer({ readingDirection: 'rtl' })))).toEqual([
      'u0:left', 'u1:right', 'u2:left', 'u3:right', 'u3:left', 'u2:right', 'u1:left', 'u0:right',
    ]);
  });

  test('N = 12 lomo cuadrado con cubierta y cuadernillos de 4: [12|1] [2|11] [6|3] [4|5] [10|7] [8|9]', () => {
    const units = [0, 1, 2, 3, 4, 5].map((i) => imageUnit(i, 2000, 1414));
    const config = printer({ binding: 'perfect-bound', signaturePages: 4, separateCover: true });
    expect(ids(buildPages(units, config))).toEqual([
      'u0:right', 'u1:left', 'u2:right', 'u3:left', 'u3:right', 'u2:left',
      'u4:right', 'u5:left', 'u5:right', 'u4:left', 'u1:right', 'u0:left',
    ]);
  });

  test('las unidades con aspecto de simple también se parten', () => {
    const units = [imageUnit(0, 2000, 1414), imageUnit(1, 1000, 1414)];
    const pages = buildPages(units, printer());
    expect(ids(pages)).toEqual(['u0:right', 'u1:left', 'u1:right', 'u0:left']);
  });

  test('caras que faltan: sus páginas quedan como blancas automáticas en su sitio', () => {
    const units = [0, 1, 2].map((i) => imageUnit(i, 2000, 1414));
    const pages = buildPages(units, printer());
    expect(ids(pages)).toEqual(['u0:right', 'u1:left', 'u2:right', 'blank:auto:1', 'blank:auto:2', 'u2:left', 'u1:right', 'u0:left']);
    expect(pages[3]).toEqual({ id: 'blank:auto:1', origin: 'auto-blank', unitId: null, half: 'full', detectedFolio: null });
  });

  test('ida y vuelta: imponer y des-imponer devuelve 1…N para todas las combinaciones', () => {
    const bindings: BindingType[] = ['saddle-stitch', 'perfect-bound'];
    const directions: ReadingDirection[] = ['ltr', 'rtl'];
    for (let n = 4; n <= 64; n += 4) {
      for (const binding of bindings) {
        for (const signaturePages of binding === 'saddle-stitch' ? [16] : [4, 8, 16, 32]) {
          for (const separateCover of binding === 'saddle-stitch' ? [true] : [true, false]) {
            for (const readingDirection of directions) {
              const config = printer({ binding, signaturePages, separateCover, readingDirection });
              const sides = printerSideSequence(computeImposition(n, config));
              const units = sides.map((side, k) => a4Spread(k, side.left, side.right));
              const pages = buildPages(units, config);
              expect(pages).toHaveLength(n);
              expect(pages.map((page) => page.detectedFolio)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
              expect(new Set(ids(pages)).size).toBe(n);
            }
          }
        }
      }
    }
  });
});

describe('folio detectado', () => {
  const pagesOf = (unit: SourceUnit, overrides: Partial<MagazineConfig> = {}): Page[] => buildPages([unit], makeConfig(overrides));

  test('página entera: prefiere el número del pie al de la cabecera', () => {
    const unit = pdfUnit(0, 210, 297, [
      { value: 2026, x: 0.5, y: 0.04 },
      { value: 17, x: 0.93, y: 0.96 },
    ]);
    expect(pagesOf(unit)[0]?.detectedFolio).toBe(17);
  });

  test('mitades: cada una toma el candidato de su lado (x < 0,5 izquierda; ≥ 0,5 derecha)', () => {
    const unit = pdfUnit(0, 420, 297, [
      { value: 4, x: 0.04, y: 0.96 },
      { value: 5, x: 0.5, y: 0.96 },
      { value: 99, x: 0.3, y: 0.1 },
    ]);
    const pages = pagesOf(unit, { inputMode: 'spreads' });
    expect(pages.map((page) => [page.half, page.detectedFolio])).toEqual([
      ['left', 4],
      ['right', 5],
    ]);
  });

  test('mitad sin candidato: null', () => {
    const unit = pdfUnit(0, 420, 297, [{ value: 4, x: 0.04, y: 0.96 }]);
    const pages = pagesOf(unit, { inputMode: 'spreads' });
    expect(pages.map((page) => page.detectedFolio)).toEqual([4, null]);
  });

  test('sin texto: el número del nombre de archivo solo vale para páginas enteras', () => {
    expect(pagesOf(imageUnit(0, 1000, 1414, 12))[0]?.detectedFolio).toBe(12);
    expect(pagesOf(imageUnit(0, 1000, 1414))[0]?.detectedFolio).toBeNull();
    const halves = pagesOf(imageUnit(0, 2000, 1414, 12), { inputMode: 'spreads' });
    expect(halves.map((page) => page.detectedFolio)).toEqual([null, null]);
  });

  test('con folios de PDF, el nombre de archivo no se usa', () => {
    const unit = makeUnit(0, { filenameNumber: 40, folios: [{ value: 7, x: 0.5, y: 0.95 }] });
    expect(pagesOf(unit)[0]?.detectedFolio).toBe(7);
  });

  test('folios ilegibles se ignoran', () => {
    const unit = makeUnit(0, { folios: [{ value: Number.NaN, x: 0.5, y: 0.95 }] });
    expect(pagesOf(unit)[0]?.detectedFolio).toBeNull();
  });
});

describe('applyPadding', () => {
  const filePages = (count: number): Page[] =>
    buildPages(
      Array.from({ length: count }, (_, i) => imageUnit(i, 1000, 1414)),
      makeConfig(),
    );

  test('6 páginas → 8, blancas antes de la contraportada', () => {
    const pages = filePages(6);
    const padded = applyPadding(pages, makeConfig());
    expect(ids(padded)).toEqual(['u0:full', 'u1:full', 'u2:full', 'u3:full', 'u4:full', 'blank:auto:1', 'blank:auto:2', 'u5:full']);
    expect(padded[5]).toEqual({ id: 'blank:auto:1', origin: 'auto-blank', unitId: null, half: 'full', detectedFolio: null });
    expect(pages).toHaveLength(6);
  });

  test('6 páginas → 8, blancas al final', () => {
    const padded = applyPadding(filePages(6), makeConfig({ blankPlacement: 'end' }));
    expect(ids(padded).slice(5)).toEqual(['u5:full', 'blank:auto:1', 'blank:auto:2']);
  });

  test('ya es múltiplo de 4: copia sin cambios', () => {
    const pages = filePages(8);
    const padded = applyPadding(pages, makeConfig());
    expect(padded).toEqual(pages);
    expect(padded).not.toBe(pages);
  });

  test('total declarado mayor: completa hasta él y luego hasta múltiplo de 4', () => {
    expect(applyPadding(filePages(6), makeConfig({ declaredPageCount: 12 }))).toHaveLength(12);
    expect(applyPadding(filePages(6), makeConfig({ declaredPageCount: 10 }))).toHaveLength(12);
    expect(applyPadding(filePages(8), makeConfig({ declaredPageCount: 9 }))).toHaveLength(12);
  });

  test('total declarado menor o igual: no recorta', () => {
    expect(applyPadding(filePages(8), makeConfig({ declaredPageCount: 4 }))).toHaveLength(8);
    expect(applyPadding(filePages(7), makeConfig({ declaredPageCount: 4 }))).toHaveLength(8);
  });

  test('con autoPadBlanks desactivado completa igualmente (la validación lo marca como error)', () => {
    expect(applyPadding(filePages(5), makeConfig({ autoPadBlanks: false }))).toHaveLength(8);
  });

  test('una sola página: las blancas van detrás aunque se pida antes de la contraportada', () => {
    expect(ids(applyPadding(filePages(1), makeConfig()))).toEqual(['u0:full', 'blank:auto:1', 'blank:auto:2', 'blank:auto:3']);
  });

  test('dos páginas: portada, blancas, contraportada', () => {
    expect(ids(applyPadding(filePages(2), makeConfig()))).toEqual(['u0:full', 'blank:auto:1', 'blank:auto:2', 'u1:full']);
  });

  test('lista vacía: un pliego en blanco', () => {
    const padded = applyPadding([], makeConfig());
    expect(padded).toHaveLength(4);
    expect(padded.every((page) => page.origin === 'auto-blank')).toBe(true);
  });

  test('el resultado siempre es múltiplo de 4 y los ids no se repiten (1…40 páginas, con blancas previas)', () => {
    for (let count = 1; count <= 40; count += 1) {
      for (const blankPlacement of ['before-back-cover', 'end'] as const) {
        const pages = filePages(count);
        pages.splice(1, 0, { id: 'blank:auto:1', origin: 'auto-blank', unitId: null, half: 'full', detectedFolio: null });
        const padded = applyPadding(pages, makeConfig({ blankPlacement }));
        expect(padded.length % 4).toBe(0);
        expect(padded.length).toBeGreaterThanOrEqual(pages.length);
        expect(padded.length - pages.length).toBeLessThan(4);
        expect(new Set(ids(padded)).size).toBe(padded.length);
        expect(ids(padded).filter((id) => ids(pages).includes(id))).toEqual(ids(pages));
        expect(padded[0]?.id).toBe('u0:full');
        if (blankPlacement === 'before-back-cover') expect(padded[padded.length - 1]?.id).toBe(pages[pages.length - 1]?.id ?? '');
      }
    }
  });
});

describe('createManualBlank', () => {
  test('crea blancas distintas con id blank:manual:<uuid>', () => {
    const a = createManualBlank();
    const b = createManualBlank();
    expect(a.id).toMatch(/^blank:manual:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.id).not.toBe(b.id);
    expect(a).toEqual({ id: a.id, origin: 'manual-blank', unitId: null, half: 'full', detectedFolio: null });
  });
});
