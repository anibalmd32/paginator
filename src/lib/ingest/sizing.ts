import type { NormRect, RasterTier } from '@/lib/types';

const TIER_LONG_SIDE: Readonly<Record<RasterTier, number>> = { thumb: 320, mid: 1200, high: 2600 };

export function tierLongSide(tier: RasterTier): number {
  return TIER_LONG_SIDE[tier];
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL_RECT: NormRect = { x: 0, y: 0, w: 1, h: 1 };

export function normalizeRect(rect: NormRect): NormRect {
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every(Number.isFinite)) return FULL_RECT;
  const x0 = Math.min(1, Math.max(0, x));
  const y0 = Math.min(1, Math.max(0, y));
  const x1 = Math.min(1, Math.max(0, x + w));
  const y1 = Math.min(1, Math.max(0, y + h));
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return FULL_RECT;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectKey(rect: NormRect): string {
  const r = normalizeRect(rect);
  return [r.x, r.y, r.w, r.h].map((value) => value.toFixed(4)).join(',');
}

export function cropPixels(rect: NormRect, width: number, height: number): PixelRect {
  const r = normalizeRect(rect);
  const x0 = Math.min(width - 1, Math.max(0, Math.round(r.x * width)));
  const y0 = Math.min(height - 1, Math.max(0, Math.round(r.y * height)));
  const x1 = Math.min(width, Math.max(x0 + 1, Math.round((r.x + r.w) * width)));
  const y1 = Math.min(height, Math.max(y0 + 1, Math.round((r.y + r.h) * height)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const STEPS_PER_OCTAVE = 4;

export function scaleStepIndex(scale: number): number {
  return Math.ceil(Math.log2(scale) * STEPS_PER_OCTAVE - 1e-9) + 0;
}

export function scaleOfStep(index: number): number {
  return 2 ** (index / STEPS_PER_OCTAVE);
}

export interface RasterLimits {
  maxPixels: number;
  maxSide: number;
}

export interface PdfRasterPlan {
  step: number;
  scale: number;
  surfaceWidth: number;
  surfaceHeight: number;
  crop: PixelRect;
}

export function planPdfRaster(
  unitWidth: number,
  unitHeight: number,
  rect: NormRect,
  longSide: number,
  limits: RasterLimits,
): PdfRasterPlan {
  const r = normalizeRect(rect);
  const regionLongSide = Math.max(r.w * unitWidth, r.h * unitHeight);
  const wanted = scaleStepIndex(longSide / regionLongSide);
  const cap = Math.min(Math.sqrt(limits.maxPixels / (unitWidth * unitHeight)), limits.maxSide / Math.max(unitWidth, unitHeight));
  const highest = Math.floor(Math.log2(cap) * STEPS_PER_OCTAVE + 1e-9);
  const step = Math.min(wanted, highest);
  const scale = scaleOfStep(step);
  const surfaceWidth = Math.max(1, Math.round(unitWidth * scale));
  const surfaceHeight = Math.max(1, Math.round(unitHeight * scale));
  return { step, scale, surfaceWidth, surfaceHeight, crop: cropPixels(r, surfaceWidth, surfaceHeight) };
}

export interface ImageRasterPlan {
  crop: PixelRect;
  outWidth: number;
  outHeight: number;
  scale: number;
}

export function planImageRaster(naturalWidth: number, naturalHeight: number, rect: NormRect, longSide: number): ImageRasterPlan {
  const crop = cropPixels(rect, naturalWidth, naturalHeight);
  const scale = Math.min(1, longSide / Math.max(crop.w, crop.h));
  return {
    crop,
    outWidth: Math.max(1, Math.round(crop.w * scale)),
    outHeight: Math.max(1, Math.round(crop.h * scale)),
    scale,
  };
}

const MEBIBYTE = 1024 * 1024;

export function cacheBudgetBytes(deviceMemoryGb: number | undefined): number {
  return deviceMemoryGb !== undefined && deviceMemoryGb <= 4 ? 128 * MEBIBYTE : 256 * MEBIBYTE;
}

export function rasterLimits(budgetBytes: number): RasterLimits {
  return { maxPixels: Math.floor(budgetBytes / 2 / 4), maxSide: 16384 };
}

export function pointsToMm(points: number): number {
  return Math.round(((points * 25.4) / 72) * 1000) / 1000;
}
