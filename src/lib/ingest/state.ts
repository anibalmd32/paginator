import type { PDFDocumentProxy } from 'pdfjs-dist';

import type { SourceUnit } from '@/lib/types';

import { ByteLru } from './lru';
import { cacheBudgetBytes } from './sizing';

export interface Surface {
  readonly bitmap: ImageBitmap;
  readonly assetId: string;
  readonly unitId: string;
  readonly step: number | null;
  readonly bytes: number;
  refs: number;
  cached: boolean;
}

export interface AssetRecord {
  readonly id: string;
  readonly file: File;
  readonly units: SourceUnit[];
  readonly pdf: PDFDocumentProxy | null;
  readonly destroyPdf: (() => Promise<void>) | null;
  readonly thumbs: Map<string, string>;
  released: boolean;
}

export interface UnitRecord {
  readonly unit: SourceUnit;
  readonly asset: AssetRecord;
}

export const assets = new Map<string, AssetRecord>();
export const units = new Map<string, UnitRecord>();

function deviceMemory(): number | undefined {
  const memory = (globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory;
  return typeof memory === 'number' ? memory : undefined;
}

export const CACHE_BUDGET_BYTES = cacheBudgetBytes(deviceMemory());

export const surfaceCache = new ByteLru<string, Surface>(CACHE_BUDGET_BYTES, (surface) => {
  surface.cached = false;
  if (surface.refs === 0) surface.bitmap.close();
});

export function surfaceKey(unitId: string, step: number | null): string {
  return `${unitId}@${step ?? 'nativa'}`;
}

export function createSurface(bitmap: ImageBitmap, assetId: string, unitId: string, step: number | null): Surface {
  return { bitmap, assetId, unitId, step, bytes: bitmap.width * bitmap.height * 4, refs: 0, cached: false };
}

export function cacheSurface(surface: Surface): void {
  if (surfaceCache.set(surfaceKey(surface.unitId, surface.step), surface, surface.bytes)) surface.cached = true;
}

export function retainSurface(surface: Surface): void {
  surface.refs++;
}

export function releaseSurface(surface: Surface): void {
  surface.refs = Math.max(0, surface.refs - 1);
  disposeIfUnowned(surface);
}

export function disposeIfUnowned(surface: Surface): void {
  if (surface.refs === 0 && !surface.cached) surface.bitmap.close();
}

export function registerAsset(record: AssetRecord): void {
  assets.set(record.id, record);
  for (const unit of record.units) units.set(unit.id, { unit, asset: record });
}

export function newAssetId(): string {
  return `a-${crypto.randomUUID().slice(0, 13)}`;
}

export function unitIdOf(assetId: string, indexInAsset: number): string {
  return `${assetId}/${indexInAsset}`;
}
