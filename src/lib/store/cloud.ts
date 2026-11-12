import { createSnapshot } from '@/lib/cloud';
import type { ProjectSnapshot } from '@/lib/cloud';

import { selectDerived } from './derived';
import type { ProjectState } from './project';

type SnapshotSource = Pick<ProjectState, 'config' | 'assets' | 'units' | 'pages' | 'pagesEdited' | 'fingerprints'>;

export function currentSnapshot(state: SnapshotSource): ProjectSnapshot {
  const derived = selectDerived(state);
  return createSnapshot({
    config: state.config,
    assets: state.assets,
    units: state.units,
    pages: state.pages,
    pagesEdited: state.pagesEdited,
    fingerprints: state.fingerprints,
    derived: {
      pageCount: derived.pageCount,
      sheetCount: derived.imposition.sheets.length,
      signatureCount: derived.imposition.signatures.length,
      verdict: derived.verdict,
      errors: derived.counts.errors,
      warnings: derived.counts.warnings,
    },
  });
}

export interface FingerprintProgress {
  done: number;
  total: number;
  failed: number;
}

export function fingerprintProgress(state: Pick<ProjectState, 'assets' | 'fingerprints' | 'fingerprintErrors'>): FingerprintProgress {
  let done = 0;
  let failed = 0;
  for (const asset of state.assets) {
    if (state.fingerprints.has(asset.id)) done += 1;
    else if (state.fingerprintErrors.has(asset.id)) failed += 1;
  }
  return { done, total: state.assets.length, failed };
}
