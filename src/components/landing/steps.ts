import { buildCantoModel, type CantoModel } from '@/components/canto/cantoModel';
import { computeImposition, DEFAULT_CONFIG, estimateSpine } from '@/lib/imposition';
import { formatNumber } from '@/lib/imposition/format';
import type { ImpositionResult } from '@/lib/types';

export interface LandingStep {
  id: string;
  number: number;
  name: string;
  statement: string;
  body: string;
}

export const STEPS: readonly LandingStep[] = [
  {
    id: 'configuracion',
    number: 1,
    name: 'Configuración',
    statement: 'Dile cómo es tu revista. Los pliegos salen solos.',
    body: 'Páginas, encuadernación y papel. Paginator calcula al instante cuántos pliegos lleva, qué página cae en cada cara y cuánto mide el lomo.',
  },
  {
    id: 'carga',
    number: 2,
    name: 'Carga',
    statement: 'Sube los archivos tal como salen de maquetación.',
    body: 'PDF o imágenes, páginas sueltas o pliegos dobles. Paginator las ordena, corta cada pliego por el lomo y deja cada página en su sitio.',
  },
  {
    id: 'pliegos',
    number: 3,
    name: 'Pliegos',
    statement: 'El error salta en su pliego, no en el taller.',
    body: 'Cada pliego, por la cara y por el retiro. Si una página falta, sobra o está fuera de sitio, Paginator te dice cuál, por qué y cómo arreglarlo.',
  },
  {
    id: 'visor',
    number: 4,
    name: 'Visor 3D',
    statement: 'Hojéala antes de imprimirla.',
    body: 'Una réplica fiel de tu revista, donde cada hoja es un pliego real. Ábrela, mírala en cenital o despiézala para ver el pliego extendido, tal como va a plancha.',
  },
];

export const CANTO_PAGE_COUNT = 24;

export const CANTO_IMPOSITION: ImpositionResult = computeImposition(CANTO_PAGE_COUNT, {
  binding: 'saddle-stitch',
  signaturePages: 16,
  separateCover: false,
  readingDirection: 'ltr',
});

export const CANTO_LEAVES: CantoModel = buildCantoModel(CANTO_IMPOSITION, 'leaf');

export const CANTO_SPINE = formatNumber(estimateSpine(CANTO_PAGE_COUNT, DEFAULT_CONFIG).widthMm, 1);

const pad = (n: number): string => String(n).padStart(2, '0');

export const pageThumb = (n: number): string => `/landing/canto/min/p${pad(n)}.webp`;

export const pageFull = (n: number): string => `/landing/canto/p${pad(n)}.jpg`;

export function playRange(index: number, count: number, span = 0.4, from = 0, to = 1): string {
  const window = to - from;
  const step = count > 1 ? (window * (1 - span)) / (count - 1) : 0;
  const start = from + index * step;
  const end = start + window * span;
  const percent = (value: number): string => `${String(Math.round(value * 1000) / 10)}%`;
  return `--from: ${percent(start)}; --to: ${percent(end)}`;
}
