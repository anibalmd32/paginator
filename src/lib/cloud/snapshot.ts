import { createManualBlank, DEFAULT_CONFIG } from '@/lib/imposition';
import { detectFolio } from '@/lib/imposition/segmentation';
import type {
  BindingType,
  BlankPlacement,
  InputMode,
  MagazineConfig,
  Page,
  PageHalf,
  PaperSpec,
  PreflightVerdict,
  ReadingDirection,
  SourceAsset,
  SourceKind,
  SourceUnit,
  SpreadKind,
  TrimSetting,
} from '@/lib/types';

import { CloudError } from './errors';

export const SNAPSHOT_VERSION = 1;
export const TITLE_MAX_LENGTH = 200;
export const SNAPSHOT_MAX_BYTES = 512 * 1024;

const MAX_FILES = 5000;
const MAX_PAGES = 20000;
const MAX_UNITS_PER_FILE = 100000;
const MAX_FILE_NAME = 1024;

export interface SavedFile {
  name: string;
  size: number;
  kind: SourceKind;
  unitCount: number;
  sha256: string;
}

export type SavedPage =
  | { kind: 'unit'; file: number; indexInAsset: number; half: PageHalf }
  | { kind: 'manual-blank' }
  | { kind: 'auto-blank' };

export interface ProjectSummary {
  pageCount: number;
  sheetCount: number;
  signatureCount: number;
  verdict: PreflightVerdict;
  errors: number;
  warnings: number;
}

export interface ProjectSnapshot {
  version: 1;
  title: string;
  config: MagazineConfig;
  files: SavedFile[];
  pages: SavedPage[];
  pagesEdited: boolean;
  summary: ProjectSummary;
}

export interface CreateSnapshotInput {
  config: MagazineConfig;
  assets: SourceAsset[];
  units: SourceUnit[];
  pages: Page[];
  pagesEdited: boolean;
  fingerprints: ReadonlyMap<string, string>;
  derived: ProjectSummary;
}

export interface RestorePlan {
  matches: (string | null)[];
  missing: SavedFile[];
  extraAssetIds: string[];
  pages: Page[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

const VERDICTS: readonly PreflightVerdict[] = ['ok', 'warnings', 'errors'];
const HALVES: readonly PageHalf[] = ['full', 'left', 'right'];
const KINDS: readonly SourceKind[] = ['pdf', 'image'];
const SHA256_RE = /^[0-9a-f]{64}$/;

export function normalizeTitle(raw: unknown, fallback: string = DEFAULT_CONFIG.title): string {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  const codePoints = Array.from(clean);
  return codePoints.length <= TITLE_MAX_LENGTH ? clean : codePoints.slice(0, TITLE_MAX_LENGTH).join('').trimEnd();
}

export function jsonbTextByteSize(value: unknown): number {
  const compact: string | undefined = JSON.stringify(value);
  if (compact === undefined) return 0;
  return new TextEncoder().encode(compact).length + separatorSpaces(JSON.parse(compact));
}

function separatorSpaces(value: unknown): number {
  if (Array.isArray(value)) {
    let spaces = Math.max(0, value.length - 1);
    for (const item of value) spaces += separatorSpaces(item);
    return spaces;
  }
  if (isRecord(value)) {
    const items = Object.values(value);
    let spaces = items.length + Math.max(0, items.length - 1);
    for (const item of items) spaces += separatorSpaces(item);
    return spaces;
  }
  return 0;
}

export function snapshotByteSize(snapshot: ProjectSnapshot): number {
  return jsonbTextByteSize(snapshot);
}

function parseTrim(value: unknown): TrimSetting | null {
  if (!isRecord(value)) return null;
  if (value['mode'] === 'auto') return { mode: 'auto' };
  if (value['mode'] !== 'fixed') return null;
  const { presetId, widthMm, heightMm } = value;
  if (presetId !== null && typeof presetId !== 'string') return null;
  if (!isNonNegativeNumber(widthMm) || !isNonNegativeNumber(heightMm) || widthMm === 0 || heightMm === 0) return null;
  return { mode: 'fixed', presetId, widthMm, heightMm };
}

function parsePaper(value: unknown): PaperSpec | null {
  if (!isRecord(value)) return null;
  const paper: PaperSpec = { ...DEFAULT_CONFIG.paper };
  for (const key of ['interiorGsm', 'coverGsm', 'interiorCaliperMm', 'coverCaliperMm'] as const) {
    const field = value[key];
    if (field === undefined) continue;
    if (!isNonNegativeNumber(field)) return null;
    paper[key] = field;
  }
  return paper;
}

export function parseConfig(value: unknown, title: string): MagazineConfig | null {
  if (!isRecord(value)) return null;
  const d = DEFAULT_CONFIG;
  const has = (key: string): boolean => value[key] !== undefined;

  const inputMode = has('inputMode') ? value['inputMode'] : d.inputMode;
  const spreadKind = has('spreadKind') ? value['spreadKind'] : d.spreadKind;
  const wraparoundCover = has('wraparoundCover') ? value['wraparoundCover'] : d.wraparoundCover;
  const binding = has('binding') ? value['binding'] : d.binding;
  const signaturePages = has('signaturePages') ? value['signaturePages'] : d.signaturePages;
  const separateCover = has('separateCover') ? value['separateCover'] : d.separateCover;
  const declaredPageCount = has('declaredPageCount') ? value['declaredPageCount'] : d.declaredPageCount;
  const autoPadBlanks = has('autoPadBlanks') ? value['autoPadBlanks'] : d.autoPadBlanks;
  const blankPlacement = has('blankPlacement') ? value['blankPlacement'] : d.blankPlacement;
  const readingDirection = has('readingDirection') ? value['readingDirection'] : d.readingDirection;
  const trim = has('trim') ? parseTrim(value['trim']) : d.trim;
  const bleedMm = has('bleedMm') ? value['bleedMm'] : d.bleedMm;
  const marksMm = has('marksMm') ? value['marksMm'] : d.marksMm;
  const safeMarginMm = has('safeMarginMm') ? value['safeMarginMm'] : d.safeMarginMm;
  const paper = has('paper') ? parsePaper(value['paper']) : d.paper;

  if (!oneOf<InputMode>(inputMode, ['pages', 'spreads'])) return null;
  if (!oneOf<SpreadKind>(spreadKind, ['reader', 'printer'])) return null;
  if (typeof wraparoundCover !== 'boolean' || typeof separateCover !== 'boolean' || typeof autoPadBlanks !== 'boolean') return null;
  if (!oneOf<BindingType>(binding, ['saddle-stitch', 'perfect-bound'])) return null;
  if (!isNonNegativeInt(signaturePages, 512) || signaturePages === 0 || signaturePages % 4 !== 0) return null;
  if (declaredPageCount !== null && (!isNonNegativeInt(declaredPageCount, 100000) || declaredPageCount === 0)) return null;
  if (!oneOf<BlankPlacement>(blankPlacement, ['before-back-cover', 'end'])) return null;
  if (!oneOf<ReadingDirection>(readingDirection, ['ltr', 'rtl'])) return null;
  if (!trim || !paper) return null;
  if (!isNonNegativeNumber(bleedMm) || !isNonNegativeNumber(marksMm) || !isNonNegativeNumber(safeMarginMm)) return null;

  return {
    title,
    inputMode,
    spreadKind,
    wraparoundCover,
    binding,
    signaturePages,
    separateCover,
    declaredPageCount,
    autoPadBlanks,
    blankPlacement,
    readingDirection,
    trim: trim.mode === 'auto' ? { mode: 'auto' } : { ...trim },
    bleedMm,
    marksMm,
    safeMarginMm,
    paper: { ...paper },
  };
}

function parseFile(value: unknown): SavedFile | null {
  if (!isRecord(value)) return null;
  const { name, size, kind, unitCount, sha256 } = value;
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_FILE_NAME) return null;
  if (!isNonNegativeInt(size)) return null;
  if (!oneOf<SourceKind>(kind, KINDS)) return null;
  if (!isNonNegativeInt(unitCount, MAX_UNITS_PER_FILE) || unitCount === 0) return null;
  if (typeof sha256 !== 'string') return null;
  const hash = sha256.toLowerCase();
  if (!SHA256_RE.test(hash)) return null;
  return { name, size, kind, unitCount, sha256: hash };
}

function parsePage(value: unknown, files: readonly SavedFile[]): SavedPage | null {
  if (!isRecord(value)) return null;
  switch (value['kind']) {
    case 'manual-blank':
      return { kind: 'manual-blank' };
    case 'auto-blank':
      return { kind: 'auto-blank' };
    case 'unit': {
      const { file, indexInAsset, half } = value;
      if (!isNonNegativeInt(file) || file >= files.length) return null;
      const unitCount = files[file]?.unitCount ?? 0;
      if (!isNonNegativeInt(indexInAsset) || indexInAsset >= unitCount) return null;
      if (!oneOf<PageHalf>(half, HALVES)) return null;
      return { kind: 'unit', file, indexInAsset, half };
    }
    default:
      return null;
  }
}

function parseSummary(value: unknown): ProjectSummary | null {
  if (!isRecord(value)) return null;
  const { pageCount, sheetCount, signatureCount, verdict, errors, warnings } = value;
  if (
    !isNonNegativeInt(pageCount) ||
    !isNonNegativeInt(sheetCount) ||
    !isNonNegativeInt(signatureCount) ||
    !isNonNegativeInt(errors) ||
    !isNonNegativeInt(warnings) ||
    !oneOf<PreflightVerdict>(verdict, VERDICTS)
  ) {
    return null;
  }
  return { pageCount, sheetCount, signatureCount, verdict, errors, warnings };
}

export function parseSnapshot(value: unknown): ProjectSnapshot | null {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(data) || data['version'] !== SNAPSHOT_VERSION) return null;
  if (typeof data['title'] !== 'string' || typeof data['pagesEdited'] !== 'boolean') return null;
  const title = normalizeTitle(data['title']);

  const config = parseConfig(data['config'], title);
  if (!config) return null;

  const rawFiles = data['files'];
  if (!Array.isArray(rawFiles) || rawFiles.length > MAX_FILES) return null;
  const files: SavedFile[] = [];
  for (const raw of rawFiles) {
    const file = parseFile(raw);
    if (!file) return null;
    files.push(file);
  }

  const rawPages = data['pages'];
  if (!Array.isArray(rawPages) || rawPages.length > MAX_PAGES) return null;
  const pages: SavedPage[] = [];
  const seen = new Set<string>();
  for (const raw of rawPages) {
    const page = parsePage(raw, files);
    if (!page) return null;
    if (page.kind === 'unit') {
      const key = `${String(page.file)}/${String(page.indexInAsset)}/${page.half}`;
      if (seen.has(key)) return null;
      seen.add(key);
    }
    pages.push(page);
  }

  const summary = parseSummary(data['summary']);
  if (!summary) return null;

  return { version: SNAPSHOT_VERSION, title, config, files, pages, pagesEdited: data['pagesEdited'], summary };
}

export function createSnapshot(input: CreateSnapshotInput): ProjectSnapshot {
  const { assets, units, pages, fingerprints } = input;
  const title = normalizeTitle(input.config.title);

  const config = parseConfig(input.config, title);
  if (!config) throw new CloudError('unknown', 'La configuración de la revista tiene valores no válidos; revísala antes de guardar.');

  const fileIndex = new Map<string, number>();
  const files: SavedFile[] = assets.map((asset, index) => {
    const sha256 = fingerprints.get(asset.id)?.toLowerCase();
    if (!sha256 || !SHA256_RE.test(sha256)) {
      throw new CloudError('unknown', 'Todavía se están reconociendo los archivos. Vuelve a intentarlo en un momento.');
    }
    fileIndex.set(asset.id, index);
    return {
      name: asset.name || 'archivo sin nombre',
      size: Math.max(0, Math.round(asset.sizeBytes)),
      kind: asset.kind,
      unitCount: Math.max(1, asset.unitCount),
      sha256,
    };
  });

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const savedPages: SavedPage[] = pages.map((page) => {
    if (page.origin === 'manual-blank') return { kind: 'manual-blank' };
    if (page.origin === 'auto-blank') return { kind: 'auto-blank' };
    const unit = page.unitId === null ? undefined : unitById.get(page.unitId);
    const file = unit ? fileIndex.get(unit.assetId) : undefined;
    if (!unit || file === undefined) {
      throw new CloudError('unknown', 'Hay páginas que no corresponden a ningún archivo cargado; no se puede guardar así.');
    }
    return { kind: 'unit', file, indexInAsset: unit.indexInAsset, half: page.half };
  });

  const d = input.derived;
  const count = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  const summary: ProjectSummary = {
    pageCount: count(d.pageCount),
    sheetCount: count(d.sheetCount),
    signatureCount: count(d.signatureCount),
    verdict: d.verdict,
    errors: count(d.errors),
    warnings: count(d.warnings),
  };

  return { version: SNAPSHOT_VERSION, title, config, files, pages: savedPages, pagesEdited: input.pagesEdited, summary };
}

export function planRestore(
  snapshot: ProjectSnapshot,
  assets: SourceAsset[],
  units: SourceUnit[],
  fingerprints: ReadonlyMap<string, string>,
): RestorePlan {
  const hashed = assets.filter((asset) => fingerprints.has(asset.id));
  const hashOf = (asset: SourceAsset): string => (fingerprints.get(asset.id) ?? '').toLowerCase();
  const taken = new Set<string>();
  const matches: (string | null)[] = snapshot.files.map(() => null);

  const pass = (accept: (file: SavedFile, asset: SourceAsset) => boolean): void => {
    snapshot.files.forEach((file, index) => {
      if (matches[index] !== null) return;
      const asset = hashed.find((candidate) => !taken.has(candidate.id) && hashOf(candidate) === file.sha256 && accept(file, candidate));
      if (!asset) return;
      matches[index] = asset.id;
      taken.add(asset.id);
    });
  };
  pass((file, asset) => file.name === asset.name);
  pass(() => true);

  const missing = snapshot.files.filter((_, index) => matches[index] === null);
  const extraAssetIds = hashed.filter((asset) => !taken.has(asset.id)).map((asset) => asset.id);

  return { matches, missing, extraAssetIds, pages: missing.length === 0 ? rebuildPages(snapshot, matches, units) : null };
}

function rebuildPages(snapshot: ProjectSnapshot, matches: readonly (string | null)[], units: readonly SourceUnit[]): Page[] | null {
  const unitByKey = new Map(units.map((unit) => [`${unit.assetId}#${String(unit.indexInAsset)}`, unit]));
  const pages: Page[] = [];
  let autoSerial = 0;
  for (const saved of snapshot.pages) {
    if (saved.kind === 'manual-blank') {
      pages.push(createManualBlank());
      continue;
    }
    if (saved.kind === 'auto-blank') {
      autoSerial += 1;
      pages.push({ id: `blank:auto:${String(autoSerial)}`, origin: 'auto-blank', unitId: null, half: 'full', detectedFolio: null });
      continue;
    }
    const assetId = matches[saved.file];
    const unit = assetId ? unitByKey.get(`${assetId}#${String(saved.indexInAsset)}`) : undefined;
    if (!unit) return null;
    pages.push({
      id: `${unit.id}:${saved.half}`,
      origin: 'file',
      unitId: unit.id,
      half: saved.half,
      detectedFolio: detectFolio(unit, saved.half),
    });
  }
  return pages;
}
