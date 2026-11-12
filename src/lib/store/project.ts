import { create } from 'zustand';

import { planRestore } from '@/lib/cloud';
import type { ProjectSnapshot } from '@/lib/cloud';

import { buildPages, createManualBlank, DEFAULT_CONFIG, spreadIndexOfPage } from '@/lib/imposition';
import { ingestFiles, naturalCompare, releaseAll, releaseAsset } from '@/lib/ingest';
import type { IngestProgress, RejectedFile } from '@/lib/ingest';
import type {
  GuideVisibility,
  IssueFix,
  MagazineConfig,
  Page,
  SheetFace,
  SourceAsset,
  SourceUnit,
  ViewerMode,
} from '@/lib/types';

import { selectDerived } from './derived';
import { fingerprintsEnabled, hashFile } from './fingerprints';
import { loadConfig, loadGuides, saveConfig, saveGuides } from './persistence';
import { restoredLayout } from './restore';
import type { PendingRestore } from './restore';

export type StepId = 1 | 2 | 3 | 4;

export interface IngestState {
  busy: boolean;
  source: 'files' | 'demo' | null;
  progress: IngestProgress | null;
  rejected: RejectedFile[];
  error: string | null;
}

export interface ViewerState {
  spreadIndex: number;
  mode: ViewerMode;
  sheetIndex: number;
  face: SheetFace;
  guides: GuideVisibility;
  labels: boolean;
}

export interface HoverState {
  page: number | null;
  sheet: number | null;
}

export interface ProjectState {
  step: StepId;
  config: MagazineConfig;
  assets: SourceAsset[];
  units: SourceUnit[];
  pages: Page[];
  pagesEdited: boolean;
  isDemo: boolean;
  ingest: IngestState;
  viewer: ViewerState;
  hover: HoverState;
  cloudProjectId: string | null;
  cloudProjectVersion: string | null;
  fingerprints: ReadonlyMap<string, string>;
  fingerprintErrors: ReadonlyMap<string, string>;
  pendingRestore: PendingRestore | null;

  goToStep: (step: StepId) => void;
  updateConfig: (patch: Partial<MagazineConfig>) => void;
  resetConfig: () => void;
  applyFix: (fix: IssueFix) => void;

  addFiles: (files: File[]) => Promise<void>;
  loadDemo: (options?: { pageCount?: number; variant?: 'pages' | 'reader-spreads' | 'printer-spreads'; withBleedAndMarks?: boolean }) => Promise<void>;
  removeAsset: (assetId: string) => void;
  clearFiles: () => void;
  sortFilesByName: () => void;
  dismissIngestMessages: () => void;

  movePage: (fromIndex: number, toIndex: number) => void;
  swapPages: (indexA: number, indexB: number) => void;
  insertBlank: (atIndex: number) => void;
  removePage: (pageId: string) => void;
  resetPageOrder: () => void;

  setViewer: (patch: Partial<ViewerState>) => void;
  setGuides: (patch: Partial<GuideVisibility>) => void;
  openPageInViewer: (pageNumber: number) => void;
  openSheetInViewer: (sheetIndex: number, face?: SheetFace) => void;
  setHover: (patch: Partial<HoverState>) => void;

  openSavedProject: (projectId: string | null, snapshot: ProjectSnapshot, version?: string | null) => void;
  setCloudProjectId: (projectId: string | null, version?: string | null) => void;
  dismissRestore: () => void;
}

const IDLE_INGEST: IngestState = { busy: false, source: null, progress: null, rejected: [], error: null };

function segmentationSignature(config: MagazineConfig): string {
  if (config.inputMode === 'pages') return 'pages';
  if (config.spreadKind === 'reader') return `reader|${config.wraparoundCover}|${config.readingDirection}`;
  return `printer|${config.readingDirection}|${config.binding}|${config.signaturePages}|${config.separateCover}`;
}

function isPrinterSpreads(config: MagazineConfig): boolean {
  return config.inputMode === 'spreads' && config.spreadKind === 'printer';
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'No se pudieron leer los archivos.';
}

function renumber(units: SourceUnit[]): SourceUnit[] {
  return units.map((unit, order) => (unit.order === order ? unit : { ...unit, order }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let ingestQueue: Promise<void> = Promise.resolve();
let filesEpoch = 0;
let workEpoch = 0;

export function currentWorkEpoch(): number {
  return workEpoch;
}

const UNLINKED = { cloudProjectId: null, cloudProjectVersion: null } as const;

export const useProjectStore = create<ProjectState>()((set, get) => {
  async function runIngest(files: File[], source: 'files' | 'demo'): Promise<void> {
    if (files.length === 0) return;
    set({ ingest: { ...IDLE_INGEST, busy: true, source } });
    const epoch = filesEpoch;
    try {
      const startOrder = get().units.length;
      const result = await ingestFiles(files, {
        startOrder,
        onProgress: (progress) => set((state) => (state.ingest.busy ? { ingest: { ...state.ingest, progress } } : {})),
      });
      if (epoch !== filesEpoch) {
        for (const asset of result.assets) releaseAsset(asset.id);
        return;
      }
      set((state) => {
        const assets = [...state.assets, ...result.assets];
        const units = renumber([...state.units, ...result.units]);
        const rebuild = !state.pagesEdited || isPrinterSpreads(state.config);
        const added = new Set(result.units.map((unit) => unit.id));
        const pages = rebuild
          ? buildPages(units, state.config)
          : [...state.pages, ...buildPages(units, state.config).filter((page) => page.unitId !== null && added.has(page.unitId))];
        return {
          assets,
          units,
          pages,
          pagesEdited: rebuild ? false : state.pagesEdited,
          ...(source === 'files' && result.assets.length > 0 ? { isDemo: false } : {}),
          ingest: { ...IDLE_INGEST, rejected: result.rejected },
        };
      });
      reconcileRestore();
      fingerprintAssets(result.assets);
    } catch (error) {
      if (epoch !== filesEpoch) return;
      set({ ingest: { ...IDLE_INGEST, error: messageOf(error) } });
    }
  }

  function fingerprintAssets(assets: readonly SourceAsset[]): void {
    if (!fingerprintsEnabled()) return;
    for (const asset of assets) {
      hashFile(asset.file)
        .then((hash) => {
          if (!get().assets.some((current) => current.id === asset.id)) return;
          set((state) => ({ fingerprints: new Map(state.fingerprints).set(asset.id, hash) }));
          reconcileRestore();
        })
        .catch((error: unknown) => {
          console.warn(`Paginator: no se pudo leer «${asset.name}» para calcular su huella`, error);
          if (!get().assets.some((current) => current.id === asset.id)) return;
          set((state) => ({
            fingerprintErrors: new Map(state.fingerprintErrors).set(asset.id, 'No se pudo leer el archivo para reconocerlo. Quítalo y vuelve a cargarlo.'),
          }));
        });
    }
  }

  function reconcileRestore(): void {
    const state = get();
    const pending = state.pendingRestore;
    if (!pending || pending.status !== 'waiting') return;
    const plan = planRestore(pending.snapshot, state.assets, state.units, state.fingerprints);
    const layout = plan.pages ? restoredLayout(pending.snapshot, plan, state.assets, state.units) : null;
    if (!layout) {
      set({ pendingRestore: { ...pending, plan } });
      return;
    }
    saveConfig(layout.config);
    set({ ...layout, pendingRestore: { ...pending, plan, status: 'restored' } });
  }

  function rebuildPages(units: SourceUnit[], config: MagazineConfig): Pick<ProjectState, 'pages' | 'pagesEdited'> {
    return { pages: buildPages(units, config), pagesEdited: false };
  }

  return {
    step: 1,
    config: loadConfig(),
    assets: [],
    units: [],
    pages: [],
    pagesEdited: false,
    isDemo: false,
    ingest: IDLE_INGEST,
    viewer: { spreadIndex: 0, mode: 'reading', sheetIndex: 0, face: 'front', guides: loadGuides(), labels: true },
    hover: { page: null, sheet: null },
    cloudProjectId: null,
    cloudProjectVersion: null,
    fingerprints: new Map(),
    fingerprintErrors: new Map(),
    pendingRestore: null,

    goToStep: (step) => {
      if (step >= 3 && get().pages.length === 0) return;
      set({ step });
    },

    updateConfig: (patch) => {
      set((state) => {
        const config: MagazineConfig = { ...state.config, ...patch };
        saveConfig(config);
        const resegment =
          state.units.length > 0 && segmentationSignature(config) !== segmentationSignature(state.config);
        return resegment ? { config, ...rebuildPages(state.units, config) } : { config };
      });
    },

    resetConfig: () => {
      const { title } = get().config;
      get().updateConfig({ ...DEFAULT_CONFIG, title });
    },

    applyFix: (fix) => {
      const { updateConfig } = get();
      switch (fix.kind) {
        case 'enable-auto-blanks':
          updateConfig({ autoPadBlanks: true });
          break;
        case 'set-input-mode':
          updateConfig({ inputMode: fix.value });
          break;
        case 'set-spread-kind':
          updateConfig({ inputMode: 'spreads', spreadKind: fix.value });
          break;
        case 'set-wraparound-cover':
          updateConfig({ wraparoundCover: fix.value });
          break;
        case 'set-binding':
          updateConfig({ binding: fix.value });
          break;
        case 'use-actual-page-count':
          updateConfig({ declaredPageCount: null });
          break;
      }
    },

    addFiles: (files) => {
      ingestQueue = ingestQueue.then(() => runIngest(files, 'files'));
      return ingestQueue;
    },

    loadDemo: (options) => {
      ingestQueue = ingestQueue.then(async () => {
        get().clearFiles();
        set({ ingest: { ...IDLE_INGEST, busy: true, source: 'demo' } });
        try {
          const demo = await import('@/lib/demo');
          const demoOptions = { ...options, readingDirection: get().config.readingDirection };
          const files = await demo.generateDemoFiles({
            ...demoOptions,
            onProgress: (done, total) =>
              set((state) => ({ ingest: { ...state.ingest, progress: { fileName: demo.DEMO_TITLE, done, total } } })),
          });
          get().updateConfig({ ...demo.demoConfigPatch(demoOptions), title: demo.DEMO_TITLE, declaredPageCount: null });
          await runIngest(files, 'demo');
          set((state) => ({ isDemo: state.assets.length > 0 }));
        } catch (error) {
          set({ ingest: { ...IDLE_INGEST, error: messageOf(error) } });
        }
      });
      return ingestQueue;
    },

    removeAsset: (assetId) => {
      releaseAsset(assetId);
      set((state) => {
        const assets = state.assets.filter((asset) => asset.id !== assetId);
        const removedUnitIds = new Set(state.units.filter((unit) => unit.assetId === assetId).map((unit) => unit.id));
        const units = renumber(state.units.filter((unit) => unit.assetId !== assetId));
        const keepOrder = state.pagesEdited && !isPrinterSpreads(state.config) && units.length > 0;
        const pages = keepOrder
          ? state.pages.filter((page) => page.unitId === null || !removedUnitIds.has(page.unitId))
          : buildPages(units, state.config);
        const fingerprints = new Map(state.fingerprints);
        fingerprints.delete(assetId);
        const fingerprintErrors = new Map(state.fingerprintErrors);
        fingerprintErrors.delete(assetId);
        const unlink = assets.length === 0 && state.assets.length > 0 && state.pendingRestore?.status !== 'waiting';
        if (unlink) workEpoch += 1;
        return {
          ...(unlink ? { ...UNLINKED, pendingRestore: null } : {}),
          assets,
          units,
          pages,
          pagesEdited: keepOrder,
          isDemo: assets.length > 0 && state.isDemo,
          step: pages.length === 0 && state.step > 2 ? 2 : state.step,
          fingerprints,
          fingerprintErrors,
        };
      });
      reconcileRestore();
    },

    clearFiles: () => {
      filesEpoch += 1;
      workEpoch += 1;
      releaseAll();
      set((state) => ({
        assets: [],
        units: [],
        pages: [],
        pagesEdited: false,
        isDemo: false,
        ingest: IDLE_INGEST,
        hover: { page: null, sheet: null },
        viewer: { ...state.viewer, spreadIndex: 0, sheetIndex: 0, face: 'front', mode: 'reading' },
        step: state.step > 2 ? 2 : state.step,
        fingerprints: new Map(),
        fingerprintErrors: new Map(),
        pendingRestore: state.pendingRestore?.status === 'waiting' ? { ...state.pendingRestore, plan: null } : null,
        ...(state.pendingRestore?.status === 'waiting' ? {} : UNLINKED),
      }));
    },

    sortFilesByName: () => {
      set((state) => {
        const assets = [...state.assets].sort((a, b) => naturalCompare(a.name, b.name));
        const rank = new Map(assets.map((asset, index) => [asset.id, index]));
        const units = renumber(
          [...state.units].sort(
            (a, b) =>
              (rank.get(a.assetId) ?? 0) - (rank.get(b.assetId) ?? 0) || a.indexInAsset - b.indexInAsset,
          ),
        );
        return { assets, units, ...rebuildPages(units, state.config) };
      });
    },

    dismissIngestMessages: () => set((state) => ({ ingest: { ...state.ingest, rejected: [], error: null } })),

    movePage: (fromIndex, toIndex) => {
      set((state) => {
        const last = state.pages.length - 1;
        if (last < 1) return {};
        const from = clamp(fromIndex, 0, last);
        const to = clamp(toIndex, 0, last);
        if (from === to) return {};
        const pages = [...state.pages];
        const [moved] = pages.splice(from, 1);
        if (!moved) return {};
        pages.splice(to, 0, moved);
        return { pages, pagesEdited: true };
      });
    },

    swapPages: (indexA, indexB) => {
      set((state) => {
        const a = state.pages[indexA];
        const b = state.pages[indexB];
        if (!a || !b || indexA === indexB) return {};
        const pages = [...state.pages];
        pages[indexA] = b;
        pages[indexB] = a;
        return { pages, pagesEdited: true };
      });
    },

    insertBlank: (atIndex) => {
      set((state) => {
        const pages = [...state.pages];
        pages.splice(clamp(atIndex, 0, pages.length), 0, createManualBlank());
        return { pages, pagesEdited: true };
      });
    },

    removePage: (pageId) => {
      set((state) => {
        const pages = state.pages.filter((page) => page.id !== pageId);
        if (pages.length === state.pages.length) return {};
        return { pages, pagesEdited: true, step: pages.length === 0 && state.step > 2 ? 2 : state.step };
      });
    },

    resetPageOrder: () => set((state) => rebuildPages(state.units, state.config)),

    setViewer: (patch) => set((state) => ({ viewer: { ...state.viewer, ...patch } })),

    setGuides: (patch) => {
      set((state) => {
        const guides = { ...state.viewer.guides, ...patch };
        saveGuides(guides);
        return { viewer: { ...state.viewer, guides } };
      });
    },

    openPageInViewer: (pageNumber) => {
      const state = get();
      if (state.pages.length === 0) return;
      const { pageCount } = selectDerived(state);
      const page = clamp(Math.round(pageNumber), 1, pageCount);
      set({ step: 4, viewer: { ...state.viewer, mode: 'reading', spreadIndex: spreadIndexOfPage(page) } });
    },

    openSheetInViewer: (sheetIndex, face = 'front') => {
      const state = get();
      if (state.pages.length === 0) return;
      const { imposition } = selectDerived(state);
      const index = clamp(Math.round(sheetIndex), 0, imposition.sheets.length - 1);
      set({ step: 4, viewer: { ...state.viewer, mode: 'sheet', sheetIndex: index, face } });
    },

    setHover: (patch) =>
      set((state) => {
        const hover = { ...state.hover, ...patch };
        return hover.page === state.hover.page && hover.sheet === state.hover.sheet ? {} : { hover };
      }),

    openSavedProject: (projectId, snapshot, version = null) => {
      get().clearFiles();
      const config: MagazineConfig = { ...snapshot.config, title: snapshot.title };
      saveConfig(config);
      set({
        config,
        cloudProjectId: projectId,
        cloudProjectVersion: projectId === null ? null : version,
        pendingRestore: { snapshot, plan: null, status: 'waiting' },
        step: 2,
      });
      reconcileRestore();
    },

    setCloudProjectId: (projectId, version = null) =>
      set({ cloudProjectId: projectId, cloudProjectVersion: projectId === null ? null : version }),

    dismissRestore: () =>
      set((state) => ({
        pendingRestore: null,
        ...(state.pendingRestore?.status === 'waiting' ? UNLINKED : {}),
      })),
  };
});

export function useDerived() {
  return useProjectStore(selectDerived);
}
