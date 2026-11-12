import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

import { buildCurrentReport, useProjectStore } from '@/lib/store';
import type { IssueSeverity, PreflightReport } from '@/lib/types';

import { BINDING_TEXT, countText, decimal, FACE_TEXT, joinPhrase, mm, POSITION_LONG, reportDate, SEVERITY_LABEL, SEVERITY_ORDER, slotLetter, verdictNotes, verdictSentence } from './labels';
import styles from './PrintableReport.module.css';

const IDLE_MS = 600;

function countsOf(report: PreflightReport) {
  return {
    errors: report.issues.filter((issue) => issue.severity === 'error').length,
    warnings: report.issues.filter((issue) => issue.severity === 'warning').length,
    infos: report.issues.filter((issue) => issue.severity === 'info').length,
  };
}

function safeBuild(): PreflightReport | null {
  try {
    return useProjectStore.getState().pages.length > 0 ? buildCurrentReport() : null;
  } catch (error) {
    console.error('No se pudo preparar el reporte imprimible.', error);
    return null;
  }
}

export function PrintableReport() {
  const [report, setReport] = useState<PreflightReport | null>(null);

  useEffect(() => {
    let timer: number | null = null;
    const schedule = (): void => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        setReport(safeBuild());
      }, IDLE_MS);
    };
    schedule();
    const unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.pages !== previous.pages || state.config !== previous.config || state.units !== previous.units) schedule();
    });
    const onBeforePrint = (): void => {
      flushSync(() => setReport(safeBuild()));
    };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      unsubscribe();
      window.removeEventListener('beforeprint', onBeforePrint);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return (
    <article className={styles.report} data-printable-report="" aria-hidden="true">
      {report ? <ReportBody report={report} /> : <p>No hay páginas cargadas: el reporte de pre-vuelo está vacío.</p>}
    </article>
  );
}

function severityText(severities: readonly IssueSeverity[]): string {
  if (severities.length === 0) return '—';
  return SEVERITY_ORDER.filter((severity) => severities.includes(severity))
    .map((severity) => {
      const count = severities.filter((item) => item === severity).length;
      return countText(count, SEVERITY_LABEL[severity].one, SEVERITY_LABEL[severity].many);
    })
    .join(', ');
}

function ReportBody({ report }: { report: PreflightReport }) {
  const { config, spine } = report;
  const counts = countsOf(report);
  const notes = verdictNotes(counts);
  const blanks = report.blankPageNumbers.length;
  const interiorSignatures = new Set(report.sheets.filter((sheet) => sheet.role === 'interior').map((sheet) => sheet.signature)).size;
  const bindingDetail =
    config.binding === 'perfect-bound'
      ? `${BINDING_TEXT[config.binding]} · cuadernillos de ${config.signaturePages} págs.${config.separateCover ? ' · cubierta aparte' : ''}`
      : BINDING_TEXT[config.binding];

  const facts: [string, string][] = [
    ['Formato', `${decimal(report.trim.widthMm)} × ${decimal(report.trim.heightMm)} mm`],
    ['Encuadernación', bindingDetail],
    ['Lectura', config.readingDirection === 'rtl' ? 'De derecha a izquierda' : 'De izquierda a derecha'],
    ['Páginas', `${report.pageCount}${blanks > 0 ? ` (${report.suppliedPageCount} aportadas + ${countText(blanks, 'blanca', 'blancas')})` : ''}`],
    ['Pliegos', String(report.sheetCount)],
    ['Cuadernillos', `${interiorSignatures}${report.signatureCount > interiorSignatures ? ' + cubierta' : ''}`],
    ['Lomo', `${mm(spine.widthMm)} (${spine.interiorLeaves} hojas de tripa${spine.creepMm > 0 ? ` · desplazamiento central ${mm(spine.creepMm, 2)}` : ''})`],
    ['Papel', `Tripa ${config.paper.interiorGsm} g/m² (${mm(config.paper.interiorCaliperMm, 3)}) · cubierta ${config.paper.coverGsm} g/m² (${mm(config.paper.coverCaliperMm, 3)})`],
    ['Sangrado y marcas', `${mm(config.bleedMm)} de sangrado · ${config.marksMm > 0 ? `${mm(config.marksMm)} de marcas` : 'sin marcas'} · zona segura ${mm(config.safeMarginMm)}`],
  ];

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>{report.title || 'Trabajo sin título'}</h1>
        <p className={styles.date}>Reporte de pre-vuelo de Paginator, generado el {reportDate(report.generatedAt)}</p>
      </header>

      <section className={styles.section}>
        <h2>Veredicto</h2>
        <p className={styles.verdict}>
          {verdictSentence(report.verdict, counts)}
          {notes ? ` (${notes})` : ''}.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Datos del trabajo</h2>
        <dl className={styles.facts}>
          {facts.map(([term, value]) => (
            <div key={term} className={styles.fact}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.section}>
        <h2>Incidencias</h2>
        {report.issues.length === 0 ? (
          <p>Sin incidencias. Se han comprobado múltiplos de 4, orden y repetición de folios, tamaños y orientación, lados del lomo, resolución y grosor.</p>
        ) : (
          <ol className={styles.issues}>
            {report.issues.map((issue) => (
              <li key={issue.id} className={styles.issue}>
                <p className={styles.issueTitle}>
                  <span className={styles.severity}>{SEVERITY_LABEL[issue.severity].one}</span> {issue.title}
                </p>
                <p>{issue.detail}</p>
                {issue.pageNumbers.length > 0 && (
                  <p className={styles.issuePages}>
                    {issue.pageNumbers.length === 1 ? 'Página' : 'Páginas'}: {joinPhrase(issue.pageNumbers.map(String))}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.section}>
        <h2>Pliegos</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Pliego</th>
              <th scope="col">Cuadernillo</th>
              <th scope="col">Cara A | B</th>
              <th scope="col">Retiro C | D</th>
            </tr>
          </thead>
          <tbody>
            {report.sheets.map((sheet) => (
              <tr key={sheet.index}>
                <td className={styles.num}>{sheet.number}</td>
                <td>{sheet.role === 'cover' ? 'Cubierta' : config.binding === 'saddle-stitch' ? 'Tripa' : `Cuadernillo ${sheet.signature + (report.signatureCount > interiorSignatures ? 0 : 1)}`}</td>
                <td className={styles.num}>
                  {sheet.front.left} | {sheet.front.right}
                </td>
                <td className={styles.num}>
                  {sheet.back.left} | {sheet.back.right}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <h2>Páginas</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Página</th>
              <th scope="col">Origen</th>
              <th scope="col">Pliego</th>
              <th scope="col">Cara o retiro</th>
              <th scope="col">Lado</th>
              <th scope="col">Incidencias</th>
            </tr>
          </thead>
          <tbody>
            {report.pages.map((row) => (
              <tr key={row.pageNumber}>
                <td className={styles.num}>{row.pageNumber}</td>
                <td>{row.source}</td>
                <td className={styles.num}>{row.sheetNumber}</td>
                <td>
                  {FACE_TEXT[row.face]} ({slotLetter(row.face, row.position)})
                </td>
                <td>{POSITION_LONG[row.position]}</td>
                <td>{severityText(row.issues)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
