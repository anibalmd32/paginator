import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import { formatPageRuns } from '@/components/canto';
import { toast } from '@/components/ui';
import { movableSheetRange, slotPageNumbers, type SheetRange } from '@/lib/imposition';
import { selectDerived, useDerived, useProjectStore } from '@/lib/store';
import type { Page } from '@/lib/types';

import { useMatrixUi } from './matrixUi';

const DRAG_SLOP = 4;
const EDGE_SCROLL_ZONE = 64;
const EDGE_SCROLL_MAX = 16;
const SETTLE_MS = 280;
const SHIFT_TRANSITION = 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)';
const SETTLE_TRANSITION = `transform ${String(SETTLE_MS)}ms cubic-bezier(0.16, 1, 0.3, 1)`;

interface RowBox {
  index: number;
  top: number;
  height: number;
}

interface DragSession {
  from: number;
  pointerId: number;
  startX: number;
  startY: number;
  startContentY: number;
  y: number;
  active: boolean;
  boxes: RowBox[];
  target: number;
}

export interface SheetDragState {
  from: number;
  target: number;
}

export interface SheetReorder {
  range: SheetRange;
  drag: SheetDragState | null;
  targetPages: (sheetIndex: number) => string;
  startDrag: (sheetIndex: number, event: ReactPointerEvent<HTMLElement>) => void;
  move: (from: number, to: number, options?: { focus?: boolean }) => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function rowsOf(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-sheet-row]')];
}

function rowOf(root: HTMLElement, index: number): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-sheet-row="${String(index)}"]`);
}

function clearInline(row: HTMLElement): void {
  row.style.removeProperty('transform');
  row.style.removeProperty('transition');
}

function currentEffectivePages(): Page[] {
  return selectDerived(useProjectStore.getState()).effectivePages;
}

function releaseRows(root: HTMLElement | null): void {
  if (!root) return;
  for (const row of rowsOf(root)) {
    row.style.transition = SETTLE_TRANSITION;
    row.style.removeProperty('transform');
    window.setTimeout(() => row.style.removeProperty('transition'), SETTLE_MS + 40);
  }
}

function pageRunsOf(pages: readonly number[]): string {
  return formatPageRuns([...pages].sort((a, b) => a - b));
}

export function useSheetReorder(rootRef: RefObject<HTMLElement | null>, enabled: boolean): SheetReorder | null {
  const derived = useDerived();
  const { imposition } = derived;
  const range = useMemo(() => movableSheetRange(imposition), [imposition]);
  const [drag, setDrag] = useState<SheetDragState | null>(null);
  const session = useRef<DragSession | null>(null);
  const live = useRef({ imposition, range });
  live.current = { imposition, range };

  const contentY = useCallback((clientY: number): number => {
    const root = rootRef.current;
    if (!root) return clientY;
    return clientY - root.getBoundingClientRect().top + root.scrollTop;
  }, [rootRef]);

  const settle = useCallback((before: ReadonlyMap<string, number>): void => {
    const root = rootRef.current;
    if (!root) return;
    const rows = rowsOf(root);
    rows.forEach(clearInline);
    if (prefersReducedMotion()) return;
    const moving: HTMLElement[] = [];
    for (const row of rows) {
      const key = row.dataset['flipKey'];
      const previous = key !== undefined ? before.get(key) : undefined;
      if (previous === undefined) continue;
      const delta = previous - row.getBoundingClientRect().top;
      if (Math.abs(delta) < 0.5) continue;
      row.style.transition = 'none';
      row.style.transform = `translateY(${String(delta)}px)`;
      moving.push(row);
    }
    if (moving.length === 0) return;
    void root.offsetHeight;
    for (const row of moving) {
      row.style.transition = SETTLE_TRANSITION;
      row.style.removeProperty('transform');
      window.setTimeout(() => row.style.removeProperty('transition'), SETTLE_MS + 40);
    }
  }, [rootRef]);

  const move = useCallback(
    (from: number, to: number, options: { focus?: boolean } = {}): void => {
      const root = rootRef.current;
      const before = new Map<string, number>();
      if (root) {
        for (const row of rowsOf(root)) {
          const key = row.dataset['flipKey'];
          if (key !== undefined) before.set(key, row.getBoundingClientRect().top);
        }
      }

      const project = useProjectStore.getState();
      const ui = useMatrixUi.getState();
      const effectiveBefore = currentEffectivePages();
      const selectedId = ui.selectedPage !== null ? (effectiveBefore[ui.selectedPage - 1]?.id ?? null) : null;
      const focusedCell = options.focus && document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-cell]') : null;
      const focusedId = focusedCell ? (effectiveBefore[Number(focusedCell.dataset['page']) - 1]?.id ?? null) : null;

      let moved = false;
      flushSync(() => {
        setDrag(null);
        moved = project.moveSheet(from, to);
      });
      if (!moved) {
        if (root) rowsOf(root).forEach(clearInline);
        return;
      }
      settle(before);
      project.setHover({ page: null, sheet: null });

      const after = currentEffectivePages();
      const selected = selectedId !== null ? after.findIndex((page) => page.id === selectedId) + 1 : 0;
      const sheets = live.current.imposition.sheets;
      if (selected > 0) {
        const sheet = sheets.find((candidate) => slotPageNumbers(candidate).includes(selected));
        ui.selectPage(selected, sheet?.index ?? to);
        ui.setTabbable(selected);
      } else {
        ui.setActiveSheet(to);
      }

      if (options.focus && root) {
        const focusedPage = focusedId !== null ? after.findIndex((page) => page.id === focusedId) + 1 : 0;
        const cell =
          (focusedPage > 0 ? root.querySelector<HTMLElement>(`[data-cell][data-page="${String(focusedPage)}"]`) : null) ??
          rowOf(root, to)?.querySelector<HTMLElement>('[data-cell]');
        if (cell) {
          ui.setTabbable(Number(cell.dataset['page']));
          cell.focus({ preventScroll: true });
          cell.scrollIntoView({ block: 'nearest' });
        }
      }

      const sheet = sheets[to];
      const runs = sheet ? pageRunsOf(slotPageNumbers(sheet)) : '';
      toast({
        id: 'pliego-movido',
        title: `Pliego movido a la posición ${String(to + 1)}`,
        description: `Sus cuatro páginas pasan a ser las ${runs} y el resto de la revista se renumera.`,
        tone: 'success',
        action: { label: 'Deshacer', onClick: () => moveRef.current(to, from, { focus: true }) },
      });
    },
    [rootRef, settle],
  );

  const moveRef = useRef(move);
  moveRef.current = move;

  const layout = useCallback((drag: DragSession): void => {
    const root = rootRef.current;
    const bounds = live.current.range;
    if (!root || !bounds) return;
    const boxes = drag.boxes;
    const origin = boxes.find((box) => box.index === drag.from);
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    if (!origin || !first || !last) return;

    const raw = contentY(drag.y) - drag.startContentY;
    const offset = Math.min(last.top + last.height - origin.top - origin.height, Math.max(first.top - origin.top, raw));
    const center = origin.top + origin.height / 2 + offset;

    let target = drag.from;
    for (const box of boxes) {
      const middle = box.top + box.height / 2;
      if (box.index > drag.from && center > middle) target = box.index;
      if (box.index < drag.from && center < middle && box.index < target) target = box.index;
    }

    for (const box of boxes) {
      const row = rowOf(root, box.index);
      if (!row) continue;
      if (box.index === drag.from) {
        row.style.transform = `translateY(${String(offset)}px)`;
        continue;
      }
      let shift = 0;
      if (drag.from < target && box.index > drag.from && box.index <= target) {
        const previous = boxes.find((candidate) => candidate.index === box.index - 1);
        if (previous) shift = previous.top - box.top;
      } else if (drag.from > target && box.index < drag.from && box.index >= target) {
        const next = boxes.find((candidate) => candidate.index === box.index + 1);
        if (next) shift = next.top - box.top;
      }
      row.style.transition = SHIFT_TRANSITION;
      row.style.transform = shift === 0 ? '' : `translateY(${String(shift)}px)`;
    }

    if (target !== drag.target) {
      drag.target = target;
      setDrag({ from: drag.from, target });
    }
  }, [contentY, rootRef]);

  const startDrag = useCallback(
    (sheetIndex: number, event: ReactPointerEvent<HTMLElement>): void => {
      const bounds = live.current.range;
      if (!enabled || !bounds || event.button !== 0) return;
      if (sheetIndex < bounds.first || sheetIndex > bounds.last) return;
      session.current = {
        from: sheetIndex,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startContentY: 0,
        y: event.clientY,
        active: false,
        boxes: [],
        target: sheetIndex,
      };
    },
    [enabled],
  );

  useEffect(() => {
    let frame = 0;

    const end = (): void => {
      session.current = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      document.documentElement.style.removeProperty('cursor');
      rootRef.current?.removeAttribute('data-sheet-dragging');
    };

    const cancel = (): void => {
      const active = session.current?.active;
      end();
      if (!active) return;
      setDrag(null);
      releaseRows(rootRef.current);
    };

    const activate = (drag: DragSession): void => {
      const root = rootRef.current;
      const bounds = live.current.range;
      if (!root || !bounds) return;
      root.setAttribute('data-sheet-dragging', '');
      const boxes: RowBox[] = [];
      for (let index = bounds.first; index <= bounds.last; index += 1) {
        const row = rowOf(root, index);
        if (!row) continue;
        const rect = row.getBoundingClientRect();
        boxes.push({ index, top: contentY(rect.top), height: rect.height });
      }
      drag.boxes = boxes;
      drag.startContentY = contentY(drag.startY);
      drag.active = true;
      document.documentElement.style.setProperty('cursor', 'grabbing');
      useProjectStore.getState().setHover({ page: null, sheet: null });
      setDrag({ from: drag.from, target: drag.from });
    };

    const tick = (): void => {
      frame = 0;
      const drag = session.current;
      const root = rootRef.current;
      if (!drag?.active || !root) return;
      const rect = root.getBoundingClientRect();
      const fromTop = drag.y - rect.top;
      const fromBottom = rect.bottom - drag.y;
      let delta = 0;
      if (fromTop < EDGE_SCROLL_ZONE) delta = -EDGE_SCROLL_MAX * (1 - Math.max(0, fromTop) / EDGE_SCROLL_ZONE);
      else if (fromBottom < EDGE_SCROLL_ZONE) delta = EDGE_SCROLL_MAX * (1 - Math.max(0, fromBottom) / EDGE_SCROLL_ZONE);
      if (delta === 0) return;
      const previous = root.scrollTop;
      root.scrollTop += delta;
      if (root.scrollTop !== previous) layout(drag);
      frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent): void => {
      const drag = session.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.y = event.clientY;
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_SLOP) return;
        activate(drag);
      }
      event.preventDefault();
      layout(drag);
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onUp = (event: PointerEvent): void => {
      const drag = session.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.active) {
        end();
        return;
      }
      const { from, target } = drag;
      if (target === from) {
        cancel();
        return;
      }
      end();
      moveRef.current(from, target);
    };

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && session.current?.active) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [contentY, layout, rootRef]);

  const targetPages = useCallback(
    (sheetIndex: number): string => {
      const sheet = imposition.sheets[sheetIndex];
      return sheet ? `págs. ${pageRunsOf(slotPageNumbers(sheet))}` : '';
    },
    [imposition],
  );

  return useMemo(
    () => (enabled && range ? { range, drag, targetPages, startDrag, move } : null),
    [enabled, range, drag, targetPages, startDrag, move],
  );
}
