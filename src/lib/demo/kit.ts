export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export const PAGE_W = 210;
export const PAGE_H = 297;
export const BLEED = 3;
export const MM_PER_PT = 25.4 / 72;

export const MARGIN = { top: 17, bottom: 25, outer: 15, inner: 19 } as const;

export const SANS_STACK = '"Archivo Variable", "Helvetica Neue", Arial, sans-serif';
export const SERIF_STACK = 'Georgia, "Times New Roman", serif';

export interface Font {
  family: 'sans' | 'serif';
  size: number;
  weight?: number;
  italic?: boolean;
  tracking?: number;
}

export type Align = 'left' | 'center' | 'right';

export interface Frame {
  n: number;
  x: number;
  side: 'left' | 'right';
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function contentBox(frame: Frame): Box {
  const left = frame.side === 'left' ? MARGIN.outer : MARGIN.inner;
  return {
    x: frame.x + left,
    y: MARGIN.top,
    w: PAGE_W - MARGIN.outer - MARGIN.inner,
    h: PAGE_H - MARGIN.top - MARGIN.bottom,
  };
}

export function bleedBox(frame: Frame): Box {
  return { x: frame.x - BLEED, y: -BLEED, w: PAGE_W + 2 * BLEED, h: PAGE_H + 2 * BLEED };
}

export function outerEdge(frame: Frame, withBleed = false): number {
  const extra = withBleed ? BLEED : 0;
  return frame.side === 'left' ? frame.x - extra : frame.x + PAGE_W + extra;
}

export interface FlowLine {
  text: string;
  dx: number;
  paraStart: boolean;
  paraEnd: boolean;
}

export interface ColumnLayout {
  columns: FlowLine[][];
  height: number;
  dropCap: { letter: string; font: Font; lines: number } | null;
}

export function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export class Pen {
  readonly issues: string[] = [];
  label = '';

  private fontKey = '';
  private readonly widths = new Map<string, number>();
  private readonly hasLetterSpacing: boolean;

  constructor(
    readonly ctx: Ctx2D,
    readonly u: number,
  ) {
    this.hasLetterSpacing = 'letterSpacing' in ctx;
  }

  warn(message: string): void {
    this.issues.push(this.label ? `${this.label}: ${message}` : message);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    const { ctx, u } = this;
    ctx.fillStyle = color;
    ctx.fillRect(x * u, y * u, w * u, h * u);
  }

  box(box: Box, color: string): void {
    this.rect(box.x, box.y, box.w, box.h, color);
  }

  strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth: number, dash?: readonly number[]): void {
    const { ctx, u } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * u;
    ctx.setLineDash(dash ? dash.map((d) => d * u) : []);
    ctx.strokeRect(x * u, y * u, w * u, h * u);
    ctx.setLineDash([]);
  }

  circle(cx: number, cy: number, r: number, color: string): void {
    const { ctx, u } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx * u, cy * u, Math.max(0, r) * u, 0, Math.PI * 2);
    ctx.fill();
  }

  pie(cx: number, cy: number, r: number, from: number, to: number, color: string): void {
    const { ctx, u } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx * u, cy * u);
    ctx.arc(cx * u, cy * u, Math.max(0, r) * u, from, to);
    ctx.closePath();
    ctx.fill();
  }

  arc(cx: number, cy: number, r: number, from: number, to: number, color: string, lineWidth: number): void {
    const { ctx, u } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * u;
    ctx.beginPath();
    ctx.arc(cx * u, cy * u, Math.max(0, r) * u, from, to);
    ctx.stroke();
  }

  halfEllipse(cx: number, cy: number, rx: number, ry: number, color: string, lineWidth: number): void {
    const { ctx, u } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * u;
    ctx.beginPath();
    ctx.ellipse(cx * u, cy * u, Math.max(0, rx) * u, Math.max(0, ry) * u, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  poly(points: readonly number[], color: string): void {
    const { ctx, u } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i + 1 < points.length; i += 2) {
      const px = (points[i] ?? 0) * u;
      const py = (points[i + 1] ?? 0) * u;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, lineWidth: number, dash?: readonly number[]): void {
    const { ctx, u } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * u;
    ctx.setLineDash(dash ? dash.map((d) => d * u) : []);
    ctx.beginPath();
    ctx.moveTo(x1 * u, y1 * u);
    ctx.lineTo(x2 * u, y2 * u);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  clip(x: number, y: number, w: number, h: number, fn: () => void): void {
    const { ctx, u } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x * u, y * u, w * u, h * u);
    ctx.clip();
    try {
      fn();
    } finally {
      ctx.restore();
      this.fontKey = '';
    }
  }

  mirror(axisX: number, fn: () => void): void {
    const { ctx, u } = this;
    ctx.save();
    ctx.translate(2 * axisX * u, 0);
    ctx.scale(-1, 1);
    try {
      fn();
    } finally {
      ctx.restore();
      this.fontKey = '';
    }
  }

  alpha(value: number, fn: () => void): void {
    const { ctx } = this;
    const before = ctx.globalAlpha;
    ctx.globalAlpha = before * value;
    try {
      fn();
    } finally {
      ctx.globalAlpha = before;
    }
  }

  rotate(cx: number, cy: number, angle: number, fn: () => void): void {
    const { ctx, u } = this;
    ctx.save();
    ctx.translate(cx * u, cy * u);
    ctx.rotate(angle);
    ctx.translate(-cx * u, -cy * u);
    try {
      fn();
    } finally {
      ctx.restore();
      this.fontKey = '';
    }
  }

  private applyFont(font: Font): string {
    const px = font.size * MM_PER_PT * this.u;
    const stack = font.family === 'sans' ? SANS_STACK : SERIF_STACK;
    const tracking = font.tracking ?? 0;
    const key = `${font.italic ? 'italic ' : ''}${font.weight ?? 400} ${px.toFixed(2)}px ${stack}`;
    const fullKey = `${key}|${tracking}`;
    if (fullKey !== this.fontKey) {
      this.ctx.font = key;
      if (this.hasLetterSpacing) this.ctx.letterSpacing = `${(tracking * px).toFixed(2)}px`;
      this.fontKey = fullKey;
    }
    return fullKey;
  }

  measure(text: string, font: Font): number {
    if (text === '') return 0;
    const key = `${this.applyFont(font)}|${text}`;
    let width = this.widths.get(key);
    if (width === undefined) {
      width = this.ctx.measureText(text).width / this.u;
      this.widths.set(key, width);
    }
    return width;
  }

  text(text: string, x: number, y: number, font: Font, color: string, align: Align = 'left'): void {
    if (text === '') return;
    this.applyFont(font);
    const { ctx, u } = this;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = align;
    ctx.fillText(text, x * u, y * u);
  }

  wrap(text: string, font: Font, width: number | ((line: number) => number)): string[] {
    const widthOf = typeof width === 'number' ? () => width : width;
    const words = text.split(/\s+/).filter((word) => word !== '');
    const lines: string[][] = [];
    let current: string[] = [];
    for (const word of words) {
      const candidate = [...current, word].join(' ');
      if (current.length > 0 && this.measure(candidate, font) > widthOf(lines.length)) {
        lines.push(current);
        current = [word];
      } else {
        current = [...current, word];
      }
      if (current.length === 1 && this.measure(word, font) > widthOf(lines.length) + 0.01) {
        this.warn(`la palabra «${word}» no cabe en ${widthOf(lines.length).toFixed(1)} mm`);
      }
    }
    if (current.length > 0) lines.push(current);

    const last = lines[lines.length - 1];
    const previous = lines[lines.length - 2];
    if (last && previous && last.length === 1 && previous.length >= 3) {
      const moved = previous[previous.length - 1] ?? '';
      if (this.measure(`${moved} ${last[0] ?? ''}`, font) <= widthOf(lines.length - 1)) {
        previous.pop();
        last.unshift(moved);
      }
    }
    return lines.map((line) => line.join(' '));
  }

  leading(font: Font, factor: number): number {
    return font.size * MM_PER_PT * factor;
  }

  blockHeight(text: string, width: number, font: Font, factor = 1.3): number {
    return this.wrap(text, font, width).length * this.leading(font, factor);
  }

  block(
    text: string,
    x: number,
    y: number,
    width: number,
    font: Font,
    color: string,
    options: { factor?: number; align?: Align; maxHeight?: number } = {},
  ): number {
    const factor = options.factor ?? 1.3;
    const align = options.align ?? 'left';
    const lead = this.leading(font, factor);
    const lines = this.wrap(text, font, width);
    const anchor = align === 'left' ? x : align === 'center' ? x + width / 2 : x + width;
    const ascent = font.size * MM_PER_PT * 0.8;
    lines.forEach((line, index) => this.text(line, anchor, y + ascent + index * lead, font, color, align));
    const height = lines.length * lead;
    if (options.maxHeight !== undefined && height > options.maxHeight + 0.01) {
      this.warn(`el texto «${text.slice(0, 28)}…» mide ${height.toFixed(1)} mm y solo hay ${options.maxHeight.toFixed(1)}`);
    }
    return y + height;
  }

  fit(text: string, font: Font, width: number, maxLines: number, minSize = 12): Font {
    const longest = text.split(/\s+/).reduce((a, b) => (a.length >= b.length ? a : b), '');
    for (let size = font.size; size > minSize; size -= 1) {
      const candidate = { ...font, size };
      if (this.measure(longest, candidate) > width) continue;
      const before = this.issues.length;
      const lines = this.wrap(text, candidate, width);
      this.issues.length = before;
      if (lines.length <= maxLines) return candidate;
    }
    return { ...font, size: minSize };
  }

  layoutColumns(
    paragraphs: readonly string[],
    font: Font,
    width: number,
    count: number,
    options: { factor?: number; dropCapLines?: number } = {},
  ): ColumnLayout {
    const lead = this.leading(font, options.factor ?? 1.42);
    const bodyMm = font.size * MM_PER_PT;
    const capLines = options.dropCapLines ?? 0;
    const lines: FlowLine[] = [];
    let dropCap: ColumnLayout['dropCap'] = null;

    paragraphs.forEach((paragraph, index) => {
      let text = paragraph;
      let widthOf: number | ((line: number) => number) = width;
      let dxOf = (_line: number): number => 0;
      if (index === 0 && capLines > 0) {
        const letter = text.charAt(0);
        text = text.slice(1);
        const capFont: Font = { family: 'sans', weight: 800, size: ((capLines - 1) * lead + bodyMm * 0.7) / 0.7 / MM_PER_PT };
        const capWidth = this.measure(letter, capFont) + 1.6;
        dropCap = { letter, font: capFont, lines: capLines };
        widthOf = (line) => (line < capLines ? width - capWidth : width);
        dxOf = (line) => (line < capLines ? capWidth : 0);
      } else if (index > 0) {
        const indent = bodyMm * 1.1;
        widthOf = (line) => (line === 0 ? width - indent : width);
        dxOf = (line) => (line === 0 ? indent : 0);
      }
      const wrapped = this.wrap(text, font, widthOf);
      wrapped.forEach((line, lineIndex) => {
        lines.push({ text: line, dx: dxOf(lineIndex), paraStart: lineIndex === 0, paraEnd: lineIndex === wrapped.length - 1 });
      });
    });

    const columns = splitColumns(lines, count, capLines);
    const tallest = columns.reduce((max, column) => Math.max(max, column.length), 0);
    return { columns, height: tallest * lead, dropCap };
  }

  drawColumns(
    layout: ColumnLayout,
    x: number,
    y: number,
    width: number,
    gap: number,
    font: Font,
    color: string,
    options: { factor?: number; dropCapColor?: string } = {},
  ): void {
    const lead = this.leading(font, options.factor ?? 1.42);
    const ascent = font.size * MM_PER_PT * 0.8;
    layout.columns.forEach((column, columnIndex) => {
      const columnX = x + columnIndex * (width + gap);
      column.forEach((line, lineIndex) => {
        this.text(line.text, columnX + line.dx, y + ascent + lineIndex * lead, font, color);
      });
    });
    const cap = layout.dropCap;
    if (cap) {
      this.text(cap.letter, x - 0.3, y + ascent + (cap.lines - 1) * lead, cap.font, options.dropCapColor ?? color);
    }
  }
}

export function splitColumns(lines: readonly FlowLine[], count: number, keepTogether = 0): FlowLine[][] {
  if (count <= 1 || lines.length === 0) return [lines.slice()];
  for (let target = Math.ceil(lines.length / count); target <= lines.length; target++) {
    const columns: FlowLine[][] = [];
    let start = 0;
    for (let column = 0; column < count; column++) {
      if (column === count - 1) {
        columns.push(lines.slice(start));
        break;
      }
      let end = Math.min(lines.length, start + target);
      if (end < lines.length) {
        const next = lines[end];
        const prev = lines[end - 1];
        if (next && next.paraEnd && !next.paraStart) end -= 1;
        else if (prev && prev.paraStart && !prev.paraEnd) end -= 1;
      }
      if (column === 0) end = Math.max(end, Math.min(keepTogether, lines.length));
      end = Math.max(end, start + 1);
      columns.push(lines.slice(start, end));
      start = end;
    }
    const lastColumn = columns[columns.length - 1] ?? [];
    if (lastColumn.length <= target) return columns;
  }
  return [lines.slice()];
}
