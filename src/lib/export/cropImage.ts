import type { NormRect } from '@/lib/types';

import type { CroppedImage } from './printPdf';

const JPEG_QUALITY = 0.95;

function canvasOf(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encode(canvas: OffscreenCanvas | HTMLCanvasElement, type: string): Promise<Blob> {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('el navegador no pudo codificar la imagen'))), type, JPEG_QUALITY);
    });
  }
  return canvas.convertToBlob({ type, quality: JPEG_QUALITY });
}

export async function cropImage(file: Blob, clip: NormRect): Promise<CroppedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const sx = Math.max(0, Math.round(clip.x * bitmap.width));
    const sy = Math.max(0, Math.round(clip.y * bitmap.height));
    const width = Math.max(1, Math.min(bitmap.width - sx, Math.round(clip.w * bitmap.width)));
    const height = Math.max(1, Math.min(bitmap.height - sy, Math.round(clip.h * bitmap.height)));
    const lossless = file.type === 'image/png';
    const canvas = canvasOf(width, height);
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) throw new Error('el navegador no ofrece un lienzo para recortar la imagen');
    if (!lossless) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, sx, sy, width, height, 0, 0, width, height);
    const blob = await encode(canvas, lossless ? 'image/png' : 'image/jpeg');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), format: lossless ? 'png' : 'jpg' };
  } finally {
    bitmap.close();
  }
}
