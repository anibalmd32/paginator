export type InputMode = 'pages' | 'spreads';

export type SpreadKind = 'reader' | 'printer';

export type BindingType = 'saddle-stitch' | 'perfect-bound';

export type ReadingDirection = 'ltr' | 'rtl';

export type BlankPlacement = 'before-back-cover' | 'end';

export interface TrimSize {
  widthMm: number;
  heightMm: number;
}

export type TrimSetting =
  | { mode: 'auto' }
  | { mode: 'fixed'; presetId: string | null; widthMm: number; heightMm: number };

export interface PaperSpec {
  interiorGsm: number;
  coverGsm: number;
  interiorCaliperMm: number;
  coverCaliperMm: number;
}

export interface MagazineConfig {
  title: string;

  inputMode: InputMode;
  spreadKind: SpreadKind;
  wraparoundCover: boolean;

  binding: BindingType;
  signaturePages: number;
  separateCover: boolean;

  declaredPageCount: number | null;
  autoPadBlanks: boolean;
  blankPlacement: BlankPlacement;

  readingDirection: ReadingDirection;

  trim: TrimSetting;
  bleedMm: number;
  marksMm: number;
  safeMarginMm: number;

  paper: PaperSpec;
}

export interface GuideVisibility {
  trim: boolean;
  bleed: boolean;
  safe: boolean;
}

export type SourceKind = 'pdf' | 'image';

export interface SourceAsset {
  id: string;
  file: File;
  name: string;
  kind: SourceKind;
  sizeBytes: number;
  unitCount: number;
}

export interface FolioHit {
  value: number;
  x: number;
  y: number;
}

export interface SourceUnit {
  id: string;
  assetId: string;
  indexInAsset: number;
  order: number;
  label: string;
  width: number;
  height: number;
  widthMm: number | null;
  heightMm: number | null;
  filenameNumber: number | null;
  folios: FolioHit[];
}

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PageHalf = 'full' | 'left' | 'right';

export type PageOrigin = 'file' | 'auto-blank' | 'manual-blank';

export interface Page {
  id: string;
  origin: PageOrigin;
  unitId: string | null;
  half: PageHalf;
  detectedFolio: number | null;
}

export interface PageGeometry {
  source: NormRect;
  bleed: NormRect;
  trim: NormRect;
  safe: NormRect;
}

export interface Spread {
  index: number;
  left: number | null;
  right: number | null;
}

export type SheetFace = 'front' | 'back';
export type SlotPosition = 'left' | 'right';

export interface SheetSide {
  left: number;
  right: number;
}

export type SheetRole = 'cover' | 'interior';

export interface SheetImposition {
  index: number;
  number: number;
  signature: number;
  indexInSignature: number;
  sheetsInSignature: number;
  role: SheetRole;
  front: SheetSide;
  back: SheetSide;
}

export interface PagePlacement {
  pageNumber: number;
  sheetIndex: number;
  face: SheetFace;
  position: SlotPosition;
  signature: number;
}

export interface SignatureInfo {
  index: number;
  role: SheetRole;
  sheets: number;
  pages: number;
  pageNumbers: number[];
  firstSheetIndex: number;
}

export interface ImpositionResult {
  pageCount: number;
  binding: BindingType;
  readingDirection: ReadingDirection;
  sheets: SheetImposition[];
  signatures: SignatureInfo[];
  placements: PagePlacement[];
  spreads: Spread[];
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'no-pages'
  | 'page-count-not-multiple-of-4'
  | 'blank-pages-added'
  | 'declared-count-mismatch'
  | 'folio-out-of-order'
  | 'duplicate-folio'
  | 'size-mismatch'
  | 'orientation-mismatch'
  | 'spread-side-mismatch'
  | 'unexpected-single-in-spreads'
  | 'unexpected-double-in-pages'
  | 'printer-sides-incomplete'
  | 'file-size-vs-trim'
  | 'low-resolution'
  | 'saddle-stitch-too-thick'
  | 'creep'
  | 'signature-remainder'
  | 'spine-too-thin';

export type IssueFix =
  | { kind: 'enable-auto-blanks'; label: string }
  | { kind: 'set-input-mode'; value: InputMode; label: string }
  | { kind: 'set-spread-kind'; value: SpreadKind; label: string }
  | { kind: 'set-wraparound-cover'; value: boolean; label: string }
  | { kind: 'set-binding'; value: BindingType; label: string }
  | { kind: 'use-actual-page-count'; label: string };

export interface Issue {
  id: string;
  code: IssueCode;
  severity: IssueSeverity;
  title: string;
  detail: string;
  pageNumbers: number[];
  sheetIndexes: number[];
  fix?: IssueFix;
}

export type PreflightVerdict = 'ok' | 'warnings' | 'errors';

export interface SpineEstimate {
  widthMm: number;
  interiorLeaves: number;
  coverLeaves: number;
  creepMm: number;
}

export interface ReportPageRow {
  pageNumber: number;
  source: string;
  origin: PageOrigin;
  sheetNumber: number;
  face: SheetFace;
  position: SlotPosition;
  signature: number;
  issues: IssueSeverity[];
}

export interface PreflightReport {
  generatedAt: string;
  title: string;
  verdict: PreflightVerdict;
  config: MagazineConfig;
  trim: TrimSize;
  suppliedPageCount: number;
  pageCount: number;
  blankPageNumbers: number[];
  sheetCount: number;
  signatureCount: number;
  spine: SpineEstimate;
  issues: Issue[];
  sheets: SheetImposition[];
  pages: ReportPageRow[];
}

export type ViewerMode = 'reading' | 'sheet';

export type CameraPreset = 'reading' | 'top';

export type RasterTier = 'thumb' | 'mid' | 'high';
