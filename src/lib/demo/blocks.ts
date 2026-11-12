import { MM_PER_PT } from './kit';
import type { Align, ColumnLayout, Font, Pen } from './kit';

export const BODY: Font = { family: 'serif', size: 9.4 };
export const BODY_FACTOR = 1.45;
export const CAPTION: Font = { family: 'sans', size: 7, weight: 500 };
export const KICKER: Font = { family: 'sans', size: 7.5, weight: 800, tracking: 0.16 };
export const BYLINE: Font = { family: 'sans', size: 7.5, weight: 600, tracking: 0.04 };

export function kicker(pen: Pen, text: string, x: number, y: number, color: string, align: Align = 'left'): number {
  const label = text.toUpperCase();
  const size = KICKER.size * MM_PER_PT;
  const baseline = y + size * 0.8;
  if (align === 'left') {
    pen.rect(x, baseline - size * 0.38, 6, 0.7, color);
    pen.text(label, x + 8, baseline, KICKER, color);
  } else {
    pen.text(label, x, baseline, KICKER, color, align);
  }
  return y + size * 1.4;
}

export function headline(
  pen: Pen,
  text: string,
  x: number,
  y: number,
  width: number,
  font: Font,
  color: string,
  options: { maxLines?: number; minSize?: number; align?: Align; maxHeight?: number } = {},
): number {
  const minSize = options.minSize ?? 14;
  let fitted = pen.fit(text, font, width, options.maxLines ?? 3, minSize);
  const maxHeight = options.maxHeight;
  if (maxHeight !== undefined) {
    while (fitted.size > minSize && pen.blockHeight(text, width, fitted, 0.98) > maxHeight) {
      fitted = pen.fit(text, { ...fitted, size: fitted.size - 1 }, width, options.maxLines ?? 3, minSize);
    }
  }
  const blockOptions: { factor: number; align: Align; maxHeight?: number } = { factor: 0.98, align: options.align ?? 'left' };
  if (options.maxHeight !== undefined) blockOptions.maxHeight = options.maxHeight;
  return pen.block(text, x, y, width, fitted, color, blockOptions);
}

export function standfirst(pen: Pen, text: string, x: number, y: number, width: number, color: string, size = 12.5, maxHeight?: number): number {
  const font: Font = { family: 'serif', size, italic: false };
  const options: { factor: number; maxHeight?: number } = { factor: 1.32 };
  if (maxHeight !== undefined) options.maxHeight = maxHeight;
  return pen.block(text, x, y, width, font, color, options);
}

export function byline(pen: Pen, author: string, x: number, y: number, width: number, color: string): number {
  return pen.block(`Texto: ${author} · Ilustración: Estudio Canto`, x, y, width, BYLINE, color, { factor: 1.3 });
}

export function pullQuote(
  pen: Pen,
  text: string,
  x: number,
  y: number,
  width: number,
  color: string,
  options: { size?: number; maxHeight?: number; rule?: string; align?: Align } = {},
): number {
  const rule = options.rule ?? color;
  pen.rect(x, y, Math.min(width, 24), 1.4, rule);
  const maxHeight = options.maxHeight ?? 120;
  let font: Font = { family: 'serif', size: options.size ?? 17, italic: true };
  const quoted = `«${text}»`;
  while (font.size > 9 && pen.blockHeight(quoted, width, font, 1.22) > maxHeight - 7) font = { ...font, size: font.size - 0.5 };
  return pen.block(quoted, x, y + 6, width, font, color, { factor: 1.22, align: options.align ?? 'left', maxHeight: maxHeight - 6 });
}

export function caption(pen: Pen, text: string, x: number, y: number, width: number, color: string, maxHeight?: number): number {
  const size = CAPTION.size * MM_PER_PT;
  pen.poly([x, y + size * 0.15, x + size * 0.7, y + size * 0.15, x + size * 0.35, y + size * 0.75], color);
  const options: { factor: number; maxHeight?: number } = { factor: 1.32 };
  if (maxHeight !== undefined) options.maxHeight = maxHeight;
  return pen.block(text, x + size * 1.1, y, width - size * 1.1, CAPTION, color, options);
}

export interface FlowOptions {
  dropCapLines?: number;
  dropCapColor?: string;
  font?: Font;
}

export function flow(
  pen: Pen,
  paragraphs: readonly string[],
  xs: readonly number[],
  y: number,
  width: number,
  maxHeight: number,
  color: string,
  options: FlowOptions = {},
): ColumnLayout {
  const font = options.font ?? BODY;
  const capLines = options.dropCapLines ?? 0;
  let count = paragraphs.length;
  let layout = pen.layoutColumns(paragraphs, font, width, xs.length, { factor: BODY_FACTOR, dropCapLines: capLines });
  while (layout.height > maxHeight + 0.01 && count > 1) {
    count--;
    layout = pen.layoutColumns(paragraphs.slice(0, count), font, width, xs.length, { factor: BODY_FACTOR, dropCapLines: capLines });
  }
  if (layout.height > maxHeight + 0.01) pen.warn(`el texto corrido mide ${layout.height.toFixed(1)} mm y solo hay ${maxHeight.toFixed(1)}`);

  const lead = pen.leading(font, BODY_FACTOR);
  const ascent = font.size * MM_PER_PT * 0.8;
  layout.columns.forEach((column, index) => {
    const x = xs[index] ?? xs[xs.length - 1] ?? 0;
    column.forEach((line, lineIndex) => pen.text(line.text, x + line.dx, y + ascent + lineIndex * lead, font, color));
  });
  const cap = layout.dropCap;
  const firstX = xs[0];
  if (cap && firstX !== undefined) {
    pen.text(cap.letter, firstX - 0.3, y + ascent + (cap.lines - 1) * lead, cap.font, options.dropCapColor ?? color);
  }
  const lastColumn = layout.columns[layout.columns.length - 1];
  const lastLine = lastColumn?.[lastColumn.length - 1];
  if (lastColumn && lastLine && count === paragraphs.length) {
    const lastX = xs[layout.columns.length - 1] ?? 0;
    const endX = lastX + lastLine.dx + pen.measure(lastLine.text, font) + 1.2;
    const baseline = y + ascent + (lastColumn.length - 1) * lead;
    const s = font.size * MM_PER_PT * 0.5;
    if (endX + s <= lastX + width) pen.rect(endX, baseline - s, s, s, options.dropCapColor ?? color);
  }
  return layout;
}

export function columnXs(x: number, width: number, count: number, gap: number): { xs: number[]; width: number } {
  const columnWidth = (width - gap * (count - 1)) / count;
  return { xs: Array.from({ length: count }, (_, i) => x + i * (columnWidth + gap)), width: columnWidth };
}

export function flowHeight(pen: Pen, paragraphs: readonly string[], count: number, width: number, dropCapLines = 0, font: Font = BODY): number {
  const before = pen.issues.length;
  const layout = pen.layoutColumns(paragraphs, font, width, count, { factor: BODY_FACTOR, dropCapLines });
  pen.issues.length = before;
  return layout.height;
}
