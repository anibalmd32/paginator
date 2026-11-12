import { useCallback, type KeyboardEvent, type RefObject } from 'react';

import { useMatrixUi } from './matrixUi';

export interface CellTarget {
  page: number;
  sheet: number;
  face: 'front' | 'back';
}

export interface GridNavigationOptions {
  onSelect: (target: CellTarget) => void;
  onOpen3d: (target: CellTarget) => void;
  onOpenSheet: (target: CellTarget) => void;
  onEscape: () => void;
}

function cellsOf(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-cell]')];
}

export function targetOf(element: HTMLElement): CellTarget | null {
  const page = Number(element.dataset['page']);
  const sheet = Number(element.dataset['sheet']);
  if (!Number.isFinite(page) || !Number.isFinite(sheet)) return null;
  return { page, sheet, face: element.dataset['face'] === 'back' ? 'back' : 'front' };
}

function verticalNeighbour(cells: HTMLElement[], from: HTMLElement, down: boolean): HTMLElement | null {
  const origin = from.getBoundingClientRect();
  const centerX = origin.left + origin.width / 2;
  const slack = Math.min(12, origin.height / 3);
  const candidates = cells
    .map((cell) => ({ cell, rect: cell.getBoundingClientRect() }))
    .filter(({ rect }) => (down ? rect.top > origin.top + slack : rect.top < origin.top - slack));
  if (candidates.length === 0) return null;
  const rowTop = down ? Math.min(...candidates.map(({ rect }) => rect.top)) : Math.max(...candidates.map(({ rect }) => rect.top));
  const row = candidates.filter(({ rect }) => Math.abs(rect.top - rowTop) <= slack);
  row.sort((a, b) => Math.abs(a.rect.left + a.rect.width / 2 - centerX) - Math.abs(b.rect.left + b.rect.width / 2 - centerX));
  return row[0]?.cell ?? null;
}

export function useGridNavigation(rootRef: RefObject<HTMLElement | null>, options: GridNavigationOptions) {
  const { onSelect, onOpen3d, onOpenSheet, onEscape } = options;

  const moveTo = useCallback((cell: HTMLElement | null | undefined): void => {
    if (!cell) return;
    const target = targetOf(cell);
    if (!target) return;
    useMatrixUi.getState().setTabbable(target.page);
    cell.focus({ preventScroll: true });
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  return useCallback(
    (event: KeyboardEvent<HTMLElement>): void => {
      const root = rootRef.current;
      const current = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]');
      if (!root || !current || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = targetOf(current);
      if (!target) return;
      const cells = cellsOf(root);
      const index = cells.indexOf(current);

      switch (event.key) {
        case 'ArrowRight':
          moveTo(cells[index + 1]);
          break;
        case 'ArrowLeft':
          moveTo(cells[index - 1]);
          break;
        case 'ArrowDown':
          moveTo(verticalNeighbour(cells, current, true));
          break;
        case 'ArrowUp':
          moveTo(verticalNeighbour(cells, current, false));
          break;
        case 'Home':
          moveTo(cells[0]);
          break;
        case 'End':
          moveTo(cells[cells.length - 1]);
          break;
        case 'Enter':
        case ' ':
          onSelect(target);
          break;
        case 'v':
        case 'V':
          onOpen3d(target);
          break;
        case 'd':
        case 'D':
          onOpenSheet(target);
          break;
        case 'Escape':
          onEscape();
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [rootRef, moveTo, onSelect, onOpen3d, onOpenSheet, onEscape],
  );
}
