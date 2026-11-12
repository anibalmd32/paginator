import { describe, expect, test } from 'bun:test';

import type { FolioHit, Page, SourceUnit } from '@/lib/types';

import { computeImposition } from './imposition';
import { applyPadding, buildPages } from './segmentation';
import { a4Pages, a4Spread, codesOf, imageUnit, issuesOf, makeConfig, makeProject, makeUnit, pdfUnit } from './testkit';
import { validateProject } from './validation';

const foot = (value: number): FolioHit[] => [{ value, x: 0.5, y: 0.96 }];

function a4With(count: number, changes: Record<number, SourceUnit>): SourceUnit[] {
  return a4Pages(count).map((unit, index) => changes[index + 1] ?? unit);
}

const FIXED_A4 = { mode: 'fixed', presetId: 'a4', widthMm: 210, heightMm: 297 } as const;

describe('proyecto limpio', () => {
  test('8 páginas A4 bien foliadas en grapada: sin incidencias', () => {
    expect(makeProject(a4Pages(8)).issues).toEqual([]);
  });

  test('pliegos de lectura correctos con portada y contraportada sueltas: sin incidencias', () => {
    const units = [pdfUnit(0, 210, 297, foot(1)), a4Spread(1, 2, 3), a4Spread(2, 4, 5), a4Spread(3, 6, 7), pdfUnit(4, 210, 297, foot(8))];
    expect(makeProject(units, { inputMode: 'spreads' }).issues).toEqual([]);
  });
});

describe('no-pages', () => {
  test('sin unidades: solo la nota informativa', () => {
    const issues = makeProject([]).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'no-pages', severity: 'info', pageNumbers: [], sheetIndexes: [] });
  });

  test('con páginas no aparece', () => {
    expect(codesOf(makeProject(a4Pages(4)))).not.toContain('no-pages');
  });
});

describe('recuento y cortesías', () => {
  test('6 páginas sin cortesías automáticas: error con arreglo enable-auto-blanks', () => {
    const project = makeProject(a4Pages(6), { autoPadBlanks: false });
    const [issue] = issuesOf(project, 'page-count-not-multiple-of-4');
    expect(issue).toMatchObject({ severity: 'error', fix: { kind: 'enable-auto-blanks' } });
    expect(codesOf(project)).not.toContain('blank-pages-added');
  });

  test('6 páginas con cortesías: nota con cuántas y dónde (6 y 7, antes de la contraportada)', () => {
    const project = makeProject(a4Pages(6));
    const [issue] = issuesOf(project, 'blank-pages-added');
    expect(issue).toMatchObject({ severity: 'info', pageNumbers: [6, 7] });
    expect(issue?.title).toContain('2 páginas de cortesía');
    expect(issue?.sheetIndexes).toEqual([0, 1]);
    expect(codesOf(project)).not.toContain('page-count-not-multiple-of-4');
  });

  test('cortesías al final', () => {
    const [issue] = issuesOf(makeProject(a4Pages(5), { blankPlacement: 'end' }), 'blank-pages-added');
    expect(issue?.pageNumbers).toEqual([6, 7, 8]);
    expect(issue?.detail).toContain('al final');
  });

  test('múltiplo de 4: ni error ni nota', () => {
    const codes = codesOf(makeProject(a4Pages(12), { autoPadBlanks: false }));
    expect(codes).not.toContain('page-count-not-multiple-of-4');
    expect(codes).not.toContain('blank-pages-added');
  });

  test('las blancas que el usuario inserta a mano cuentan como páginas aportadas', () => {
    const project = makeProject(a4Pages(7), { autoPadBlanks: false }, (pages) => [
      ...pages.slice(0, 3),
      { id: 'blank:manual:x', origin: 'manual-blank', unitId: null, half: 'full', detectedFolio: null },
      ...pages.slice(3),
    ]);
    expect(codesOf(project)).not.toContain('page-count-not-multiple-of-4');
  });
});

describe('declared-count-mismatch', () => {
  test('faltan páginas: error', () => {
    const [issue] = issuesOf(makeProject(a4Pages(8), { declaredPageCount: 12 }), 'declared-count-mismatch');
    expect(issue).toMatchObject({ severity: 'error' });
    expect(issue?.title).toContain('Faltan 4 páginas');
    expect(issue?.fix).toBeUndefined();
  });

  test('sobran páginas: aviso con arreglo use-actual-page-count y señala las sobrantes', () => {
    const [issue] = issuesOf(makeProject(a4Pages(8), { declaredPageCount: 4 }), 'declared-count-mismatch');
    expect(issue).toMatchObject({ severity: 'warning', pageNumbers: [5, 6, 7, 8], fix: { kind: 'use-actual-page-count' } });
  });

  test('coincide o no está declarado: nada', () => {
    expect(codesOf(makeProject(a4Pages(8), { declaredPageCount: 8 }))).not.toContain('declared-count-mismatch');
    expect(codesOf(makeProject(a4Pages(8)))).not.toContain('declared-count-mismatch');
  });
});

describe('folios', () => {
  test('una página con folio fuera de orden: aviso que nombra folio y posición', () => {
    const project = makeProject(a4With(8, { 5: pdfUnit(4, 210, 297, foot(50)) }));
    const issues = issuesOf(project, 'folio-out-of-order');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', pageNumbers: [5], sheetIndexes: [1] });
    expect(issues[0]?.title).toContain('página 5');
    expect(issues[0]?.title).toContain('folio 50');
    expect(issues[0]?.detail).toContain('folio 5');
  });

  test('desfase constante (folios desde 3): no es desorden', () => {
    const units = Array.from({ length: 8 }, (_, i) => pdfUnit(i, 210, 297, foot(i + 3)));
    expect(codesOf(makeProject(units))).not.toContain('folio-out-of-order');
  });

  test('un bloque desplazado es una sola incidencia', () => {
    const units = a4With(8, {
      4: pdfUnit(3, 210, 297, foot(10)),
      5: pdfUnit(4, 210, 297, foot(11)),
      6: pdfUnit(5, 210, 297, foot(12)),
    });
    const issues = issuesOf(makeProject(units), 'folio-out-of-order');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.pageNumbers).toEqual([4, 5, 6]);
  });

  test('las cortesías antes de la contraportada no se cuentan como desorden', () => {
    expect(codesOf(makeProject(a4Pages(6)))).not.toContain('folio-out-of-order');
  });

  test('folios a medias o sin folios: no lanza ni avisa', () => {
    const units = a4Pages(8).map((unit, i) => (i % 3 === 0 ? unit : { ...unit, folios: [] }));
    expect(codesOf(makeProject(units))).not.toContain('folio-out-of-order');
    expect(codesOf(makeProject(Array.from({ length: 8 }, (_, i) => imageUnit(i, 1000, 1414))))).toEqual([]);
  });

  test('folio repetido: duplicate-folio con las dos páginas', () => {
    const project = makeProject(a4With(8, { 4: pdfUnit(3, 210, 297, foot(3)) }));
    const [issue] = issuesOf(project, 'duplicate-folio');
    expect(issue).toMatchObject({ severity: 'warning', pageNumbers: [3, 4] });
    expect(issue?.title).toContain('folio 3');
  });

  test('sin repetidos: no hay duplicate-folio', () => {
    expect(codesOf(makeProject(a4Pages(8)))).not.toContain('duplicate-folio');
  });
});

describe('formato', () => {
  test('size-mismatch con mm: una página 205 × 275 entre A4', () => {
    const project = makeProject(a4With(8, { 3: pdfUnit(2, 205, 275, foot(3)) }));
    const [issue] = issuesOf(project, 'size-mismatch');
    expect(issue).toMatchObject({ severity: 'warning', pageNumbers: [3] });
  });

  test('size-mismatch no salta por debajo de 1 mm', () => {
    expect(codesOf(makeProject(a4With(8, { 3: pdfUnit(2, 210.6, 297.4, foot(3)) })))).not.toContain('size-mismatch');
  });

  test('size-mismatch por proporción en imágenes (> 1,5 %)', () => {
    const units = Array.from({ length: 8 }, (_, i) => imageUnit(i, 1000, i === 6 ? 1500 : 1414));
    expect(issuesOf(makeProject(units), 'size-mismatch')[0]?.pageNumbers).toEqual([7]);
    const close = Array.from({ length: 8 }, (_, i) => imageUnit(i, 1000, i === 6 ? 1428 : 1414));
    expect(codesOf(makeProject(close))).not.toContain('size-mismatch');
  });

  test('orientation-mismatch: una apaisada entre verticales, sin repetirla como formato distinto', () => {
    const project = makeProject(a4With(8, { 3: pdfUnit(2, 230, 210, foot(3)) }));
    expect(issuesOf(project, 'orientation-mismatch')[0]).toMatchObject({ severity: 'warning', pageNumbers: [3] });
    expect(codesOf(project)).not.toContain('size-mismatch');
  });

  test('todas verticales: sin orientation-mismatch', () => {
    expect(codesOf(makeProject(a4Pages(8)))).not.toContain('orientation-mismatch');
  });

  test('file-size-vs-trim: formato fijo con sangrado y archivo a corte', () => {
    const project = makeProject(a4Pages(8), { trim: FIXED_A4, bleedMm: 3 });
    const issues = issuesOf(project, 'file-size-vs-trim');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.pageNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(issues[0]?.title).toContain('210 × 297');
    expect(issues[0]?.title).toContain('216 × 303');
  });

  test('file-size-vs-trim: archivo correcto (±0,5 mm) o formato automático no avisan', () => {
    const good = Array.from({ length: 8 }, (_, i) => pdfUnit(i, 216.3, 302.8, foot(i + 1)));
    expect(codesOf(makeProject(good, { trim: FIXED_A4, bleedMm: 3 }))).not.toContain('file-size-vs-trim');
    expect(codesOf(makeProject(a4Pages(8), { bleedMm: 3 }))).not.toContain('file-size-vs-trim');
  });

  test('low-resolution: aviso por debajo de 150 ppp, nota por debajo de 250', () => {
    const units = [
      imageUnit(0, 1000, 1414),
      imageUnit(1, 2000, 2828),
      imageUnit(2, 2480, 3508),
      imageUnit(3, 2480, 3508),
    ];
    const issues = issuesOf(makeProject(units, { trim: FIXED_A4 }), 'low-resolution');
    expect(issues.map((issue) => [issue.severity, issue.pageNumbers])).toEqual([
      ['warning', [1]],
      ['info', [2]],
    ]);
    expect(issues[0]?.detail).toContain('121 ppp');
  });

  test('low-resolution: ni con formato automático ni con PDF', () => {
    const images = Array.from({ length: 4 }, (_, i) => imageUnit(i, 500, 707));
    expect(codesOf(makeProject(images))).not.toContain('low-resolution');
    expect(codesOf(makeProject(a4Pages(4), { trim: FIXED_A4 }))).not.toContain('low-resolution');
  });
});

describe('modo de entrada', () => {
  test('unexpected-double-in-pages con arreglo set-input-mode: spreads, sin repetir orientación ni formato', () => {
    const project = makeProject(a4With(8, { 4: a4Spread(3, 4, 5) }));
    const [issue] = issuesOf(project, 'unexpected-double-in-pages');
    expect(issue).toMatchObject({ severity: 'warning', pageNumbers: [4], fix: { kind: 'set-input-mode', value: 'spreads' } });
    expect(codesOf(project)).not.toContain('orientation-mismatch');
    expect(codesOf(project)).not.toContain('size-mismatch');
  });

  test('sin dobles en modo páginas: nada', () => {
    expect(codesOf(makeProject(a4Pages(8)))).not.toContain('unexpected-double-in-pages');
  });

  test('pliegos de lectura: una simple en medio es nota; portada y contraportada sueltas no', () => {
    const units = [
      pdfUnit(0, 210, 297, foot(1)),
      a4Spread(1, 2, 3),
      pdfUnit(2, 210, 297, foot(4)),
      a4Spread(3, 5, 6),
      pdfUnit(4, 210, 297, foot(7)),
    ];
    const project = makeProject(units, { inputMode: 'spreads' });
    const issues = issuesOf(project, 'unexpected-single-in-spreads');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'info', pageNumbers: [4] });
  });

  test('pliegos de imprenta: cualquier simple es aviso', () => {
    const units = [a4Spread(0, null, null), pdfUnit(1, 210, 297), a4Spread(2, null, null), a4Spread(3, null, null)];
    const [issue] = issuesOf(makeProject(units, { inputMode: 'spreads', spreadKind: 'printer' }), 'unexpected-single-in-spreads');
    expect(issue?.severity).toBe('warning');
    expect(issue?.pageNumbers).toEqual([2, 7]);
  });

  test('spread-side-mismatch: cubierta envolvente sin declarar → error con arreglo set-wraparound-cover: true', () => {
    const units = [a4Spread(0, 8, 1), a4Spread(1, 2, 3), a4Spread(2, 4, 5), a4Spread(3, 6, 7)];
    const project = makeProject(units, { inputMode: 'spreads', wraparoundCover: false });
    const [issue] = issuesOf(project, 'spread-side-mismatch');
    expect(issue).toMatchObject({ severity: 'error', fix: { kind: 'set-wraparound-cover', value: true } });
    expect(issue?.pageNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const fixed = makeProject(units, { inputMode: 'spreads', wraparoundCover: true });
    expect(codesOf(fixed)).toEqual([]);
  });

  test('spread-side-mismatch en RTL: la cubierta envolvente sin declarar también se detecta', () => {
    const units = [a4Spread(0, 1, 8), a4Spread(1, 3, 2), a4Spread(2, 5, 4), a4Spread(3, 7, 6)];
    const config = { inputMode: 'spreads', readingDirection: 'rtl' } as const;
    const [issue] = issuesOf(makeProject(units, { ...config, wraparoundCover: false }), 'spread-side-mismatch');
    expect(issue).toMatchObject({ severity: 'error', fix: { kind: 'set-wraparound-cover', value: true } });
    expect(codesOf(makeProject(units, { ...config, wraparoundCover: true }))).toEqual([]);
  });

  test('cubierta envolvente con todo dobles: las mitades siempre cuadran, sin falso arreglo', () => {
    const units = [a4Spread(0, null, 1), a4Spread(1, 2, 3), a4Spread(2, 4, 5), a4Spread(3, 6, 7), a4Spread(4, 8, null)];
    expect(codesOf(makeProject(units, { inputMode: 'spreads', wraparoundCover: true }))).not.toContain(
      'spread-side-mismatch',
    );
  });

  test('spread-side-mismatch: un desajuste local no ofrece arreglo de configuración', () => {
    const units = [
      pdfUnit(0, 210, 297, foot(1)),
      a4Spread(1, 2, 3),
      a4Spread(2, 4, 5),
      a4Spread(3, 6, 7),
      a4Spread(4, 8, 9),
      pdfUnit(5, 210, 297, foot(10)),
      a4Spread(6, 11, 12),
      pdfUnit(7, 210, 297, foot(13)),
    ];
    const [issue] = issuesOf(makeProject(units, { inputMode: 'spreads' }), 'spread-side-mismatch');
    expect(issue?.pageNumbers).toEqual([11, 12]);
    expect(issue?.fix).toBeUndefined();
  });

  test('printer-sides-incomplete: 3 caras de 4 necesarias', () => {
    const units = [0, 1, 2].map((i) => a4Spread(i, null, null));
    const [issue] = issuesOf(makeProject(units, { inputMode: 'spreads', spreadKind: 'printer' }), 'printer-sides-incomplete');
    expect(issue?.severity).toBe('error');
    expect(issue?.title).toContain('Falta 1 cara');
    expect(issue?.pageNumbers).toEqual([4, 5]);
    expect(issue?.sheetIndexes).toEqual([1]);
  });

  test('printer-sides-incomplete: caras completas, nada; y no se repite como recuento impar', () => {
    const units = [0, 1, 2, 3].map((i) => a4Spread(i, null, null));
    const codes = codesOf(makeProject(units, { inputMode: 'spreads', spreadKind: 'printer', autoPadBlanks: false }));
    expect(codes).not.toContain('printer-sides-incomplete');
    expect(codes).not.toContain('page-count-not-multiple-of-4');
  });
});

describe('encuadernación', () => {
  const paper = { interiorGsm: 115, coverGsm: 250, interiorCaliperMm: 0.09, coverCaliperMm: 0.22 };

  test('saddle-stitch-too-thick por páginas (> 64), con arreglo set-binding: perfect-bound', () => {
    const [issue] = issuesOf(makeProject(a4Pages(68), { paper }), 'saddle-stitch-too-thick');
    expect(issue).toMatchObject({ severity: 'warning', fix: { kind: 'set-binding', value: 'perfect-bound' } });
  });

  test('saddle-stitch-too-thick por lomo (> 6 mm)', () => {
    const thick = { ...paper, interiorCaliperMm: 0.3 };
    expect(codesOf(makeProject(a4Pages(48), { paper: thick }))).toContain('saddle-stitch-too-thick');
  });

  test('64 páginas con papel normal: se puede grapar', () => {
    expect(codesOf(makeProject(a4Pages(64), { paper }))).not.toContain('saddle-stitch-too-thick');
  });

  test('creep ≥ 1 mm: nota señalando el pliego central', () => {
    const [issue] = issuesOf(makeProject(a4Pages(52), { paper }), 'creep');
    expect(issue).toMatchObject({ severity: 'info', sheetIndexes: [12] });
    expect(codesOf(makeProject(a4Pages(48), { paper }))).not.toContain('creep');
  });

  test('spine-too-thin en lomo cuadrado con arreglo set-binding: saddle-stitch', () => {
    const [issue] = issuesOf(makeProject(a4Pages(16), { binding: 'perfect-bound', paper }), 'spine-too-thin');
    expect(issue).toMatchObject({ severity: 'warning', fix: { kind: 'set-binding', value: 'saddle-stitch' } });
    expect(codesOf(makeProject(a4Pages(100), { binding: 'perfect-bound', paper }))).not.toContain('spine-too-thin');
    expect(codesOf(makeProject(a4Pages(16), { paper }))).not.toContain('spine-too-thin');
  });

  test('signature-remainder: tripa de 36 en cuadernillos de 16 → último de 4 (páginas 35–38)', () => {
    const project = makeProject(a4Pages(40), { binding: 'perfect-bound', signaturePages: 16, separateCover: true });
    const [issue] = issuesOf(project, 'signature-remainder');
    expect(issue).toMatchObject({ severity: 'info', pageNumbers: [35, 36, 37, 38] });
    expect(issue?.title).toContain('4 páginas');
  });

  test('signature-remainder: cuadernillos completos o grapada, nada', () => {
    expect(codesOf(makeProject(a4Pages(36), { binding: 'perfect-bound', signaturePages: 16 }))).not.toContain(
      'signature-remainder',
    );
    expect(codesOf(makeProject(a4Pages(40), { signaturePages: 16 }))).not.toContain('signature-remainder');
  });
});

describe('orden, ids y robustez', () => {
  test('ordenadas error → aviso → nota y, dentro de cada grupo, por página', () => {
    const units = a4With(10, { 3: pdfUnit(2, 297, 210, foot(3)), 8: pdfUnit(7, 210, 297, foot(80)) });
    const issues = makeProject(units, { declaredPageCount: 12 }).issues;
    const rank = { error: 0, warning: 1, info: 2 };
    for (let i = 1; i < issues.length; i += 1) {
      const a = issues[i - 1];
      const b = issues[i];
      if (!a || !b) continue;
      expect(rank[a.severity]).toBeLessThanOrEqual(rank[b.severity]);
      if (a.severity === b.severity) expect(a.pageNumbers[0] ?? 0).toBeLessThanOrEqual(b.pageNumbers[0] ?? 0);
    }
    expect(issues.map((issue) => issue.severity)).toContain('error');
    expect(issues.map((issue) => issue.severity)).toContain('warning');
    expect(issues.map((issue) => issue.severity)).toContain('info');
  });

  test('ids estables entre recomputaciones, únicos y con código + páginas', () => {
    const units = a4With(8, { 5: pdfUnit(4, 210, 297, foot(50)) });
    const first = makeProject(units).issues;
    const second = makeProject(units).issues;
    expect(first.map((issue) => issue.id)).toEqual(second.map((issue) => issue.id));
    expect(new Set(first.map((issue) => issue.id)).size).toBe(first.length);
    expect(first.find((issue) => issue.code === 'folio-out-of-order')?.id).toBe('folio-out-of-order:5');
  });

  test('sheetIndexes coinciden con la imposición de cada página señalada', () => {
    const project = makeProject(a4With(16, { 9: pdfUnit(8, 297, 210, foot(9)) }));
    for (const issue of project.issues) {
      const expected = [...new Set(issue.pageNumbers.map((n) => project.imposition.placements[n - 1]?.sheetIndex))];
      for (const sheet of expected) expect(issue.sheetIndexes).toContain(sheet as number);
    }
  });

  test('datos raros no lanzan: medidas nulas, NaN, una sola página, proporciones absurdas', () => {
    const weird: SourceUnit[] = [
      makeUnit(0, { width: 0, height: 0 }),
      makeUnit(1, { width: Number.NaN, height: 100, widthMm: Number.NaN, heightMm: 3 }),
      makeUnit(2, { width: 100000, height: 1 }),
      makeUnit(3, { widthMm: -5, heightMm: 0, folios: [{ value: Number.NaN, x: 2, y: -1 }] }),
    ];
    for (const inputMode of ['pages', 'spreads'] as const) {
      for (const spreadKind of ['reader', 'printer'] as const) {
        expect(() => makeProject(weird, { inputMode, spreadKind, trim: FIXED_A4, bleedMm: 3 })).not.toThrow();
        expect(() => makeProject(weird.slice(0, 1), { inputMode, spreadKind, declaredPageCount: 3 })).not.toThrow();
      }
    }
  });

  test('entradas incoherentes (páginas sin aplicar cortesías, imposición de otro tamaño) no lanzan', () => {
    const config = makeConfig();
    const units = a4Pages(6);
    const pages: Page[] = buildPages(units, config);
    const input = {
      config,
      units,
      pages,
      effectivePages: [],
      imposition: computeImposition(4, config),
      trim: { widthMm: 210, heightMm: 297 },
    };
    expect(() => validateProject(input)).not.toThrow();
    const padded = applyPadding(pages, config);
    expect(() => validateProject({ ...input, effectivePages: padded, units: [] })).not.toThrow();
  });
});
