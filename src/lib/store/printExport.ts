import type { PrintLayout } from '@/lib/export';

import { selectDerived } from './derived';
import { useProjectStore } from './project';
import { downloadBlob, slugify } from './report';

const FILE_PREFIX: Record<PrintLayout, string> = { sheets: 'imprenta', reading: 'paginas' };

export async function downloadPrintPdf(layout: PrintLayout, onProgress?: (done: number, total: number) => void): Promise<string> {
  const state = useProjectStore.getState();
  const derived = selectDerived(state);
  if (!derived.hasPages) throw new Error('Carga páginas antes de exportar el PDF.');
  const { buildPrintPdf, cropImage } = await import('@/lib/export');
  const title = state.config.title.trim() || 'Revista sin título';
  const bytes = await buildPrintPdf({
    layout,
    title,
    config: state.config,
    trim: derived.trim,
    imposition: derived.imposition,
    pages: derived.effectivePages,
    units: derived.unitsById,
    sources: new Map(state.assets.map((asset) => [asset.id, { kind: asset.kind, file: asset.file }])),
    cropImage,
    ...(onProgress ? { onProgress } : {}),
  });
  const fileName = `${FILE_PREFIX[layout]}-${slugify(title)}.pdf`;
  downloadBlob(fileName, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  return fileName;
}
