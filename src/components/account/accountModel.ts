import type { CloudUser } from '@/lib/cloud';
import type { PreflightVerdict } from '@/lib/types';

export const SAVED_WHAT = 'Se guardan la configuración, el orden de páginas, el nombre, el tamaño y la huella de cada archivo y el resumen del pre-vuelo.';
export const NOT_SAVED_SHORT = 'Tus archivos no se suben: ni las páginas, ni miniaturas, ni su texto.';
export const NOT_SAVED_WHAT = 'Tus archivos no se suben: ni las páginas, ni miniaturas, ni su texto. Al abrir la revista te pediremos que vuelvas a cargarlos.';

export const SAVE_NOTE_KEY = 'paginator:cloud:save-note-seen:v1';

export function saveNoteSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(SAVE_NOTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markSaveNoteSeen(): void {
  try {
    globalThis.localStorage?.setItem(SAVE_NOTE_KEY, '1');
  } catch {
  }
}

export function displayName(user: CloudUser | null): string {
  const name = user?.name?.trim();
  if (name) return name;
  const local = user?.email?.split('@')[0]?.trim();
  return local || 'Tu cuenta';
}

export function firstName(user: CloudUser | null): string {
  return displayName(user).split(/\s+/)[0] ?? 'Tu cuenta';
}

export function initials(user: CloudUser | null): string {
  const words = displayName(user)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
  const result = letters.map((word) => Array.from(word ?? '')[0] ?? '').join('').toLocaleUpperCase('es');
  return result || '·';
}

const TIME = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const DAY_MONTH = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const FULL = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' });

export function formatTime(date: Date): string {
  return TIME.format(date);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatUpdatedAt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return `Hoy, ${TIME.format(date)}`;
  if (days === 1) return `Ayer, ${TIME.format(date)}`;
  const clean = (text: string): string => text.replace(/\.(?=\s|,|$)/g, '');
  if (date.getFullYear() === now.getFullYear()) return `${clean(DAY_MONTH.format(date))}, ${TIME.format(date)}`;
  return clean(DAY_MONTH_YEAR.format(date));
}

export function formatFullDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : FULL.format(date);
}

export function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 ? 1 : 0;
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${units[unit] ?? 'GB'}`;
}

export const VERDICT_TEXT: Record<PreflightVerdict, string> = {
  ok: 'Conforme',
  warnings: 'Con avisos',
  errors: 'Con errores',
};

export function projectHref(id: string): string {
  return `/app?proyecto=${encodeURIComponent(id)}`;
}

export const PROJECT_PARAM = 'proyecto';
