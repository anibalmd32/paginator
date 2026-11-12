import {
  applyPadding,
  computeImposition,
  estimateSpine,
  paddedPageCount,
  resolveTrim,
  validateProject,
  verdictOf,
} from '@/lib/imposition';
import type {
  ImpositionResult,
  Issue,
  IssueSeverity,
  MagazineConfig,
  Page,
  PreflightVerdict,
  SourceUnit,
  SpineEstimate,
  TrimSize,
} from '@/lib/types';

export const PREVIEW_PAGE_COUNT = 16;

export interface IssueCounts {
  errors: number;
  warnings: number;
  infos: number;
}

export interface Derived {
  hasPages: boolean;
  effectivePages: Page[];
  suppliedPageCount: number;
  pageCount: number;
  blankPageNumbers: number[];
  trim: TrimSize;
  imposition: ImpositionResult;
  spine: SpineEstimate;
  issues: Issue[];
  counts: IssueCounts;
  verdict: PreflightVerdict;
  unitsById: ReadonlyMap<string, SourceUnit>;
  issuesByPage: ReadonlyMap<number, Issue[]>;
  issuesBySheet: ReadonlyMap<number, Issue[]>;
  worstByPage: ReadonlyMap<number, IssueSeverity>;
  worstBySheet: ReadonlyMap<number, IssueSeverity>;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { error: 3, warning: 2, info: 1 };

export function worseSeverity(a: IssueSeverity | undefined, b: IssueSeverity): IssueSeverity {
  return a && SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function pushTo<K>(map: Map<K, Issue[]>, key: K, issue: Issue): void {
  const list = map.get(key);
  if (list) list.push(issue);
  else map.set(key, [issue]);
}

export function computeDerived(config: MagazineConfig, units: SourceUnit[], pages: Page[]): Derived {
  const hasPages = pages.length > 0;
  const effectivePages = hasPages ? applyPadding(pages, config) : [];
  const pageCount = hasPages
    ? paddedPageCount(effectivePages.length)
    : paddedPageCount(config.declaredPageCount ?? PREVIEW_PAGE_COUNT);

  const imposition = computeImposition(pageCount, config);
  const trim = resolveTrim(config, units, pages);
  const spine = estimateSpine(pageCount, config);
  const issues = validateProject({ config, units, pages, effectivePages, imposition, trim });

  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const issuesByPage = new Map<number, Issue[]>();
  const issuesBySheet = new Map<number, Issue[]>();
  const worstByPage = new Map<number, IssueSeverity>();
  const worstBySheet = new Map<number, IssueSeverity>();
  const counts: IssueCounts = { errors: 0, warnings: 0, infos: 0 };

  for (const issue of issues) {
    if (issue.severity === 'error') counts.errors += 1;
    else if (issue.severity === 'warning') counts.warnings += 1;
    else counts.infos += 1;

    for (const pageNumber of issue.pageNumbers) {
      pushTo(issuesByPage, pageNumber, issue);
      worstByPage.set(pageNumber, worseSeverity(worstByPage.get(pageNumber), issue.severity));
    }
    for (const sheetIndex of issue.sheetIndexes) {
      pushTo(issuesBySheet, sheetIndex, issue);
      worstBySheet.set(sheetIndex, worseSeverity(worstBySheet.get(sheetIndex), issue.severity));
    }
  }

  const blankPageNumbers: number[] = [];
  if (hasPages) {
    effectivePages.forEach((page, index) => {
      if (page.unitId === null) blankPageNumbers.push(index + 1);
    });
  } else if (config.declaredPageCount !== null && config.declaredPageCount < pageCount) {
    const declared = Math.max(0, Math.floor(config.declaredPageCount));
    const beforeBackCover = config.blankPlacement === 'before-back-cover' && declared >= 2;
    const first = beforeBackCover ? declared : declared + 1;
    for (let n = first; n < first + (pageCount - declared); n += 1) blankPageNumbers.push(n);
  }

  return {
    hasPages,
    effectivePages,
    suppliedPageCount: pages.length,
    pageCount,
    blankPageNumbers,
    trim,
    imposition,
    spine,
    issues,
    counts,
    verdict: verdictOf(issues),
    unitsById,
    issuesByPage,
    issuesBySheet,
    worstByPage,
    worstBySheet,
  };
}

interface DerivedCache {
  config: MagazineConfig;
  units: SourceUnit[];
  pages: Page[];
  derived: Derived;
}

let cache: DerivedCache | null = null;

export function selectDerived(state: { config: MagazineConfig; units: SourceUnit[]; pages: Page[] }): Derived {
  if (cache && cache.config === state.config && cache.units === state.units && cache.pages === state.pages) {
    return cache.derived;
  }
  const derived = computeDerived(state.config, state.units, state.pages);
  cache = { config: state.config, units: state.units, pages: state.pages, derived };
  return derived;
}
