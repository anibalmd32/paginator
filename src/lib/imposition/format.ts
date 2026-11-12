import type { TrimSize } from '@/lib/types';

export function formatNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(maxDecimals);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return (Number(trimmed) === 0 ? trimmed.replace('-', '') : trimmed).replace('.', ',').replace('-', '−');
}

export function formatMm(value: number, maxDecimals = 2): string {
  return `${formatNumber(value, maxDecimals)} mm`;
}

export function formatSizeMm(size: TrimSize): string {
  return `${formatNumber(size.widthMm, 1)} × ${formatNumber(size.heightMm, 1)} mm`;
}

export function formatSigned(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

export function uniqueSorted(numbers: readonly number[]): number[] {
  return [...new Set(numbers)].sort((a, b) => a - b);
}

function consecutiveRuns(numbers: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const value of uniqueSorted(numbers)) {
    const current = runs[runs.length - 1];
    if (current && value === current[1] + 1) current[1] = value;
    else runs.push([value, value]);
  }
  return runs;
}

export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1] ?? ''}`;
}

export function formatNumberList(numbers: readonly number[], maxItems = 10): string {
  const items: string[] = [];
  for (const [start, end] of consecutiveRuns(numbers)) {
    if (end - start >= 2) items.push(`${String(start)}–${String(end)}`);
    else for (let value = start; value <= end; value += 1) items.push(String(value));
  }
  if (items.length <= maxItems) return joinList(items);
  return `${items.slice(0, maxItems).join(', ')}… (${String(uniqueSorted(numbers).length)} en total)`;
}

export function pagesPhrase(numbers: readonly number[]): string {
  const count = uniqueSorted(numbers).length;
  return `${plural(count, 'la página', 'las páginas')} ${formatNumberList(numbers)}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function rangeKey(numbers: readonly number[]): string {
  return consecutiveRuns(numbers)
    .map(([start, end]) => (start === end ? String(start) : `${String(start)}-${String(end)}`))
    .join(',');
}
