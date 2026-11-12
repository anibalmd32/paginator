import type { FolioHit, Issue, IssueCode, MagazineConfig, Page, SheetImposition, SourceUnit } from '@/lib/types';

import { DEFAULT_CONFIG } from './defaults';
import { resolveTrim } from './geometry';
import { computeImposition, paddedPageCount } from './imposition';
import { applyPadding, buildPages } from './segmentation';
import { validateProject } from './validation';
import type { ValidationInput } from './validation';

const PT_PER_MM = 72 / 25.4;

export function makeConfig(overrides: Partial<MagazineConfig> = {}): MagazineConfig {
  return { ...DEFAULT_CONFIG, paper: { ...DEFAULT_CONFIG.paper }, ...overrides };
}

export function makeUnit(order: number, overrides: Partial<SourceUnit> = {}): SourceUnit {
  return {
    id: `u${String(order)}`,
    assetId: 'asset',
    indexInAsset: order,
    order,
    label: `archivo · p. ${String(order + 1)}`,
    width: 1000,
    height: 1414,
    widthMm: null,
    heightMm: null,
    filenameNumber: null,
    folios: [],
    ...overrides,
  };
}

export function pdfUnit(order: number, widthMm: number, heightMm: number, folios: FolioHit[] = []): SourceUnit {
  return makeUnit(order, { width: widthMm * PT_PER_MM, height: heightMm * PT_PER_MM, widthMm, heightMm, folios });
}

export function imageUnit(order: number, width: number, height: number, filenameNumber: number | null = null): SourceUnit {
  return makeUnit(order, { width, height, filenameNumber, label: `pag_${String(order + 1).padStart(3, '0')}.png` });
}

export function a4Pages(count: number): SourceUnit[] {
  return Array.from({ length: count }, (_, index) => pdfUnit(index, 210, 297, [{ value: index + 1, x: 0.5, y: 0.96 }]));
}

export function a4Spread(order: number, leftFolio: number | null, rightFolio: number | null): SourceUnit {
  const folios: FolioHit[] = [];
  if (leftFolio !== null) folios.push({ value: leftFolio, x: 0.05, y: 0.96 });
  if (rightFolio !== null) folios.push({ value: rightFolio, x: 0.95, y: 0.96 });
  return pdfUnit(order, 420, 297, folios);
}

export interface Project extends ValidationInput {
  issues: Issue[];
}

export function makeProject(
  units: SourceUnit[],
  overrides: Partial<MagazineConfig> = {},
  arrange: (pages: Page[]) => Page[] = (pages) => pages,
): Project {
  const config = makeConfig(overrides);
  const pages = arrange(buildPages(units, config));
  const effectivePages = pages.length > 0 ? applyPadding(pages, config) : [];
  const imposition = computeImposition(paddedPageCount(effectivePages.length), config);
  const trim = resolveTrim(config, units, pages);
  const input: ValidationInput = { config, units, pages, effectivePages, imposition, trim };
  return { ...input, issues: validateProject(input) };
}

export function issuesOf(project: Project, code: IssueCode): Issue[] {
  return project.issues.filter((issue) => issue.code === code);
}

export function codesOf(project: Project): IssueCode[] {
  return project.issues.map((issue) => issue.code);
}

export function sheetNotation(sheets: readonly SheetImposition[]): string {
  return sheets
    .map(
      (sheet) =>
        `${String(sheet.front.left)}|${String(sheet.front.right)} ${String(sheet.back.left)}|${String(sheet.back.right)}`,
    )
    .join(' / ');
}
