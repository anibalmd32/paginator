import type { MagazineConfig, ReadingDirection } from '@/lib/types';
import { ISSUE_NUMBER, MAGAZINE_NAME } from './content';
import { createSurface, describeDemoFiles, ensureDemoFonts, renderDemoFile, yieldToEventLoop } from './files';
import { PAGE_H } from './kit';
import type { Ctx2D } from './kit';
import { DEFAULT_PAGES, normalizePageCount } from './plan';
import { pageRegion, renderSpread } from './render';
import { frameOf } from './scene';

export type DemoVariant = 'pages' | 'reader-spreads' | 'printer-spreads';

export interface DemoOptions {
  pageCount?: number;
  variant?: DemoVariant;
  withBleedAndMarks?: boolean;
  pageHeightPx?: number;
  readingDirection?: ReadingDirection;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export const DEMO_TITLE = `${MAGAZINE_NAME} nº ${ISSUE_NUMBER} (ejemplo)`;

const JPEG_QUALITY = 0.9;
const DEFAULT_PAGE_HEIGHT_PX = 1754;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Generación cancelada', 'AbortError');
}

export async function generateDemoFiles(options: DemoOptions = {}): Promise<File[]> {
  const total = normalizePageCount(options.pageCount ?? DEFAULT_PAGES);
  const variant = options.variant ?? 'pages';
  const dir = options.readingDirection ?? 'ltr';
  const marks = options.withBleedAndMarks ?? false;
  const pageHeightPx = Math.max(64, Math.round(options.pageHeightPx ?? DEFAULT_PAGE_HEIGHT_PX));
  const pxPerMm = pageHeightPx / PAGE_H;
  const specs = describeDemoFiles(total, variant, dir, marks);
  const { signal, onProgress } = options;

  await ensureDemoFonts();
  const files: File[] = [];
  onProgress?.(0, specs.length);
  for (const spec of specs) {
    if (signal?.aborted) throw abortError(signal);
    const width = Math.round(spec.widthMm * pxPerMm);
    const height = Math.round(spec.heightMm * pxPerMm);
    const surface = createSurface(width, height);
    const issues = renderDemoFile(surface.ctx, spec, total, dir, marks, width, height);
    if (issues.length > 0) console.warn(`Revista de ejemplo: composición con avisos en ${spec.name}`, issues);
    const blob = await surface.toJpeg(JPEG_QUALITY);
    files.push(new File([blob], spec.name, { type: 'image/jpeg', lastModified: 0 }));
    onProgress?.(files.length, specs.length);
    await yieldToEventLoop();
  }
  if (signal?.aborted) throw abortError(signal);
  return files;
}

export function drawDemoPage(ctx: Ctx2D, pageNumber: number, total: number, w: number, h: number, direction: ReadingDirection = 'ltr'): void {
  const pages = normalizePageCount(total);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pages) {
    throw new RangeError(`La página ${pageNumber} no existe en un ejemplar de ${pages} páginas`);
  }
  checkDemoPage(ctx, pageNumber, pages, w, h, direction);
}

export function checkDemoPage(ctx: Ctx2D, pageNumber: number, total: number, w: number, h: number, direction: ReadingDirection = 'ltr'): string[] {
  const pages = normalizePageCount(total);
  const frame = frameOf(pageNumber, direction);
  const region = pageRegion(frame.x, { top: 0, bottom: 0, left: 0, right: 0 });
  return renderSpread({ ctx, region, dest: { x: 0, y: 0, w, h } }, Math.floor(pageNumber / 2), pages, direction);
}

export const prepareDemoFonts: () => Promise<void> = ensureDemoFonts;

export function demoConfigPatch(options: DemoOptions = {}): Partial<MagazineConfig> {
  const total = normalizePageCount(options.pageCount ?? DEFAULT_PAGES);
  const variant = options.variant ?? 'pages';
  const marks = options.withBleedAndMarks ?? false;
  const patch: Partial<MagazineConfig> = {
    title: DEMO_TITLE,
    inputMode: variant === 'pages' ? 'pages' : 'spreads',
    spreadKind: variant === 'printer-spreads' ? 'printer' : 'reader',
    wraparoundCover: false,
    binding: 'saddle-stitch',
    declaredPageCount: total,
    readingDirection: options.readingDirection ?? 'ltr',
    bleedMm: marks ? 3 : 0,
    marksMm: marks ? 5 : 0,
    trim: { mode: 'auto' },
  };
  return patch;
}

export { describeDemoFiles } from './files';
export type { DemoFileSpec } from './files';
