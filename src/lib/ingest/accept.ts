import type { SourceKind } from '@/lib/types';

const MIME_KINDS: Readonly<Record<string, SourceKind>> = {
  'application/pdf': 'pdf',
  'application/x-pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/pjpeg': 'image',
  'image/webp': 'image',
};

const EXTENSION_KINDS: Readonly<Record<string, SourceKind>> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  jpe: 'image',
  jfif: 'image',
  webp: 'image',
};

const EXPORTABLE_EXTENSIONS = new Set([
  'tif', 'tiff', 'psd', 'psb', 'ai', 'eps', 'indd', 'idml', 'afpub', 'afdesign', 'qxp',
  'heic', 'heif', 'avif', 'gif', 'bmp', 'svg', 'jp2', 'jxl',
]);

export const ACCEPT_ATTR = 'application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function classifyFile(file: { name: string; type: string }): SourceKind | null {
  const mime = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_KINDS[mime] ?? EXTENSION_KINDS[extensionOf(file.name)] ?? null;
}

export function isAcceptedFile(file: File): boolean {
  return classifyFile(file) !== null;
}

export function unsupportedReason(name: string): string {
  const base = `“${name}” no es PDF ni imagen PNG/JPG/WebP`;
  return EXPORTABLE_EXTENSIONS.has(extensionOf(name)) ? `${base}: expórtalo como PDF, PNG o JPG` : base;
}
