export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = String(step);
  if (text.includes('e-')) return Number.parseInt(text.split('e-')[1] ?? '0', 10);
  return text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0;
}

export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace(/\s+/g, '').replace(',', '.').replace('−', '-');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  const value = Number.parseFloat(clean);
  return Number.isFinite(value) ? value : null;
}

export function formatDecimal(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return '';
  const rounded = roundTo(value, maxDecimals);
  return String(rounded + 0).replace('.', ',');
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** Math.max(0, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export interface NumberBounds {
  min?: number | undefined;
  max?: number | undefined;
}

export function clampNumber(value: number, { min, max }: NumberBounds): number {
  let result = value;
  if (min !== undefined && result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
}

export function stepNumber(value: number, steps: number, step: number, bounds: NumberBounds = {}): number {
  const size = step > 0 ? step : 1;
  const origin = bounds.min ?? 0;
  const position = (value - origin) / size;
  const aligned = Math.abs(position - Math.round(position)) < 1e-9;
  const base = aligned ? Math.round(position) : steps > 0 ? Math.floor(position) : Math.ceil(position);
  const next = origin + (base + steps) * size;
  return clampNumber(roundTo(next, stepDecimals(size) + stepDecimals(origin)), bounds);
}
