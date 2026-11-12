import type { IssueCounts } from '@/lib/store';
import type { BindingType, IssueSeverity, PageHalf, PageOrigin, PreflightVerdict, SheetFace, SheetImposition, SlotPosition } from '@/lib/types';

export type SlotLetter = 'A' | 'B' | 'C' | 'D';

export function slotLetter(face: SheetFace, position: SlotPosition): SlotLetter {
  if (face === 'front') return position === 'left' ? 'A' : 'B';
  return position === 'left' ? 'C' : 'D';
}

export const FACE_TEXT: Record<SheetFace, string> = { front: 'cara', back: 'retiro' };
export const POSITION_SHORT: Record<SlotPosition, string> = { left: 'izq.', right: 'der.' };
export const POSITION_LONG: Record<SlotPosition, string> = { left: 'izquierda', right: 'derecha' };

export function slotPositionShort(face: SheetFace, position: SlotPosition): string {
  return `${face === 'front' ? 'ext.' : 'int.'} ${POSITION_SHORT[position]}`;
}

export function physicalSlotParts(sheetNumber: number, face: SheetFace, position: SlotPosition): [sheet: string, slot: string] {
  return [`Pliego ${sheetNumber}`, `${FACE_TEXT[face]} · ${POSITION_SHORT[position]}`];
}

export function physicalSlotText(sheetNumber: number, face: SheetFace, position: SlotPosition): string {
  return physicalSlotParts(sheetNumber, face, position).join(' · ');
}

export const SEVERITY_LABEL: Record<IssueSeverity, { one: string; many: string; group: string }> = {
  error: { one: 'error', many: 'errores', group: 'Errores' },
  warning: { one: 'aviso', many: 'avisos', group: 'Avisos' },
  info: { one: 'nota', many: 'notas', group: 'Notas' },
};

export const SEVERITY_ORDER: readonly IssueSeverity[] = ['error', 'warning', 'info'];

export function countText(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function joinPhrase(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1] ?? ''}`;
}

export function verdictSentence(verdict: PreflightVerdict, counts: IssueCounts, hasPages = true): string {
  if (!hasPages) return 'Pre-vuelo pendiente: aún no hay páginas';
  if (verdict === 'ok') return counts.infos > 0 ? 'Listo para taller: sin errores ni avisos' : 'Listo para taller: sin incidencias';
  const parts: string[] = [];
  if (counts.errors > 0) parts.push(countText(counts.errors, 'error', 'errores'));
  if (counts.warnings > 0) parts.push(countText(counts.warnings, 'aviso', 'avisos'));
  const total = counts.errors + counts.warnings;
  return `${joinPhrase(parts)} por ${total === 1 ? 'revisar' : 'resolver'}`;
}

export function verdictNotes(counts: IssueCounts, hasPages = true): string | null {
  return hasPages && counts.infos > 0 ? countText(counts.infos, 'nota', 'notas') : null;
}

export function verdictTone(verdict: PreflightVerdict, hasPages = true): 'success' | 'warning' | 'error' | 'neutral' {
  if (!hasPages) return 'neutral';
  if (verdict === 'errors') return 'error';
  if (verdict === 'warnings') return 'warning';
  return 'success';
}

export function decimal(value: number, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return String(rounded + 0).replace('.', ',');
}

export function mm(value: number, maxDecimals = 1): string {
  return `${decimal(value, maxDecimals)} mm`;
}

export const BINDING_TEXT: Record<BindingType, string> = {
  'saddle-stitch': 'Grapada a caballo',
  'perfect-bound': 'Lomo cuadrado',
};

export const HALF_TEXT: Record<PageHalf, string> = {
  full: 'unidad completa',
  left: 'mitad izquierda',
  right: 'mitad derecha',
};

export const ORIGIN_TEXT: Record<PageOrigin, string> = {
  file: 'Archivo',
  'auto-blank': 'Cortesía automática',
  'manual-blank': 'Blanca insertada a mano',
};

export function sheetNumeral(number: number): string {
  return String(number);
}

export function sheetPlaceText(sheet: Pick<SheetImposition, 'indexInSignature' | 'sheetsInSignature'>): string {
  if (sheet.sheetsInSignature <= 1) return 'único';
  if (sheet.indexInSignature === 0) return 'exterior';
  if (sheet.indexInSignature === sheet.sheetsInSignature - 1) return 'central';
  return `${sheet.indexInSignature + 1}.º de ${sheet.sheetsInSignature}`;
}

export function sheetRoleText(sheet: Pick<SheetImposition, 'role' | 'indexInSignature' | 'sheetsInSignature'>): string {
  if (sheet.role === 'cover') return sheet.sheetsInSignature <= 1 ? 'Cubierta' : `Cubierta · ${sheetPlaceText(sheet)}`;
  return `Tripa · ${sheet.sheetsInSignature <= 1 ? 'pliego único' : sheetPlaceText(sheet)}`;
}

export function reportDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}
