import type { NormRect, RasterTier } from '@/lib/types';

import { decodeImage } from './image';
import { renderPdfPage } from './pdf';
import { abortError, JobQueue, SharedJob, throwIfAborted } from './queue';
import type { Priority } from './queue';
import { cropPixels, normalizeRect, planImageRaster, planPdfRaster, rasterLimits, rectKey, tierLongSide } from './sizing';
import {
  assets,
  CACHE_BUDGET_BYTES,
  cacheSurface,
  createSurface,
  releaseSurface,
  retainSurface,
  surfaceCache,
  surfaceKey,
  units,
} from './state';
import type { AssetRecord, Surface, UnitRecord } from './state';

const pdfQueue = new JobQueue(2);
const imageQueue = new JobQueue(3);
const thumbQueue = new JobQueue(4);

const pendingSurfaces = new Map<string, SharedJob<Surface>>();
const pendingThumbs = new Map<string, SharedJob<string>>();

const LIMITS = rasterLimits(CACHE_BUDGET_BYTES);

const REUSE_STEPS_ABOVE = 8;

function unitRecord(unitId: string): UnitRecord {
  const record = units.get(unitId);
  if (!record) throw new Error('Esa página ya no está cargada: su archivo se quitó del proyecto.');
  return record;
}

function acquireSurface(
  record: UnitRecord,
  step: number | null,
  queue: JobQueue,
  produce: (signal: AbortSignal) => Promise<ImageBitmap>,
  priority: Priority,
  signal: AbortSignal | undefined,
): Promise<Surface> {
  const { unit, asset } = record;
  const key = surfaceKey(unit.id, step);
  const cached = surfaceCache.get(key);
  if (cached) {
    retainSurface(cached);
    return Promise.resolve(cached);
  }

  let shared = pendingSurfaces.get(key);
  if (!shared) {
    const job = queue.enqueue(
      async (jobSignal) => {
        const bitmap = await produce(jobSignal);
        if (asset.released) {
          bitmap.close();
          throw abortError();
        }
        const surface = createSurface(bitmap, asset.id, unit.id, step);
        retainSurface(surface);
        cacheSurface(surface);
        return surface;
      },
      priority,
      releaseSurface,
    );
    const created = new SharedJob(job, {
      onDeliver: retainSurface,
      onSettled: () => {
        if (pendingSurfaces.get(key) === created) pendingSurfaces.delete(key);
      },
    });
    job.promise.then(releaseSurface, () => undefined);
    pendingSurfaces.set(key, created);
    shared = created;
  }
  return shared.join(signal, priority);
}

function cropSurface(surface: Surface, rect: NormRect, outWidth: number, outHeight: number): Promise<ImageBitmap> {
  const crop = cropPixels(rect, surface.bitmap.width, surface.bitmap.height);
  if (crop.w === outWidth && crop.h === outHeight) {
    return createImageBitmap(surface.bitmap, crop.x, crop.y, crop.w, crop.h);
  }
  return createImageBitmap(surface.bitmap, crop.x, crop.y, crop.w, crop.h, {
    resizeWidth: outWidth,
    resizeHeight: outHeight,
    resizeQuality: 'high',
  });
}

interface SurfaceRequest {
  surface: Promise<Surface>;
  outWidth: number;
  outHeight: number;
}

function requestPdfSurface(
  record: UnitRecord,
  rect: NormRect,
  tier: RasterTier,
  priority: Priority,
  signal: AbortSignal | undefined,
): SurfaceRequest {
  const { unit, asset } = record;
  const doc = asset.pdf;
  if (!doc) throw new Error(`El PDF “${asset.file.name}” ya no está abierto.`);
  const plan = planPdfRaster(unit.width, unit.height, rect, tierLongSide(tier), LIMITS);
  const out = { outWidth: plan.crop.w, outHeight: plan.crop.h };

  if (!surfaceCache.has(surfaceKey(unit.id, plan.step))) {
    for (let step = plan.step + 1; step <= plan.step + REUSE_STEPS_ABOVE; step++) {
      const finer = surfaceCache.get(surfaceKey(unit.id, step));
      if (finer) {
        retainSurface(finer);
        return { surface: Promise.resolve(finer), ...out };
      }
    }
  }

  const surface = acquireSurface(
    record,
    plan.step,
    pdfQueue,
    (jobSignal) => renderPdfPage(doc, unit.indexInAsset + 1, plan.surfaceWidth, plan.surfaceHeight, jobSignal),
    priority,
    signal,
  );
  return { surface, ...out };
}

function requestImageSurface(
  record: UnitRecord,
  rect: NormRect,
  tier: RasterTier,
  priority: Priority,
  signal: AbortSignal | undefined,
): SurfaceRequest {
  const { unit, asset } = record;
  const plan = planImageRaster(unit.width, unit.height, rect, tierLongSide(tier));
  const surface = acquireSurface(
    record,
    null,
    imageQueue,
    async (jobSignal) => {
      throwIfAborted(jobSignal);
      try {
        return await decodeImage(asset.file);
      } catch (error) {
        throw new Error(`No se pudo leer la imagen “${asset.file.name}”: puede que el archivo se haya movido o borrado.`, {
          cause: error,
        });
      }
    },
    priority,
    signal,
  );
  return { surface, outWidth: plan.outWidth, outHeight: plan.outHeight };
}

export async function rasterize(
  unitId: string,
  rect: NormRect,
  tier: RasterTier,
  options: { signal?: AbortSignal; priority?: 'visible' | 'background' } = {},
): Promise<ImageBitmap> {
  const { signal, priority = 'visible' } = options;
  throwIfAborted(signal);
  const record = unitRecord(unitId);
  const region = normalizeRect(rect);
  const request =
    record.asset.pdf !== null
      ? requestPdfSurface(record, region, tier, priority, signal)
      : requestImageSurface(record, region, tier, priority, signal);

  const surface = await request.surface;
  try {
    if (signal?.aborted || record.asset.released) throw abortError();
    const bitmap = await cropSurface(surface, region, request.outWidth, request.outHeight);
    if (signal?.aborted || record.asset.released) {
      bitmap.close();
      throw abortError();
    }
    return bitmap;
  } finally {
    releaseSurface(surface);
  }
}

async function encodeJpeg(bitmap: ImageBitmap): Promise<Blob> {
  const paint = (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null): void => {
    if (!context) throw new Error('El navegador no pudo crear un lienzo para la miniatura.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
  };
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    try {
      paint(canvas.getContext('2d'));
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  try {
    paint(canvas.getContext('2d'));
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('El navegador no pudo codificar la miniatura.'))),
        'image/jpeg',
        0.82,
      );
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function thumbnailUrl(unitId: string, rect: NormRect, options: { signal?: AbortSignal } = {}): Promise<string> {
  const { signal } = options;
  if (signal?.aborted) return Promise.reject(abortError());
  let record: UnitRecord;
  try {
    record = unitRecord(unitId);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
  const { asset } = record;
  const key = `${unitId}|${rectKey(rect)}`;
  const ready = asset.thumbs.get(key);
  if (ready !== undefined) return Promise.resolve(ready);

  let shared = pendingThumbs.get(key);
  if (!shared) {
    const job = thumbQueue.enqueue(async (jobSignal) => {
      const bitmap = await rasterize(unitId, rect, 'thumb', { signal: jobSignal, priority: 'background' });
      let blob: Blob;
      try {
        blob = await encodeJpeg(bitmap);
      } finally {
        bitmap.close();
      }
      if (asset.released) throw abortError();
      const url = URL.createObjectURL(blob);
      asset.thumbs.set(key, url);
      return url;
    }, 'background');
    const created = new SharedJob(job, {
      onSettled: () => {
        if (pendingThumbs.get(key) === created) pendingThumbs.delete(key);
      },
    });
    pendingThumbs.set(key, created);
    shared = created;
  }
  return shared.join(signal, 'background');
}

function abortPending<T>(pending: Map<string, SharedJob<T>>, prefix: string): void {
  for (const [key, shared] of [...pending]) {
    if (key.startsWith(prefix)) shared.abort();
  }
}

function disposeAsset(record: AssetRecord): void {
  record.released = true;
  assets.delete(record.id);
  for (const unit of record.units) units.delete(unit.id);
  const prefix = `${record.id}/`;
  abortPending(pendingThumbs, prefix);
  abortPending(pendingSurfaces, prefix);
  surfaceCache.deleteWhere((surface) => surface.assetId === record.id);
  for (const url of record.thumbs.values()) URL.revokeObjectURL(url);
  record.thumbs.clear();
  record.destroyPdf?.().catch((error: unknown) => {
    console.warn(`No se pudo cerrar limpiamente el PDF “${record.file.name}”.`, error);
  });
}

export function releaseAsset(assetId: string): void {
  const record = assets.get(assetId);
  if (record) disposeAsset(record);
}

export function releaseAll(): void {
  for (const record of [...assets.values()]) disposeAsset(record);
}

export function ingestStats(): { assets: number; units: number; cachedRenders: number; cachedBytes: number } {
  return { assets: assets.size, units: units.size, cachedRenders: surfaceCache.size, cachedBytes: surfaceCache.bytes };
}
