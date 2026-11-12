import type {
  BindingType,
  Issue,
  IssueSeverity,
  Page,
  PreflightReport,
  PreflightVerdict,
  ReportPageRow,
  SheetFace,
  SheetImposition,
  SlotPosition,
  SourceUnit,
} from '@/lib/types';

import { findTrimPreset } from './defaults';
import { interiorSignatureNumber } from './imposition';
import { formatMm, formatNumberList, formatSizeMm, plural } from './format';
import { estimateSpine } from './geometry';
import { countSuppliedPages } from './validation';
import type { ValidationInput } from './validation';

const SEVERITY_RANK: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

const SEVERITY_LABEL: Record<IssueSeverity, string> = { error: 'Error', warning: 'Aviso', info: 'Nota' };

const VERDICT_LABEL: Record<PreflightVerdict, string> = {
  ok: 'Listo para imprenta',
  warnings: 'Revisar avisos antes de enviar',
  errors: 'No enviar: hay errores que corregir',
};

const BINDING_LABEL: Record<BindingType, string> = {
  'saddle-stitch': 'grapada a caballo',
  'perfect-bound': 'lomo cuadrado',
};

const FACE_LABEL: Record<SheetFace, string> = { front: 'cara', back: 'retiro' };
const POSITION_LABEL: Record<SlotPosition, string> = { left: 'izquierda', right: 'derecha' };

export function verdictOf(issues: Issue[]): PreflightVerdict {
  let verdict: PreflightVerdict = 'ok';
  for (const issue of issues) {
    if (issue.severity === 'error') return 'errors';
    if (issue.severity === 'warning') verdict = 'warnings';
  }
  return verdict;
}

function sourceLabel(page: Page, unit: SourceUnit | null): string {
  if (page.origin === 'auto-blank') return 'Blanca de cortesía';
  if (page.origin === 'manual-blank') return 'Blanca insertada a mano';
  if (!unit) return 'Archivo no disponible';
  if (page.half === 'left') return `${unit.label} · mitad izquierda`;
  if (page.half === 'right') return `${unit.label} · mitad derecha`;
  return unit.label;
}

export function buildReport(input: ValidationInput & { issues: Issue[]; generatedAt: string }): PreflightReport {
  const { config, imposition, issues } = input;
  const unitById = new Map(input.units.map((unit) => [unit.id, unit]));
  const finalPages = input.effectivePages.length > 0 ? input.effectivePages : input.pages;

  const severitiesByPage = new Map<number, IssueSeverity[]>();
  for (const issue of issues) {
    for (const pageNumber of issue.pageNumbers) {
      const list = severitiesByPage.get(pageNumber);
      if (list) list.push(issue.severity);
      else severitiesByPage.set(pageNumber, [issue.severity]);
    }
  }

  const pages: ReportPageRow[] = [];
  const blankPageNumbers: number[] = [];
  for (const placement of imposition.placements) {
    const page = finalPages[placement.pageNumber - 1];
    const unit = page && page.unitId !== null ? (unitById.get(page.unitId) ?? null) : null;
    if (!page || page.unitId === null) blankPageNumbers.push(placement.pageNumber);
    pages.push({
      pageNumber: placement.pageNumber,
      source: page ? sourceLabel(page, unit) : 'Blanca de cortesía',
      origin: page ? page.origin : 'auto-blank',
      sheetNumber: placement.sheetIndex + 1,
      face: placement.face,
      position: placement.position,
      signature: placement.signature,
      issues: (severitiesByPage.get(placement.pageNumber) ?? []).sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b]),
    });
  }

  return {
    generatedAt: input.generatedAt,
    title: config.title,
    verdict: verdictOf(issues),
    config,
    trim: input.trim,
    suppliedPageCount: countSuppliedPages(input.pages),
    pageCount: imposition.pageCount,
    blankPageNumbers,
    sheetCount: imposition.sheets.length,
    signatureCount: imposition.signatures.length,
    spine: estimateSpine(imposition.pageCount, config),
    issues,
    sheets: imposition.sheets,
    pages,
  };
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ];
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function signatureSummary(report: PreflightReport): string {
  const separateCover = interiorSignatureNumber(report.sheets, report.config.binding, 0) === null;
  const interior = report.signatureCount - (separateCover ? 1 : 0);
  const text = `${String(interior)} ${plural(interior, 'cuadernillo', 'cuadernillos')}`;
  return separateCover ? `cubierta + ${text}` : text;
}

function sheetRoleLabel(sheet: SheetImposition, binding: BindingType, sheets: readonly SheetImposition[]): string {
  if (sheet.role === 'cover') return 'cubierta';
  return binding === 'saddle-stitch' ? 'tripa' : `cuadernillo ${String(interiorSignatureNumber(sheets, binding, sheet.signature) ?? sheet.signature + 1)}`;
}

function inputLabel(report: PreflightReport): string {
  const { config } = report;
  if (config.inputMode === 'pages') return 'páginas sueltas';
  if (config.spreadKind === 'printer') return 'pliegos de imprenta (ya impuestos)';
  return config.wraparoundCover ? 'pliegos de lectura con cubierta envolvente' : 'pliegos de lectura';
}

export function reportToMarkdown(report: PreflightReport): string {
  const { config, spine } = report;
  const preset = findTrimPreset(report.trim);
  const blanks = report.blankPageNumbers.length;
  const count = (severity: IssueSeverity): number => report.issues.filter((issue) => issue.severity === severity).length;
  const errors = count('error');
  const warnings = count('warning');
  const infos = count('info');

  const binding =
    config.binding === 'saddle-stitch'
      ? BINDING_LABEL[config.binding]
      : `${BINDING_LABEL[config.binding]}, cuadernillos de ${String(config.signaturePages)} páginas, ` +
        (config.separateCover ? 'cubierta aparte' : 'sin cubierta aparte');

  const lines: string[] = [
    `# Reporte de pre-vuelo · ${report.title}`,
    '',
    `**Veredicto:** ${VERDICT_LABEL[report.verdict]}`,
    '',
    `Generado el ${formatTimestamp(report.generatedAt)}.`,
    '',
    '## Resumen',
    '',
    `- **Entrada:** ${inputLabel(report)}`,
    `- **Páginas:** ${String(report.pageCount)} impuestas (${String(report.suppliedPageCount)} aportadas` +
      (blanks > 0 ? `, ${String(blanks)} en blanco: ${formatNumberList(report.blankPageNumbers)}` : '') +
      ')',
    `- **Formato de corte:** ${formatSizeMm(report.trim)}${preset ? ` (${preset.label})` : ''}` +
      (config.trim.mode === 'auto' ? ', deducido de los archivos' : ''),
    `- **Sangrado:** ${formatMm(config.bleedMm)} · **Marcas:** ${formatMm(config.marksMm)} · **Zona segura:** ${formatMm(config.safeMarginMm)}`,
    `- **Encuadernación:** ${binding}`,
    `- **Lectura:** ${config.readingDirection === 'rtl' ? 'derecha a izquierda' : 'izquierda a derecha'}`,
    `- **Pliegos:** ${String(report.sheetCount)} ${plural(report.sheetCount, 'pliego', 'pliegos')} en ${signatureSummary(report)}`,
    `- **Papel:** tripa ${String(config.paper.interiorGsm)} g (${formatMm(config.paper.interiorCaliperMm, 3)}) · ` +
      `cubierta ${String(config.paper.coverGsm)} g (${formatMm(config.paper.coverCaliperMm, 3)})`,
    `- **Lomo estimado:** ${formatMm(spine.widthMm)} (${String(spine.interiorLeaves)} hojas de tripa y ` +
      `${String(spine.coverLeaves)} de cubierta)` +
      (spine.creepMm > 0 ? ` · desplazamiento del pliego central: ${formatMm(spine.creepMm)}` : ''),
    '',
    '## Incidencias',
    '',
  ];

  if (report.issues.length === 0) {
    lines.push('Sin incidencias.');
  } else {
    lines.push(
      `${String(errors)} ${plural(errors, 'error', 'errores')}, ${String(warnings)} ${plural(warnings, 'aviso', 'avisos')} y ` +
        `${String(infos)} ${plural(infos, 'nota', 'notas')}.`,
      '',
      ...table(
        ['Gravedad', 'Incidencia', 'Páginas', 'Qué hacer'],
        report.issues.map((issue) => [
          SEVERITY_LABEL[issue.severity],
          issue.title,
          issue.pageNumbers.length > 0 ? formatNumberList(issue.pageNumbers) : '—',
          issue.detail,
        ]),
      ),
    );
  }

  lines.push(
    '',
    '## Pliegos',
    '',
    'Cada pliego lleva 4 páginas: la cara es el exterior del pliego doblado y el retiro el interior, ' +
      'ambos tal como se ven de frente (izquierda | derecha).',
    '',
    ...table(
      ['Pliego', 'Parte', 'Cara', 'Retiro'],
      report.sheets.map((sheet) => [
        String(sheet.number),
        sheetRoleLabel(sheet, config.binding, report.sheets),
        `${String(sheet.front.left)} · ${String(sheet.front.right)}`,
        `${String(sheet.back.left)} · ${String(sheet.back.right)}`,
      ]),
    ),
    '',
    '## Páginas',
    '',
    ...table(
      ['Página', 'Origen', 'Pliego', 'Lado', 'Incidencias'],
      report.pages.map((row) => [
        String(row.pageNumber),
        row.source,
        String(row.sheetNumber),
        `${FACE_LABEL[row.face]}, ${POSITION_LABEL[row.position]}`,
        row.issues.length > 0 ? [...new Set(row.issues)].map((severity) => SEVERITY_LABEL[severity]).join(', ') : '—',
      ]),
    ),
    '',
  );
  return lines.join('\n');
}

function isBinary(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

export function reportToJson(report: PreflightReport): string {
  return JSON.stringify(report, (_key, value: unknown) => (isBinary(value) ? undefined : value), 2);
}
