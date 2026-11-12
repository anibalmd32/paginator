export { COVER_PAPERS, DEFAULT_CONFIG, INTERIOR_PAPERS, SIGNATURE_PAGE_OPTIONS, TRIM_PRESETS } from './defaults';
export type { PaperPreset, TrimPreset } from './defaults';

export {
  blanksNeeded,
  computeImposition,
  computeSpreads,
  expectedSide,
  paddedPageCount,
  printerSideSequence,
  spreadIndexOfPage,
} from './imposition';
export { interiorSignatureNumber } from './imposition';
export type { ImpositionOptions, PrinterSide } from './imposition';

export { applyPadding, buildPages, classifyUnits, createManualBlank } from './segmentation';

export { estimateSpine, expectedUnitSizeMm, pageGeometry, resolveTrim } from './geometry';

export { validateProject } from './validation';
export type { ValidationInput } from './validation';

export { buildReport, reportToJson, reportToMarkdown, verdictOf } from './report';
