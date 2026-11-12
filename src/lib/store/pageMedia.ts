import { pageGeometry } from '@/lib/imposition';
import { rasterize, thumbnailUrl } from '@/lib/ingest';
import type { MagazineConfig, NormRect, Page, PageGeometry, RasterTier, SourceUnit } from '@/lib/types';
import type { PageTextureProvider } from '@/lib/viewer';

import { selectDerived } from './derived';
import { useProjectStore } from './project';

export type PageBox = 'trim' | 'bleed' | 'source';

export interface PageRegion {
  unitId: string;
  rect: NormRect;
  geometry: PageGeometry;
}

interface MediaState {
  config: MagazineConfig;
  units: SourceUnit[];
  pages: Page[];
}

export function pageRegion(pageNumber: number, box: PageBox, state: MediaState = useProjectStore.getState()): PageRegion | null {
  const derived = selectDerived(state);
  const page = derived.effectivePages[pageNumber - 1];
  if (!page || page.unitId === null) return null;
  const unit = derived.unitsById.get(page.unitId);
  if (!unit) return null;
  const geometry = pageGeometry(page, unit, state.config, derived.trim);
  return { unitId: unit.id, rect: geometry[box], geometry };
}

export function regionKey(region: PageRegion | null): string {
  if (!region) return 'blank';
  const { x, y, w, h } = region.rect;
  return `${region.unitId}|${x.toFixed(5)},${y.toFixed(5)},${w.toFixed(5)},${h.toFixed(5)}`;
}

export const pageTextureProvider: PageTextureProvider = async (pageNumber, tier, signal) => {
  const region = pageRegion(pageNumber, 'trim');
  if (!region) return null;
  return rasterize(region.unitId, region.rect, tier, { signal, priority: tier === 'thumb' ? 'background' : 'visible' });
};

export function rasterizePage(pageNumber: number, box: PageBox, tier: RasterTier, signal?: AbortSignal): Promise<ImageBitmap | null> {
  const region = pageRegion(pageNumber, box);
  if (!region) return Promise.resolve(null);
  return rasterize(region.unitId, region.rect, tier, signal ? { signal, priority: 'visible' } : { priority: 'visible' });
}

export function pageThumbnailUrl(pageNumber: number, box: PageBox, signal?: AbortSignal): Promise<string | null> {
  const region = pageRegion(pageNumber, box);
  if (!region) return Promise.resolve(null);
  return thumbnailUrl(region.unitId, region.rect, signal ? { signal } : undefined);
}
