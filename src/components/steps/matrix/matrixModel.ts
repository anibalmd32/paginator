import { slotLetter, type SlotLetter } from '@/components/report/labels';
import type { Derived } from '@/lib/store';
import type { Issue, IssueCode, IssueSeverity, MagazineConfig, PageOrigin, SheetFace, SheetImposition, SignatureInfo, SlotPosition, Spread } from '@/lib/types';
import { COVER_STOCK, NEUTRAL_STOCK, signatureStock } from '@/styles/stock';

export interface Stock {
  name: string;
  cssVar: string;
  inkVar: string;
}

export interface SlotModel {
  page: number;
  sheetIndex: number;
  sheetNumber: number;
  face: SheetFace;
  position: SlotPosition;
  letter: SlotLetter;
  origin: PageOrigin | null;
  open: boolean;
  worst: IssueSeverity | undefined;
  issues: readonly Issue[];
}

export interface SheetRowModel {
  sheet: SheetImposition;
  slots: readonly [SlotModel, SlotModel, SlotModel, SlotModel];
  stock: Stock;
  worst: IssueSeverity | undefined;
  tone: 'error' | 'warning' | undefined;
  primaryIssue: Issue | null;
  issueCount: number;
}

export interface SignatureBlockModel {
  info: SignatureInfo;
  isCover: boolean;
  title: string;
  stock: Stock;
  stockIndex: number | null;
  rows: SheetRowModel[];
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { error: 3, warning: 2, info: 1 };

export const PLACEMENT_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'page-count-not-multiple-of-4',
  'declared-count-mismatch',
  'folio-out-of-order',
  'duplicate-folio',
  'size-mismatch',
  'orientation-mismatch',
  'spread-side-mismatch',
  'unexpected-single-in-spreads',
  'unexpected-double-in-pages',
  'printer-sides-incomplete',
]);

function bySeverity(a: Issue, b: Issue): number {
  return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
}

export function primaryIssueOf(issues: readonly Issue[] | undefined): Issue | null {
  if (!issues || issues.length === 0) return null;
  return [...issues].sort(bySeverity)[0] ?? null;
}

function placementTone(issues: readonly Issue[]): 'error' | 'warning' | undefined {
  if (issues.some((issue) => issue.severity === 'error')) return 'error';
  return issues.length > 0 ? 'warning' : undefined;
}

export function stockOf(role: 'cover' | 'interior', interiorOrdinal: number | null, interiorCount: number): Stock {
  if (role === 'cover') return COVER_STOCK;
  if (interiorCount <= 1 || interiorOrdinal === null) return NEUTRAL_STOCK;
  const stock = signatureStock(interiorOrdinal);
  return { name: stock.name, cssVar: stock.cssVar, inkVar: stock.inkVar };
}

export function buildSlot(derived: Derived, config: Pick<MagazineConfig, 'autoPadBlanks'>, sheet: SheetImposition, face: SheetFace, position: SlotPosition): SlotModel {
  const page = sheet[face][position];
  const origin = derived.effectivePages[page - 1]?.origin ?? null;
  return {
    page,
    sheetIndex: sheet.index,
    sheetNumber: sheet.number,
    face,
    position,
    letter: slotLetter(face, position),
    origin,
    open: origin === null || (origin === 'auto-blank' && !config.autoPadBlanks),
    worst: derived.worstByPage.get(page),
    issues: derived.issuesByPage.get(page) ?? [],
  };
}

export function buildSignatureBlocks(derived: Derived, config: Pick<MagazineConfig, 'autoPadBlanks'>): SignatureBlockModel[] {
  const { imposition } = derived;
  const interior = imposition.signatures.filter((signature) => signature.role === 'interior');
  const ordinal = new Map(interior.map((signature, index) => [signature.index, index]));

  return imposition.signatures.map((info) => {
    const isCover = info.role === 'cover';
    const interiorOrdinal = ordinal.get(info.index) ?? null;
    const blockStock = stockOf(info.role, interiorOrdinal, interior.length);
    const rows: SheetRowModel[] = imposition.sheets.slice(info.firstSheetIndex, info.firstSheetIndex + info.sheets).map((sheet) => {
      const issues = derived.issuesBySheet.get(sheet.index) ?? [];
      const placement = issues.filter((issue) => PLACEMENT_CODES.has(issue.code) && issue.severity !== 'info');
      return {
        sheet,
        slots: [
          buildSlot(derived, config, sheet, 'front', 'left'),
          buildSlot(derived, config, sheet, 'front', 'right'),
          buildSlot(derived, config, sheet, 'back', 'left'),
          buildSlot(derived, config, sheet, 'back', 'right'),
        ],
        stock: sheet.role === 'cover' ? COVER_STOCK : blockStock,
        worst: derived.worstBySheet.get(sheet.index),
        tone: placementTone(placement),
        primaryIssue: primaryIssueOf(placement),
        issueCount: issues.length,
      };
    });
    const title = isCover ? 'Cubierta' : interior.length <= 1 ? 'Cuadernillo único' : `Cuadernillo ${(interiorOrdinal ?? 0) + 1}`;
    const stockIndex = !isCover && interior.length > 1 ? interiorOrdinal : null;
    return { info, isCover, title, stock: blockStock, stockIndex, rows };
  });
}

export function readingPartner(page: number, pageCount: number): number | null {
  if (page <= 1 || page >= pageCount) return null;
  return page % 2 === 0 ? page + 1 : page - 1;
}

export function flaggedSheets(derived: Pick<Derived, 'worstBySheet'>): number[] {
  return [...derived.worstBySheet.keys()].sort((a, b) => a - b);
}

export function nextFlaggedSheet(flagged: readonly number[], current: number | null): number | null {
  if (flagged.length === 0) return null;
  const after = flagged.find((index) => current === null || index > current);
  return after ?? flagged[0] ?? null;
}

export function firstFlaggedPage(row: Pick<SheetRowModel, 'slots'>): number {
  const flagged = row.slots.find((slot) => slot.worst !== undefined) ?? row.slots[0];
  return flagged.page;
}

export function readingSpreads(spreads: readonly Spread[]): Spread[] {
  return spreads.filter((spread) => spread.left !== null || spread.right !== null);
}

export function sheetRangeText(firstNumber: number, lastNumber: number): string {
  return firstNumber === lastNumber ? `pliego ${firstNumber}` : `pliegos ${firstNumber}–${lastNumber}`;
}

export function pageRangeText(first: number, last: number): string {
  return first === last ? `pág. ${first}` : `págs. ${first}–${last}`;
}
