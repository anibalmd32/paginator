import { describe, expect, test } from 'bun:test';

import type { Issue, MagazineConfig, PreflightReport } from '@/lib/types';

import { buildReport, reportToJson, reportToMarkdown, verdictOf } from './report';
import { a4Pages, a4Spread, makeProject, pdfUnit } from './testkit';
import type { Project } from './testkit';

const GENERATED_AT = '2026-11-11T09:30:00.000Z';

function issue(severity: Issue['severity'], code: Issue['code'] = 'creep'): Issue {
  return { id: `${code}:${severity}`, code, severity, title: 't', detail: 'd', pageNumbers: [], sheetIndexes: [] };
}

function reportOf(project: Project): PreflightReport {
  return buildReport({ ...project, generatedAt: GENERATED_AT });
}

describe('verdictOf', () => {
  test('sin incidencias o solo notas: ok', () => {
    expect(verdictOf([])).toBe('ok');
    expect(verdictOf([issue('info'), issue('info')])).toBe('ok');
  });

  test('algún aviso sin errores: warnings', () => {
    expect(verdictOf([issue('info'), issue('warning')])).toBe('warnings');
  });

  test('un solo error manda, esté donde esté', () => {
    expect(verdictOf([issue('warning'), issue('info'), issue('error')])).toBe('errors');
  });
});

describe('buildReport', () => {
  test('6 páginas en grapada: recuentos, cortesías, lomo y una fila por página con su pliego', () => {
    const project = makeProject(a4Pages(6), { title: 'Boletín de otoño' });
    const report = reportOf(project);

    expect(report).toMatchObject({
      generatedAt: GENERATED_AT,
      title: 'Boletín de otoño',
      verdict: 'ok',
      suppliedPageCount: 6,
      pageCount: 8,
      blankPageNumbers: [6, 7],
      sheetCount: 2,
      signatureCount: 1,
      trim: { widthMm: 210, heightMm: 297 },
    });
    expect(report.spine).toEqual({ widthMm: 0.62, interiorLeaves: 2, coverLeaves: 2, creepMm: 0.09 });
    expect(report.issues.map((i) => i.code)).toEqual(['blank-pages-added']);
    expect(report.sheets).toBe(project.imposition.sheets);

    expect(report.pages.map((row) => [row.pageNumber, row.sheetNumber, row.face, row.position])).toEqual([
      [1, 1, 'front', 'right'],
      [2, 1, 'back', 'left'],
      [3, 2, 'front', 'right'],
      [4, 2, 'back', 'left'],
      [5, 2, 'back', 'right'],
      [6, 2, 'front', 'left'],
      [7, 1, 'back', 'right'],
      [8, 1, 'front', 'left'],
    ]);
    expect(report.pages[0]).toMatchObject({ source: 'archivo · p. 1', origin: 'file', issues: [] });
    expect(report.pages[5]).toMatchObject({ source: 'Blanca de cortesía', origin: 'auto-blank', issues: ['info'] });
    expect(report.pages[7]?.source).toBe('archivo · p. 6');
  });

  test('pliegos de lectura: la fila nombra la mitad del archivo', () => {
    const units = [pdfUnit(0, 210, 297), a4Spread(1, 2, 3), pdfUnit(2, 210, 297), pdfUnit(3, 210, 297)];
    const report = reportOf(makeProject(units, { inputMode: 'spreads' }));
    expect(report.pages[1]?.source).toBe('archivo · p. 2 · mitad izquierda');
    expect(report.pages[2]?.source).toBe('archivo · p. 2 · mitad derecha');
  });

  test('las gravedades de cada página van ordenadas: error, aviso, nota', () => {
    const project = makeProject(a4Pages(8));
    const issues: Issue[] = [
      { ...issue('info'), pageNumbers: [3] },
      { ...issue('error', 'declared-count-mismatch'), pageNumbers: [3] },
      { ...issue('warning', 'size-mismatch'), pageNumbers: [3, 4] },
    ];
    const report = buildReport({ ...project, issues, generatedAt: GENERATED_AT });
    expect(report.verdict).toBe('errors');
    expect(report.pages[2]?.issues).toEqual(['error', 'warning', 'info']);
    expect(report.pages[3]?.issues).toEqual(['warning']);
  });

  test('lomo cuadrado con cubierta aparte: cuenta cuadernillos y cubierta', () => {
    const report = reportOf(makeProject(a4Pages(40), { binding: 'perfect-bound', signaturePages: 16 }));
    expect(report.signatureCount).toBe(4);
    expect(report.sheetCount).toBe(10);
  });

  test('sin páginas no lanza: todas las posiciones de la previsión salen en blanco', () => {
    const report = reportOf(makeProject([]));
    expect(report.suppliedPageCount).toBe(0);
    expect(report.blankPageNumbers).toEqual([1, 2, 3, 4]);
    expect(report.issues.map((i) => i.code)).toEqual(['no-pages']);
  });
});

describe('reportToMarkdown', () => {
  test('lleva título, veredicto, resumen, la tabla de pliegos y la de incidencias', () => {
    const units = a4Pages(8).map((unit, i) => (i === 4 ? pdfUnit(4, 210, 297, [{ value: 50, x: 0.5, y: 0.96 }]) : unit));
    const project = makeProject(units, { title: 'Revista | Nº 3' });
    const markdown = reportToMarkdown(reportOf(project));

    expect(markdown).toContain('# Reporte de pre-vuelo · Revista | Nº 3');
    expect(markdown).toContain('**Veredicto:** Revisar avisos antes de enviar');
    expect(markdown).toContain('Generado el 2026-11-11 09:30 UTC.');
    expect(markdown).toContain('210 × 297');
    expect(markdown).toContain('(A4)');
    expect(markdown).toContain('grapada a caballo');

    expect(markdown).toContain('## Pliegos');
    expect(markdown).toContain('| Pliego | Parte | Cara | Retiro |');
    expect(markdown).toContain('| 1 | cubierta | 8 · 1 | 2 · 7 |');
    expect(markdown).toContain('| 2 | tripa | 6 · 3 | 4 · 5 |');

    expect(markdown).toContain('## Incidencias');
    expect(markdown).toContain('0 errores, 1 aviso y 0 notas.');
    expect(markdown).toContain('| Aviso | La página 5 lleva el folio 50 | 5 |');

    expect(markdown).toContain('## Páginas');
    expect(markdown).toContain('| 5 | archivo · p. 5 | 2 | retiro, derecha | Aviso |');
  });

  test('sin incidencias lo dice; las barras verticales de los textos no rompen las tablas', () => {
    const project = makeProject(a4Pages(4));
    const clean = reportToMarkdown(reportOf(project));
    expect(clean).toContain('**Veredicto:** Listo para imprenta');
    expect(clean).toContain('Sin incidencias.');

    const tricky: Issue = { ...issue('error', 'no-pages'), title: 'a | b', detail: 'línea 1\nlínea 2' };
    const markdown = reportToMarkdown(buildReport({ ...project, issues: [tricky], generatedAt: GENERATED_AT }));
    expect(markdown).toContain('| Error | a \\| b | — | línea 1 línea 2 |');
    expect(markdown).toContain('**Veredicto:** No enviar: hay errores que corregir');
  });

  test('lomo cuadrado y RTL: cuadernillos, cubierta aparte y sentido de lectura', () => {
    const report = reportOf(
      makeProject(a4Pages(12), { binding: 'perfect-bound', signaturePages: 4, readingDirection: 'rtl' }),
    );
    const markdown = reportToMarkdown(report);
    expect(markdown).toContain('lomo cuadrado, cuadernillos de 4 páginas, cubierta aparte');
    expect(markdown).toContain('derecha a izquierda');
    expect(markdown).toContain('| 1 | cubierta | 1 · 12 | 11 · 2 |');
    expect(markdown).toContain('| 3 | cuadernillo 2 | 7 · 10 | 9 · 8 |');
    expect(markdown).toContain('| 2 | cuadernillo 1 | 3 · 6 | 5 · 4 |');
  });
});

describe('reportToJson', () => {
  test('JSON con sangría que vuelve al mismo reporte', () => {
    const report = reportOf(makeProject(a4Pages(6)));
    const json = reportToJson(report);
    expect(json).toContain('\n  "generatedAt": "2026-11-11T09:30:00.000Z"');
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(report)));
  });

  test('omite archivos y binarios aunque alguien los cuelgue de la configuración', () => {
    const report = reportOf(makeProject(a4Pages(4)));
    const polluted = {
      ...report,
      config: {
        ...report.config,
        file: new File(['contenido'], 'revista.pdf'),
        bytes: new Uint8Array([1, 2, 3]),
      } as MagazineConfig,
    };
    const parsed = JSON.parse(reportToJson(polluted)) as { config: Record<string, unknown> };
    expect(parsed.config['file']).toBeUndefined();
    expect(parsed.config['bytes']).toBeUndefined();
    expect(parsed.config['title']).toBe('Revista sin título');
  });
});
