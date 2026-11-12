import { ARTICLES } from './content';
import type { Article } from './content';

export const MIN_PAGES = 8;
export const MAX_PAGES = 64;
export const DEFAULT_PAGES = 24;

export type ArticleTemplate = 'opener' | 'band' | 'gallery' | 'panorama';

export interface ArticleSlot {
  kind: 'article';
  article: Article;
  template: ArticleTemplate;
  round: number;
  palette: number;
  title: string;
  standfirst: string;
  kicker: string;
  paragraphs: readonly string[];
}

export type SpreadSlot =
  | { kind: 'cover' }
  | { kind: 'front' }
  | ArticleSlot
  | { kind: 'infographic' }
  | { kind: 'closing' }
  | { kind: 'back' };

export interface TocEntry {
  page: number;
  kicker: string;
  title: string;
  author: string;
}

export interface MagazinePlan {
  total: number;
  spreads: readonly SpreadSlot[];
  toc: readonly TocEntry[];
}

export const INFOGRAPHIC_TITLE = 'Este número, pliego a pliego';
export const GLOSSARY_TITLE = 'Glosario de taller';

export function normalizePageCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_PAGES;
  const rounded = Math.ceil(Math.round(value) / 4) * 4;
  return Math.min(MAX_PAGES, Math.max(MIN_PAGES, rounded));
}

const ROMAN = ['', '', 'II', 'III', 'IV', 'V'] as const;
const CYCLE: readonly ArticleTemplate[] = ['opener', 'band', 'gallery'];

function articleSlot(article: Article, template: ArticleTemplate, round: number, palette: number): ArticleSlot {
  const variant = round % 2;
  const series = ROMAN[Math.floor(round / 2) + 1] ?? '';
  const shift = round % article.paragraphs.length;
  const paragraphs = [...article.paragraphs.slice(shift), ...article.paragraphs.slice(0, shift)];
  return {
    kind: 'article',
    article,
    template,
    round,
    palette,
    title: article.titles[variant] ?? article.titles[0],
    standfirst: article.standfirsts[variant] ?? article.standfirsts[0],
    kicker: series ? `${article.kicker} · ${series}` : article.kicker,
    paragraphs,
  };
}

const cache = new Map<number, MagazinePlan>();

export function planMagazine(totalPages: number): MagazinePlan {
  const total = normalizePageCount(totalPages);
  const cached = cache.get(total);
  if (cached) return cached;

  const last = total / 2;
  const central = total / 4;
  const infographic = total >= 16 ? 3 : total === 12 ? 2 : -1;
  const feature = ARTICLES[ARTICLES.length - 1];
  const regular = ARTICLES.slice(0, -1);
  if (!feature || regular.length === 0) throw new Error('La revista de ejemplo necesita al menos dos artículos');

  const spreads: SpreadSlot[] = [];
  const toc: TocEntry[] = [];
  let next = 0;
  for (let s = 0; s <= last; s++) {
    if (s === 0) spreads.push({ kind: 'cover' });
    else if (s === last) spreads.push({ kind: 'back' });
    else if (s === 1) spreads.push({ kind: 'front' });
    else if (s === last - 1) {
      spreads.push({ kind: 'closing' });
      toc.push({ page: 2 * s, kicker: 'Vocabulario', title: GLOSSARY_TITLE, author: '' });
    } else if (s === central) {
      const slot = articleSlot(feature, 'panorama', 0, 3);
      spreads.push(slot);
      toc.push({ page: 2 * s, kicker: slot.kicker, title: slot.title, author: feature.author });
    } else if (s === infographic) {
      spreads.push({ kind: 'infographic' });
      toc.push({ page: 2 * s, kicker: 'Infografía', title: INFOGRAPHIC_TITLE, author: '' });
    } else {
      const article = regular[next % regular.length] ?? feature;
      const round = Math.floor(next / regular.length);
      const template = CYCLE[(next + round) % CYCLE.length] ?? 'opener';
      const slot = articleSlot(article, template, round, next + round);
      spreads.push(slot);
      toc.push({ page: 2 * s, kicker: slot.kicker, title: slot.title, author: article.author });
      next++;
    }
  }

  const plan: MagazinePlan = { total, spreads, toc };
  cache.set(total, plan);
  return plan;
}

export function spreadIndexOf(pageNumber: number): number {
  return Math.floor(pageNumber / 2);
}

export interface PrinterSide {
  sheet: number;
  face: 'front' | 'back';
  left: number;
  right: number;
}

export function printerSides(totalPages: number, dir: 'ltr' | 'rtl'): PrinterSide[] {
  const total = normalizePageCount(totalPages);
  const sides: PrinterSide[] = [];
  for (let i = 0; i < total / 4; i++) {
    const front: [number, number] = [total - 2 * i, 2 * i + 1];
    const back: [number, number] = [2 * i + 2, total - 2 * i - 1];
    if (dir === 'rtl') {
      front.reverse();
      back.reverse();
    }
    sides.push({ sheet: i, face: 'front', left: front[0], right: front[1] });
    sides.push({ sheet: i, face: 'back', left: back[0], right: back[1] });
  }
  return sides;
}
