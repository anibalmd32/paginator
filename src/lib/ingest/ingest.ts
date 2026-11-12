import type { SourceAsset, SourceKind, SourceUnit } from '@/lib/types';

import { classifyFile, unsupportedReason } from './accept';
import { decodeImage, imageOpenFailureReason } from './image';
import { compareFileNames, filenameNumber } from './natural-order';
import { inspectPdfPage, openPdf, pdfOpenFailureReason } from './pdf';
import type { OpenedPdf, PdfPageInfo } from './pdf';
import { abortError, isAbortError, throwIfAborted } from './queue';
import { cacheSurface, createSurface, disposeIfUnowned, newAssetId, registerAsset, surfaceCache, unitIdOf } from './state';
import type { AssetRecord } from './state';

export interface IngestProgress {
  fileName: string;
  done: number;
  total: number;
}

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface IngestResult {
  assets: SourceAsset[];
  units: SourceUnit[];
  rejected: RejectedFile[];
}

const FILE_CONCURRENCY = 3;
const PAGE_CONCURRENCY = 4;

interface UnitDraft {
  width: number;
  height: number;
  widthMm: number | null;
  heightMm: number | null;
  folios: SourceUnit['folios'];
}

interface Opened {
  assetId: string;
  file: File;
  kind: SourceKind;
  pdf: OpenedPdf | null;
  drafts: UnitDraft[];
}

class FileRejection extends Error {}

async function runPool(count: number, limit: number, task: (index: number) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < count) {
      const index = next++;
      try {
        await task(index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const settled = await Promise.allSettled(Array.from({ length: Math.min(limit, count) }, worker));
  for (const result of settled) {
    if (result.status === 'rejected') throw result.reason;
  }
}

function sortName(file: File): string {
  return file.webkitRelativePath || file.name;
}

async function openImage(file: File, assetId: string): Promise<UnitDraft[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeImage(file);
  } catch {
    throw new FileRejection(imageOpenFailureReason(file.name));
  }
  const draft: UnitDraft = { width: bitmap.width, height: bitmap.height, widthMm: null, heightMm: null, folios: [] };
  const surface = createSurface(bitmap, assetId, unitIdOf(assetId, 0), null);
  cacheSurface(surface);
  disposeIfUnowned(surface);
  return [draft];
}

async function openPdfFile(
  file: File,
  signal: AbortSignal | undefined,
  onPageCount: (pages: number) => void,
  onPageDone: () => void,
): Promise<{ pdf: OpenedPdf; drafts: UnitDraft[] }> {
  let pdf: OpenedPdf;
  try {
    pdf = await openPdf(file, signal);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new FileRejection(pdfOpenFailureReason(file.name, error));
  }
  try {
    const pageCount = pdf.doc.numPages;
    if (pageCount < 1) throw new FileRejection(`“${file.name}” no tiene ninguna página`);
    onPageCount(pageCount);
    const infos = new Array<PdfPageInfo>(pageCount);
    await runPool(pageCount, PAGE_CONCURRENCY, async (index) => {
      throwIfAborted(signal);
      try {
        infos[index] = await inspectPdfPage(pdf.doc, index + 1);
      } catch (error) {
        console.warn(`“${file.name}”: la página ${index + 1} no se pudo leer.`, error);
        throw new FileRejection(`“${file.name}” tiene la página ${index + 1} dañada y no se puede leer: vuelve a exportarlo`);
      }
      onPageDone();
    });
    throwIfAborted(signal);
    return { pdf, drafts: infos };
  } catch (error) {
    void pdf.destroy().catch(() => undefined);
    throw error;
  }
}

function discard(opened: Opened): void {
  surfaceCache.deleteWhere((surface) => surface.assetId === opened.assetId);
  void opened.pdf?.destroy().catch(() => undefined);
}

export async function ingestFiles(
  files: File[],
  options: { startOrder?: number; onProgress?: (p: IngestProgress) => void; signal?: AbortSignal } = {},
): Promise<IngestResult> {
  const { startOrder = 0, onProgress, signal } = options;
  throwIfAborted(signal);

  const rejected: RejectedFile[] = [];
  const accepted: Array<{ file: File; kind: SourceKind }> = [];
  for (const file of files) {
    const kind = classifyFile(file);
    if (kind === null) rejected.push({ name: file.name, reason: unsupportedReason(file.name) });
    else if (file.size === 0) rejected.push({ name: file.name, reason: `“${file.name}” está vacío (0 bytes)` });
    else accepted.push({ file, kind });
  }
  accepted.sort((a, b) => compareFileNames(sortName(a.file), sortName(b.file)));

  const estimates = accepted.map(() => 1);
  let done = 0;
  const report = (fileName: string): void => {
    onProgress?.({ fileName, done, total: Math.max(done, estimates.reduce((sum, n) => sum + n, 0)) });
  };

  const opened = new Array<Opened | null>(accepted.length).fill(null);
  const failures = new Array<string | null>(accepted.length).fill(null);

  try {
    await runPool(accepted.length, FILE_CONCURRENCY, async (index) => {
      const entry = accepted[index];
      if (!entry) return;
      const { file, kind } = entry;
      throwIfAborted(signal);
      const assetId = newAssetId();
      try {
        if (kind === 'pdf') {
          let counted = 0;
          const result = await openPdfFile(
            file,
            signal,
            (pages) => {
              estimates[index] = pages;
              report(file.name);
            },
            () => {
              counted++;
              done++;
              report(file.name);
            },
          ).catch((error: unknown) => {
            done -= counted;
            throw error;
          });
          opened[index] = { assetId, file, kind, pdf: result.pdf, drafts: result.drafts };
        } else {
          const drafts = await openImage(file, assetId);
          opened[index] = { assetId, file, kind, pdf: null, drafts };
          done++;
          report(file.name);
        }
      } catch (error) {
        if (!(error instanceof FileRejection)) throw error;
        failures[index] = error.message;
        estimates[index] = 0;
        report(file.name);
      }
    });
    throwIfAborted(signal);
  } catch (error) {
    for (const item of opened) if (item) discard(item);
    if (signal?.aborted) throw abortError();
    throw error;
  }

  const result: IngestResult = { assets: [], units: [], rejected };
  let order = startOrder;
  accepted.forEach(({ file }, index) => {
    const failure = failures[index];
    if (typeof failure === 'string') rejected.push({ name: file.name, reason: failure });
    const item = opened[index];
    if (!item) return;

    const units = item.drafts.map((draft, indexInAsset): SourceUnit => ({
      id: unitIdOf(item.assetId, indexInAsset),
      assetId: item.assetId,
      indexInAsset,
      order: order++,
      label: item.kind === 'pdf' ? `${file.name} · p. ${indexInAsset + 1}` : file.name,
      width: draft.width,
      height: draft.height,
      widthMm: draft.widthMm,
      heightMm: draft.heightMm,
      filenameNumber: item.kind === 'image' ? filenameNumber(file.name) : null,
      folios: draft.folios,
    }));
    const record: AssetRecord = {
      id: item.assetId,
      file,
      units,
      pdf: item.pdf?.doc ?? null,
      destroyPdf: item.pdf?.destroy ?? null,
      thumbs: new Map(),
      released: false,
    };
    registerAsset(record);
    result.assets.push({
      id: item.assetId,
      file,
      name: file.name,
      kind: item.kind,
      sizeBytes: file.size,
      unitCount: units.length,
    });
    result.units.push(...units);
  });
  return result;
}
