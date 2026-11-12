import type { Derived } from '@/lib/store';
import type { MagazineConfig } from '@/lib/types';
import type { MagazineModel, PageTextureProvider } from '@/lib/viewer';

export function coverLeavesPerSide(config: MagazineConfig): 0 | 1 {
  return config.binding === 'saddle-stitch' || config.separateCover ? 1 : 0;
}

export function buildMagazineModel(config: MagazineConfig, derived: Derived, getPageTexture: PageTextureProvider): MagazineModel {
  return {
    pageCount: derived.pageCount,
    trim: derived.trim,
    binding: config.binding,
    readingDirection: config.readingDirection,
    interiorCaliperMm: config.paper.interiorCaliperMm,
    coverCaliperMm: config.paper.coverCaliperMm,
    coverLeavesPerSide: coverLeavesPerSide(config),
    sheets: derived.imposition.sheets,
    safeMarginMm: config.safeMarginMm,
    bleedMm: config.bleedMm,
    getPageTexture,
  };
}

export function structuralSignature(config: MagazineConfig, derived: Derived): string {
  const sheets = derived.imposition.sheets
    .map((sheet) => `${sheet.signature}${sheet.role === 'cover' ? 'c' : ''}:${sheet.front.left},${sheet.front.right},${sheet.back.left},${sheet.back.right}`)
    .join(';');
  return [
    derived.pageCount,
    derived.trim.widthMm,
    derived.trim.heightMm,
    config.binding,
    config.readingDirection,
    config.paper.interiorCaliperMm,
    config.paper.coverCaliperMm,
    coverLeavesPerSide(config),
    config.safeMarginMm,
    config.bleedMm,
    sheets,
  ].join('|');
}

export function contentSignature(config: MagazineConfig, derived: Derived): string {
  const pages = derived.effectivePages.map((page) => `${page.id}:${page.half}`).join(',');
  return [config.bleedMm, config.marksMm, JSON.stringify(config.trim), config.inputMode, config.spreadKind, pages].join('|');
}
