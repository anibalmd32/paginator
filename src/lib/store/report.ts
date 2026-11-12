import { buildReport, reportToJson, reportToMarkdown } from '@/lib/imposition';
import type { PreflightReport } from '@/lib/types';

import { selectDerived } from './derived';
import { useProjectStore } from './project';

export function buildCurrentReport(): PreflightReport {
  const state = useProjectStore.getState();
  const derived = selectDerived(state);
  return buildReport({
    config: state.config,
    units: state.units,
    pages: state.pages,
    effectivePages: derived.effectivePages,
    imposition: derived.imposition,
    trim: derived.trim,
    issues: derived.issues,
    generatedAt: new Date().toISOString(),
  });
}

export function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'revista';
}

export function downloadText(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ReportFormat = 'markdown' | 'json';

export function downloadCurrentReport(format: ReportFormat): string {
  const report = buildCurrentReport();
  const base = `prevuelo-${slugify(report.title)}`;
  if (format === 'json') {
    const fileName = `${base}.json`;
    downloadText(fileName, reportToJson(report), 'application/json');
    return fileName;
  }
  const fileName = `${base}.md`;
  downloadText(fileName, reportToMarkdown(report), 'text/markdown');
  return fileName;
}
