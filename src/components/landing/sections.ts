import { buildCantoModel, type CantoModel } from '@/components/canto/cantoModel';
import { computeImposition } from '@/lib/imposition';
import type { ImpositionResult } from '@/lib/types';

export interface LandingSection {
  id: string;
  title: string;
  summary: string;
}

export const SECTIONS: readonly LandingSection[] = [
  { id: 'imposicion', title: 'La imposición, sin misterio', summary: 'Qué página cae en qué cara de qué pliego' },
  { id: 'carga', title: 'Carga y segmentación', summary: 'PDF o imágenes, páginas sueltas o pliegos' },
  { id: 'error', title: 'El error, en su pliego', summary: 'Folios fuera de orden, cortesías, pre-vuelo' },
  { id: 'visor', title: 'Hojéala antes de la plancha', summary: 'Lectura, cenital y despiece en 3D' },
  { id: 'local', title: 'Tus archivos no salen de tu equipo', summary: 'Todo ocurre en tu navegador' },
];

const PAGES_PER_SECTION = 8;
export const LANDING_PAGE_COUNT = 4 + SECTIONS.length * PAGES_PER_SECTION;

export const LANDING_IMPOSITION: ImpositionResult = computeImposition(LANDING_PAGE_COUNT, {
  binding: 'perfect-bound',
  signaturePages: PAGES_PER_SECTION,
  separateCover: true,
  readingDirection: 'ltr',
});

export const LANDING_CANTO: CantoModel = buildCantoModel(LANDING_IMPOSITION, 'leaf');

export interface CantoRun {
  id: string;
  title: string;
  folio: number;
  lastPage: number;
  firstLeaf: number;
  lastLeaf: number;
  stockName: string;
}

const leafCount = LANDING_IMPOSITION.pageCount / 2;
const leavesPerSection = PAGES_PER_SECTION / 2;

export const CANTO_RUNS: readonly CantoRun[] = [
  { id: 'portada', title: 'Portada', folio: 1, lastPage: 2, firstLeaf: 0, lastLeaf: 0, stockName: 'Petróleo' },
  ...SECTIONS.map((section, i) => {
    const firstLeaf = 1 + i * leavesPerSection;
    return {
      id: section.id,
      title: section.title,
      folio: 2 * firstLeaf + 1,
      lastPage: 2 * (firstLeaf + leavesPerSection),
      firstLeaf,
      lastLeaf: firstLeaf + leavesPerSection - 1,
      stockName: LANDING_CANTO.slices[firstLeaf]?.stockName ?? '',
    };
  }),
  {
    id: 'cierre',
    title: 'Abrir Paginator',
    folio: LANDING_IMPOSITION.pageCount - 1,
    lastPage: LANDING_IMPOSITION.pageCount,
    firstLeaf: leafCount - 1,
    lastLeaf: leafCount - 1,
    stockName: 'Petróleo',
  },
];

export function folioOf(id: string): number {
  return CANTO_RUNS.find((run) => run.id === id)?.folio ?? 0;
}
