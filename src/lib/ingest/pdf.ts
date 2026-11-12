import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import type { FolioHit } from '@/lib/types';

import { extractFolioHits } from './folios';
import { abortError, throwIfAborted } from './queue';
import { pointsToMm } from './sizing';

type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist').then(
    (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    },
    (error: unknown) => {
      pdfjsPromise = null;
      throw new Error('No se pudo cargar el lector de PDF. Comprueba la conexión y vuelve a intentarlo.', { cause: error });
    },
  );
  return pdfjsPromise;
}

function resourceUrl(folder: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  return `${base}pdfjs/${folder}/`;
}

export interface PdfPageInfo {
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
  folios: FolioHit[];
}

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  destroy: () => Promise<void>;
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string' ? error.name : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function pdfOpenFailureReason(name: string, error: unknown): string {
  switch (errorName(error)) {
    case 'PasswordException':
      return `“${name}” está protegido con contraseña: quítale la protección y vuelve a subirlo`;
    case 'InvalidPDFException':
      return `“${name}” está dañado o no es un PDF válido: vuelve a exportarlo`;
    default:
      return `“${name}” no se pudo abrir (${errorMessage(error)})`;
  }
}

export async function openPdf(file: File, signal?: AbortSignal): Promise<OpenedPdf> {
  throwIfAborted(signal);
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(signal);

  const task: PDFDocumentLoadingTask = pdfjs.getDocument({
    data,
    cMapUrl: resourceUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: resourceUrl('standard_fonts'),
    wasmUrl: resourceUrl('wasm'),
    iccUrl: resourceUrl('iccs'),
    disableWorkerRendering: true,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const onAbort = (): void => void task.destroy().catch(() => undefined);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const doc = await task.promise;
    throwIfAborted(signal);
    return { doc, destroy: () => task.destroy() };
  } catch (error) {
    void task.destroy().catch(() => undefined);
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function inspectPdfPage(doc: PDFDocumentProxy, pageNumber: number): Promise<PdfPageInfo> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  let folios: FolioHit[] = [];
  try {
    const text = await page.getTextContent();
    folios = extractFolioHits(text.items, viewport);
  } catch (error) {
    console.warn(`No se pudo leer el texto de la página ${pageNumber}; se queda sin folio detectado.`, error);
  }
  page.cleanup();
  return {
    width: viewport.width,
    height: viewport.height,
    widthMm: pointsToMm(viewport.width),
    heightMm: pointsToMm(viewport.height),
    folios,
  };
}

export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<ImageBitmap> {
  throwIfAborted(signal);
  const pdfjs = await loadPdfJs();
  const page = await doc.getPage(pageNumber);
  throwIfAborted(signal);

  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const task = page.render({
      canvas,
      viewport,
      transform: [width / viewport.width, 0, 0, height / viewport.height, 0, 0],
      background: 'rgb(255,255,255)',
      annotationMode: pdfjs.AnnotationMode.DISABLE,
    });
    const onAbort = (): void => task.cancel();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      await task.promise;
    } catch (error) {
      if (signal.aborted || errorName(error) === 'RenderingCancelledException') throw abortError();
      throw new Error(`No se pudo dibujar la página ${pageNumber} del PDF (${errorMessage(error)}).`, { cause: error });
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    throwIfAborted(signal);
    return await createImageBitmap(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}
