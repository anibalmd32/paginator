import type { ImpositionResult, PageOrigin, SheetFace, SlotPosition } from '@/lib/types';

export const FACE_TEXT: Record<SheetFace, string> = { front: 'cara', back: 'retiro' };
const POSITION_TEXT: Record<SlotPosition, string> = { left: 'izq.', right: 'der.' };

export type OpeningText =
  | { kind: 'cover'; page: number }
  | { kind: 'back'; page: number }
  | { kind: 'spread'; first: number; last: number };

export function openingOf(imposition: ImpositionResult, spreadIndex: number): OpeningText {
  const leaves = Math.floor(imposition.pageCount / 2);
  const index = Math.min(Math.max(Math.round(spreadIndex), 0), leaves);
  const spread = imposition.spreads[index];
  if (index === 0) return { kind: 'cover', page: 1 };
  if (index === leaves) return { kind: 'back', page: imposition.pageCount };
  const left = spread?.left ?? index * 2;
  const right = spread?.right ?? index * 2 + 1;
  return { kind: 'spread', first: Math.min(left, right), last: Math.max(left, right) };
}

export function openingShortText(opening: OpeningText): string {
  if (opening.kind === 'cover') return 'Portada';
  if (opening.kind === 'back') return 'Contraportada';
  return `Págs. ${opening.first} – ${opening.last}`;
}

export function placementText(imposition: ImpositionResult, pageNumber: number): string | null {
  const placement = imposition.placements[pageNumber - 1];
  if (!placement) return null;
  const sheet = imposition.sheets[placement.sheetIndex];
  const number = sheet?.number ?? placement.sheetIndex + 1;
  return `Pliego ${number} · ${FACE_TEXT[placement.face]} · ${POSITION_TEXT[placement.position]}`;
}

export function originNote(origin: PageOrigin | null): string | null {
  if (origin === 'auto-blank') return 'cortesía';
  if (origin === 'manual-blank') return 'en blanco';
  return null;
}

export function sheetSideText(imposition: ImpositionResult, sheetIndex: number, face: SheetFace): string | null {
  const sheet = imposition.sheets[sheetIndex];
  if (!sheet) return null;
  const side = face === 'front' ? sheet.front : sheet.back;
  return `${side.left} | ${side.right}`;
}

export function liveReadingText(opening: OpeningText): string {
  if (opening.kind === 'cover') return `Portada, página ${opening.page}`;
  if (opening.kind === 'back') return `Contraportada, página ${opening.page}`;
  return `Páginas ${opening.first} y ${opening.last}`;
}

export function liveSheetText(imposition: ImpositionResult, sheetIndex: number, face: SheetFace): string {
  const sheet = imposition.sheets[sheetIndex];
  if (!sheet) return '';
  const side = face === 'front' ? sheet.front : sheet.back;
  return `Pliego ${sheet.number} de ${imposition.sheets.length}, ${FACE_TEXT[face]}: páginas ${side.left} y ${side.right}`;
}

export function parsePageInput(text: string, pageCount: number): number | null {
  const match = /\d+/.exec(text);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isInteger(value) || value < 1 || value > pageCount) return null;
  return value;
}
