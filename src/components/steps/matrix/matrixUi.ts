import { create } from 'zustand';

import { useProjectStore } from '@/lib/store';

export type MatrixView = 'sheets' | 'reading';

export interface LocateRequest {
  page: number | null;
  sheet: number | null;
  focus: boolean;
  nonce: number;
}

export interface VisibleRange {
  view: MatrixView;
  first: number;
  last: number;
}

export interface MatrixUiState {
  view: MatrixView;
  onlyIssues: boolean;
  selectedPage: number | null;
  activeSheet: number | null;
  tabbablePage: number | null;
  locate: LocateRequest | null;
  visible: VisibleRange | null;

  setView: (view: MatrixView) => void;
  setOnlyIssues: (onlyIssues: boolean) => void;
  selectPage: (page: number | null, sheet?: number | null) => void;
  setActiveSheet: (sheet: number | null) => void;
  setTabbable: (page: number | null) => void;
  locatePage: (page: number, sheet: number | null, focus?: boolean) => void;
  locateSheet: (sheet: number) => void;
  clearLocate: (nonce: number) => void;
  setVisible: (visible: VisibleRange | null) => void;
  resetSelection: (options?: { filter?: boolean }) => void;
}

let nonce = 0;

export const useMatrixUi = create<MatrixUiState>()((set) => ({
  view: 'sheets',
  onlyIssues: false,
  selectedPage: null,
  activeSheet: null,
  tabbablePage: null,
  locate: null,
  visible: null,

  setView: (view) => set({ view }),
  setOnlyIssues: (onlyIssues) => set({ onlyIssues }),
  selectPage: (page, sheet) =>
    set((state) => ({ selectedPage: page, activeSheet: sheet === undefined ? state.activeSheet : sheet })),
  setActiveSheet: (activeSheet) => set({ activeSheet }),
  setTabbable: (tabbablePage) => set((state) => (state.tabbablePage === tabbablePage ? {} : { tabbablePage })),
  locatePage: (page, sheet, focus = false) => {
    nonce += 1;
    set({ locate: { page, sheet, focus, nonce }, tabbablePage: page, ...(sheet !== null ? { activeSheet: sheet } : {}) });
  },
  locateSheet: (sheet) => {
    nonce += 1;
    set({ locate: { page: null, sheet, focus: false, nonce }, activeSheet: sheet });
  },
  clearLocate: (done) => set((state) => (state.locate?.nonce === done ? { locate: null } : {})),
  setVisible: (visible) =>
    set((state) => {
      const previous = state.visible;
      if (previous && visible && previous.view === visible.view && previous.first === visible.first && previous.last === visible.last) return {};
      if (previous === visible) return {};
      return { visible };
    }),
  resetSelection: (options) =>
    set({ selectedPage: null, activeSheet: null, tabbablePage: null, locate: null, visible: null, ...(options?.filter ? { onlyIssues: false } : {}) }),
}));

useProjectStore.subscribe((state, previous) => {
  if (state.assets === previous.assets) return;
  useMatrixUi.getState().resetSelection({ filter: state.assets.length === 0 });
});
