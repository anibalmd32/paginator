import type { ProjectSnapshot, RestorePlan } from '@/lib/cloud';
import { buildPages } from '@/lib/imposition';
import type { MagazineConfig, Page, SourceAsset, SourceUnit } from '@/lib/types';

export interface PendingRestore {
  snapshot: ProjectSnapshot;
  plan: RestorePlan | null;
  status: 'waiting' | 'restored';
}

export interface RestoredLayout {
  config: MagazineConfig;
  assets: SourceAsset[];
  units: SourceUnit[];
  pages: Page[];
  pagesEdited: boolean;
}

function isPrinterSpreads(config: MagazineConfig): boolean {
  return config.inputMode === 'spreads' && config.spreadKind === 'printer';
}

function sameIds(a: readonly Page[], b: readonly Page[]): boolean {
  return a.length === b.length && a.every((page, index) => page.id === b[index]?.id);
}

export function restoredLayout(snapshot: ProjectSnapshot, plan: RestorePlan, assets: readonly SourceAsset[], units: readonly SourceUnit[]): RestoredLayout | null {
  const savedPages = plan.pages;
  if (!savedPages) return null;
  const config: MagazineConfig = { ...snapshot.config };

  const matched = plan.matches.filter((id): id is string => id !== null);
  const matchedSet = new Set(matched);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const orderedAssets = [
    ...matched.map((id) => byId.get(id)).filter((asset): asset is SourceAsset => asset !== undefined),
    ...assets.filter((asset) => !matchedSet.has(asset.id)),
  ];

  const rank = new Map(orderedAssets.map((asset, index) => [asset.id, index]));
  const orderedUnits = [...units]
    .sort((a, b) => (rank.get(a.assetId) ?? 0) - (rank.get(b.assetId) ?? 0) || a.indexInAsset - b.indexInAsset)
    .map((unit, order) => (unit.order === order ? unit : { ...unit, order }));

  const natural = buildPages(orderedUnits, config);
  const extraUnitIds = new Set(orderedUnits.filter((unit) => !matchedSet.has(unit.assetId)).map((unit) => unit.id));

  if (isPrinterSpreads(config)) {
    return extraUnitIds.size > 0
      ? { config, assets: orderedAssets, units: orderedUnits, pages: natural, pagesEdited: false }
      : { config, assets: orderedAssets, units: orderedUnits, pages: savedPages, pagesEdited: false };
  }

  const extraPages = natural.filter((page) => page.unitId !== null && extraUnitIds.has(page.unitId));
  const pages = [...savedPages, ...extraPages];
  const pagesEdited = snapshot.pagesEdited || !sameIds(pages, natural);
  return { config, assets: orderedAssets, units: orderedUnits, pages, pagesEdited };
}
