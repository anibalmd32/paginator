import type { ReadingDirection } from '@/lib/types';
import { BLEED, PAGE_H, PAGE_W } from './kit';
import type { Ctx2D } from './kit';
import { normalizePageCount, printerSides } from './plan';
import { pageRegion, renderSpread } from './render';
import { frameOf, SPINE } from './scene';

export const MARKS = 5;

export interface DemoFilePart {
  page: number;
  side: 'left' | 'right';
}

export interface DemoFileSpec {
  name: string;
  kind: 'page' | 'reader-spread' | 'printer-side';
  parts: DemoFilePart[];
  spreadIndex: number | null;
  widthMm: number;
  heightMm: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function describeDemoFiles(
  totalPages: number,
  variant: 'pages' | 'reader-spreads' | 'printer-spreads',
  dir: ReadingDirection,
  withBleedAndMarks: boolean,
): DemoFileSpec[] {
  const total = normalizePageCount(totalPages);
  const extra = withBleedAndMarks ? BLEED + MARKS : 0;
  const single = (n: number): DemoFileSpec => ({
    name: `canto_p${pad(n)}.jpg`,
    kind: 'page',
    parts: [{ page: n, side: frameOf(n, dir).side }],
    spreadIndex: null,
    widthMm: PAGE_W + 2 * extra,
    heightMm: PAGE_H + 2 * extra,
  });
  const double = { widthMm: 2 * PAGE_W + 2 * extra, heightMm: PAGE_H + 2 * extra };

  if (variant === 'pages') return Array.from({ length: total }, (_, i) => single(i + 1));
  if (variant === 'reader-spreads') {
    const files: DemoFileSpec[] = [single(1)];
    for (let s = 1; s < total / 2; s++) {
      const even = 2 * s;
      const odd = 2 * s + 1;
      const parts: DemoFilePart[] =
        dir === 'ltr'
          ? [
              { page: even, side: 'left' },
              { page: odd, side: 'right' },
            ]
          : [
              { page: odd, side: 'left' },
              { page: even, side: 'right' },
            ];
      files.push({ name: `canto_pliego_${pad(even)}-${pad(odd)}.jpg`, kind: 'reader-spread', parts, spreadIndex: s, ...double });
    }
    files.push(single(total));
    return files;
  }
  return printerSides(total, dir).map((side) => ({
    name: `canto_pliego${pad(side.sheet + 1)}_${side.face === 'front' ? 'cara' : 'retiro'}.jpg`,
    kind: 'printer-side',
    parts: [
      { page: side.left, side: 'left' },
      { page: side.right, side: 'right' },
    ],
    spreadIndex: null,
    ...double,
  }));
}

export function renderDemoFile(
  ctx: Ctx2D,
  spec: DemoFileSpec,
  total: number,
  dir: ReadingDirection,
  withBleedAndMarks: boolean,
  widthPx: number,
  heightPx: number,
): string[] {
  const u = widthPx / spec.widthMm;
  const v = heightPx / spec.heightMm;
  const bleed = withBleedAndMarks ? BLEED : 0;
  const marks = withBleedAndMarks ? MARKS : 0;
  const issues: string[] = [];
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.restore();

  if (spec.kind === 'reader-spread' && spec.spreadIndex !== null) {
    const region = { x: -bleed, y: -bleed, w: 2 * PAGE_W + 2 * bleed, h: PAGE_H + 2 * bleed };
    const dest = { x: marks * u, y: marks * v, w: region.w * u, h: region.h * v };
    issues.push(...renderSpread({ ctx, region, dest }, spec.spreadIndex, total, dir));
  } else if (spec.kind === 'page') {
    const part = spec.parts[0];
    if (part) {
      const frame = frameOf(part.page, dir);
      const region = pageRegion(frame.x, { top: bleed, bottom: bleed, left: bleed, right: bleed });
      const dest = { x: marks * u, y: marks * v, w: region.w * u, h: region.h * v };
      issues.push(...renderSpread({ ctx, region, dest }, Math.floor(part.page / 2), total, dir));
    }
  } else {
    for (const part of spec.parts) {
      const frame = frameOf(part.page, dir);
      const outerLeft = part.side === 'left' ? bleed : 0;
      const outerRight = part.side === 'right' ? bleed : 0;
      const region = pageRegion(frame.x, { top: bleed, bottom: bleed, left: outerLeft, right: outerRight });
      const x = part.side === 'left' ? marks : marks + bleed + PAGE_W;
      const dest = { x: x * u, y: marks * v, w: region.w * u, h: region.h * v };
      issues.push(...renderSpread({ ctx, region, dest }, Math.floor(part.page / 2), total, dir));
    }
  }

  if (withBleedAndMarks) drawMarks(ctx, spec, u, v);
  return issues;
}

function drawMarks(ctx: Ctx2D, spec: DemoFileSpec, u: number, v: number): void {
  const off = BLEED + MARKS;
  const trimLeft = off;
  const trimRight = spec.widthMm - off;
  const trimTop = off;
  const trimBottom = spec.heightMm - off;
  const from = BLEED + 1;
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, 0.1 * u);
  ctx.beginPath();
  for (const x of [trimLeft, trimRight]) {
    ctx.moveTo(x * u, 0);
    ctx.lineTo(x * u, (trimTop - from) * v);
    ctx.moveTo(x * u, (trimBottom + from) * v);
    ctx.lineTo(x * u, spec.heightMm * v);
  }
  for (const y of [trimTop, trimBottom]) {
    ctx.moveTo(0, y * v);
    ctx.lineTo((trimLeft - from) * u, y * v);
    ctx.moveTo((trimRight + from) * u, y * v);
    ctx.lineTo(spec.widthMm * u, y * v);
  }
  ctx.stroke();
  if (spec.parts.length === 2) {
    const fold = (off + SPINE) * u;
    ctx.setLineDash([1.5 * u, 1 * u]);
    ctx.beginPath();
    ctx.moveTo(fold, 0);
    ctx.lineTo(fold, (trimTop - from) * v);
    ctx.moveTo(fold, (trimBottom + from) * v);
    ctx.lineTo(fold, spec.heightMm * v);
    ctx.stroke();
  }
  ctx.restore();
}

export async function ensureDemoFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.all([
      document.fonts.load('700 48px "Archivo Variable"'),
      document.fonts.load('900 48px "Archivo Variable"'),
      document.fonts.load('400 16px Georgia'),
      document.fonts.load('italic 400 16px Georgia'),
    ]);
  } catch (error) {
    console.warn('Revista de ejemplo: no se pudieron cargar las fuentes; se usará la de reserva.', error);
  }
  await document.fonts.ready;
}

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface Surface {
  ctx: Ctx2D;
  toJpeg: (quality: number) => Promise<Blob>;
}

export function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no ofrece un contexto 2D para OffscreenCanvas');
    return { ctx, toJpeg: (quality) => canvas.convertToBlob({ type: 'image/jpeg', quality }) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no ofrece un contexto 2D para canvas');
  return {
    ctx,
    toJpeg: (quality) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo codificar el JPEG'))), 'image/jpeg', quality);
      }),
  };
}
