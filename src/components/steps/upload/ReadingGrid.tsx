import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { useDerived, useProjectStore } from '@/lib/store';
import type { PageBox } from '@/lib/store';
import type { SlotPosition } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { FOLIO_ISSUE_CODES, moveDestination, slotLabel, storeIndexOf } from './format';
import { EmptySlot, PageCard, type PageCardActions } from './PageCard';
import styles from './ReadingGrid.module.css';

export type ThumbSize = 's' | 'm' | 'l';

export const THUMB_WIDTH: Record<ThumbSize, number> = { s: 76, m: 108, l: 156 };

const DRAG_SLOP = 5;
const EDGE_SCROLL_ZONE = 56;
const EDGE_SCROLL_MAX = 18;

export const PRINTER_LOCK = 'Con pliegos de imprenta el orden lo dicta la imposición inversa: para cambiarlo, reordena las caras en los archivos.';
const AUTO_BLANK_LOCK = 'Las cortesías se añaden solas para cerrar el último pliego: no se mueven ni se quitan a mano.';

interface DropTarget {
  page: number;
  edge: SlotPosition;
  after: boolean;
}

interface DragSession {
  pageId: string;
  pageNumber: number;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
}

export interface ReadingGridProps {
  selectedId: string | null;
  onSelect: (pageId: string) => void;
  thumb: ThumbSize;
  box: PageBox;
  announce: (message: string) => void;
}

export function ReadingGrid({ selectedId, onSelect, thumb, box, announce }: ReadingGridProps) {
  const derived = useDerived();
  const pages = useProjectStore((state) => state.pages);
  const config = useProjectStore((state) => state.config);
  const guides = useProjectStore((state) => state.viewer.guides);
  const hover = useProjectStore((state) => state.hover);
  const setHover = useProjectStore((state) => state.setHover);
  const movePage = useProjectStore((state) => state.movePage);
  const insertBlank = useProjectStore((state) => state.insertBlank);
  const removePage = useProjectStore((state) => state.removePage);
  const openPageInViewer = useProjectStore((state) => state.openPageInViewer);

  const { effectivePages, imposition, issuesByPage, worstByPage, pageCount } = derived;
  const rtl = config.readingDirection === 'rtl';
  const printer = config.inputMode === 'spreads' && config.spreadKind === 'printer';

  const scrollRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const pendingFocus = useRef<{ id: string } | { position: number } | null>(null);
  const suppressClick = useRef(false);

  const live = useRef({ effectivePages, pages, imposition, rtl, printer, pageCount });
  live.current = { effectivePages, pages, imposition, rtl, printer, pageCount };

  const pageNumberOfId = useMemo(() => new Map(effectivePages.map((page, index) => [page.id, index + 1])), [effectivePages]);
  const firstId = effectivePages[0]?.id ?? null;
  const tabbableId = activeId !== null && pageNumberOfId.has(activeId) ? activeId : selectedId !== null && pageNumberOfId.has(selectedId) ? selectedId : firstId;

  const hoveredPage = hover.page;
  const hoveredSheet = hover.sheet ?? (hoveredPage !== null ? (imposition.placements[hoveredPage - 1]?.sheetIndex ?? null) : null);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const selector =
      'id' in target
        ? `[data-page-id="${CSS.escape(target.id)}"]`
        : `[data-page-button="${String(Math.min(Math.max(1, target.position), Math.max(1, pageCount)))}"]`;
    const button = scrollRef.current?.querySelector<HTMLButtonElement>(selector);
    button?.focus();
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  useEffect(() => {
    if (selectedId === null) return;
    const button = scrollRef.current?.querySelector<HTMLButtonElement>(`[data-page-id="${CSS.escape(selectedId)}"]`);
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  const focusPage = useCallback((pageNumber: number): void => {
    const page = live.current.effectivePages[pageNumber - 1];
    if (!page) return;
    setActiveId(page.id);
    pendingFocus.current = { id: page.id };
  }, []);

  const moveToPosition = useCallback(
    (pageNumber: number, position: number): void => {
      const { effectivePages: effective, pages: list, pageCount: total } = live.current;
      const from = storeIndexOf(pageNumber, effective, list);
      if (from === null) return;
      let target = Math.min(total, Math.max(1, Math.round(position)));
      while (target < total && effective[target - 1]?.origin === 'auto-blank') target += 1;
      let to = storeIndexOf(target, effective, list);
      if (to === null) to = list.length - 1;
      const page = effective[pageNumber - 1];
      movePage(from, to);
      if (page) {
        pendingFocus.current = { id: page.id };
        setActiveId(page.id);
        const after = useProjectStore.getState().pages.findIndex((candidate) => candidate.id === page.id);
        announce(`Página ${String(pageNumber)} movida a la posición ${String(after + 1)}.`);
      }
    },
    [movePage, announce],
  );

  const keyDown = useCallback(
    (pageNumber: number, event: KeyboardEvent<HTMLButtonElement>): void => {
      const { effectivePages: effective, pages: list, rtl: isRtl, printer: isPrinter, pageCount: total } = live.current;
      const visualStep = (key: string): number => ((key === 'ArrowRight') !== isRtl ? 1 : -1);

      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && event.altKey) {
        event.preventDefault();
        const page = effective[pageNumber - 1];
        if (!page) return;
        if (isPrinter || page.origin === 'auto-blank') {
          announce(isPrinter ? PRINTER_LOCK : AUTO_BLANK_LOCK);
          return;
        }
        const from = storeIndexOf(pageNumber, effective, list);
        if (from === null) return;
        const to = from + visualStep(event.key);
        if (to < 0 || to >= list.length) return;
        movePage(from, to);
        pendingFocus.current = { id: page.id };
        setActiveId(page.id);
        const now = useProjectStore.getState().pages.findIndex((candidate) => candidate.id === page.id);
        announce(`Página movida a la posición ${String(now + 1)}.`);
        return;
      }

      if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
        event.preventDefault();
        setMenuFor(pageNumber);
        return;
      }

      let next: number | null = null;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = pageNumber + visualStep(event.key);
      else if (event.key === 'Home') next = 1;
      else if (event.key === 'End') next = total;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') next = verticalNeighbour(scrollRef.current, pageNumber, event.key === 'ArrowDown');
      if (next === null) return;
      event.preventDefault();
      focusPage(Math.min(total, Math.max(1, next)));
    },
    [announce, focusPage, movePage],
  );

  const session = useRef<DragSession | null>(null);
  const dropRef = useRef<DropTarget | null>(null);

  const updateDrop = useCallback((next: DropTarget | null): void => {
    const current = dropRef.current;
    if (current?.page === next?.page && current?.edge === next?.edge) return;
    dropRef.current = next;
    setDrop(next);
  }, []);

  const pointerDown = useCallback(
    (pageNumber: number, event: ReactPointerEvent<HTMLButtonElement>): void => {
      const { effectivePages: effective, printer: isPrinter } = live.current;
      const page = effective[pageNumber - 1];
      if (event.button !== 0 || isPrinter || !page || page.origin === 'auto-blank') return;
      session.current = {
        pageId: page.id,
        pageNumber,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
      };
    },
    [],
  );

  useEffect(() => {
    let frame = 0;

    const placeGhost = (drag: DragSession): void => {
      const ghost = ghostRef.current;
      if (ghost) ghost.style.transform = `translate(${String(drag.x + 14)}px, ${String(drag.y + 14)}px)`;
    };

    const findTarget = (drag: DragSession): DropTarget | null => {
      const element = document.elementFromPoint(drag.x, drag.y)?.closest<HTMLElement>('[data-drop-page]');
      if (!element || !scrollRef.current?.contains(element)) return null;
      const pageNumber = Number(element.dataset.dropPage);
      const page = live.current.effectivePages[pageNumber - 1];
      if (!page || page.origin === 'auto-blank' || page.id === drag.pageId) return null;
      const rect = element.getBoundingClientRect();
      const rightHalf = drag.x > rect.left + rect.width / 2;
      return { page: pageNumber, edge: rightHalf ? 'right' : 'left', after: rightHalf !== live.current.rtl };
    };

    const tick = (): void => {
      frame = 0;
      const drag = session.current;
      const scroller = scrollRef.current;
      if (!drag?.active || !scroller) return;
      const rect = scroller.getBoundingClientRect();
      const fromTop = drag.y - rect.top;
      const fromBottom = rect.bottom - drag.y;
      let delta = 0;
      if (fromTop < EDGE_SCROLL_ZONE) delta = -EDGE_SCROLL_MAX * (1 - Math.max(0, fromTop) / EDGE_SCROLL_ZONE);
      else if (fromBottom < EDGE_SCROLL_ZONE) delta = EDGE_SCROLL_MAX * (1 - Math.max(0, fromBottom) / EDGE_SCROLL_ZONE);
      if (delta !== 0) {
        scroller.scrollTop += delta;
        updateDrop(findTarget(drag));
        frame = requestAnimationFrame(tick);
      }
    };

    const end = (): void => {
      session.current = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setLiftedId(null);
      updateDrop(null);
      document.documentElement.style.removeProperty('cursor');
    };

    const onMove = (event: PointerEvent): void => {
      const drag = session.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.active) {
        if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_SLOP) return;
        drag.active = true;
        setLiftedId(drag.pageId);
        setMenuFor(null);
        document.documentElement.style.setProperty('cursor', 'grabbing');
      }
      event.preventDefault();
      placeGhost(drag);
      updateDrop(findTarget(drag));
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onUp = (event: PointerEvent): void => {
      const drag = session.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const target = dropRef.current;
      if (drag.active) {
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      if (drag.active && target) {
        const { effectivePages: effective, pages: list } = live.current;
        const fromNumber = (pageNumberOfIdIn(effective, drag.pageId) ?? drag.pageNumber);
        const from = storeIndexOf(fromNumber, effective, list);
        const targetIndex = storeIndexOf(target.page, effective, list);
        if (from !== null && targetIndex !== null) {
          const to = moveDestination(from, targetIndex, target.after);
          if (to !== from) {
            movePage(from, to);
            setActiveId(drag.pageId);
            announce(`Página ${String(fromNumber)} movida a la posición ${String(to + 1)}.`);
          }
        }
      }
      end();
    };

    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape' && session.current?.active) {
        event.preventDefault();
        end();
        announce('Arrastre cancelado.');
      }
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keydown', onKey, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [announce, movePage, updateDrop]);

  const actions = useMemo<PageCardActions>(
    () => ({
      select: (pageNumber) => {
        if (suppressClick.current) return;
        const page = live.current.effectivePages[pageNumber - 1];
        if (!page) return;
        setActiveId(page.id);
        onSelect(page.id);
      },
      hover: (pageNumber) => {
        if (pageNumber === null) {
          setHover({ page: null, sheet: null });
          return;
        }
        const placement = live.current.imposition.placements[pageNumber - 1];
        setHover({ page: pageNumber, sheet: placement?.sheetIndex ?? null });
      },
      keyDown,
      pointerDown,
      focus: (pageNumber) => {
        const page = live.current.effectivePages[pageNumber - 1];
        if (page) setActiveId(page.id);
      },
      setMenu: setMenuFor,
      moveTo: moveToPosition,
      insertBlank: (pageNumber, after) => {
        const { effectivePages: effective, pages: list } = live.current;
        const index = storeIndexOf(pageNumber, effective, list);
        if (index === null) return;
        insertBlank(after ? index + 1 : index);
        const page = effective[pageNumber - 1];
        if (page) {
          pendingFocus.current = { id: page.id };
          setActiveId(page.id);
        }
        announce(`Blanca insertada ${after ? 'después de' : 'antes de'} la página ${String(pageNumber)}.`);
      },
      remove: (pageNumber) => {
        const page = live.current.effectivePages[pageNumber - 1];
        if (!page || page.origin === 'auto-blank') return;
        removePage(page.id);
        pendingFocus.current = { position: pageNumber };
        announce(`Página ${String(pageNumber)} quitada. «Restablecer orden» la recupera.`);
      },
      openInViewer: openPageInViewer,
    }),
    [announce, insertBlank, keyDown, moveToPosition, onSelect, openPageInViewer, pointerDown, removePage, setHover],
  );

  const aspect = derived.trim.heightMm > 0 ? derived.trim.widthMm / derived.trim.heightMm : 0.707;
  const gridStyle = { '--page-w': `${String(THUMB_WIDTH[thumb])}px` } as CSSProperties;
  const liftedNumber = liftedId !== null ? (pageNumberOfId.get(liftedId) ?? null) : null;

  const renderSlot = (pageNumber: number | null, side: SlotPosition) => {
    if (pageNumber === null) return <EmptySlot key={side} side={side} aspect={aspect} />;
    const page = effectivePages[pageNumber - 1];
    if (!page) return <EmptySlot key={side} side={side} aspect={aspect} />;
    const placement = imposition.placements[pageNumber - 1];
    const issues = issuesByPage.get(pageNumber) ?? [];
    const folioIssue = page.detectedFolio !== null && issues.some((issue) => FOLIO_ISSUE_CODES.has(issue.code));
    const autoBlank = page.origin === 'auto-blank';
    return (
      <PageCard
        key={side}
        pageNumber={pageNumber}
        pageId={page.id}
        pageCount={pageCount}
        side={side}
        origin={page.origin}
        slot={slotLabel(placement)}
        box={box}
        guides={guides}
        selected={page.id === selectedId}
        tabbable={page.id === tabbableId}
        hovered={hoveredPage === pageNumber}
        sibling={hoveredSheet !== null && placement?.sheetIndex === hoveredSheet && hoveredPage !== pageNumber}
        flag={worstByPage.get(pageNumber) ?? null}
        issueTitles={issueTitlesOf(issues)}
        folioNote={folioIssue ? `Folio impreso ${String(page.detectedFolio)}` : null}
        draggable={!printer && !autoBlank}
        lockedReason={printer ? PRINTER_LOCK : autoBlank ? AUTO_BLANK_LOCK : null}
        dropEdge={drop?.page === pageNumber ? drop.edge : null}
        lifted={liftedId === page.id}
        menuOpen={menuFor === pageNumber}
        actions={actions}
      />
    );
  };

  return (
    <div ref={scrollRef} className={styles.scroller} data-reordering={liftedId !== null ? '' : undefined}>
      <ol className={cx(styles.grid, rtl && styles.rtl)} style={gridStyle} aria-label="Páginas en orden de lectura">
        {imposition.spreads.map((spread) => (
          <li key={spread.index} className={styles.spread} aria-label={spreadLabel(spread.left, spread.right, pageCount)}>
            <div className={styles.pair}>
              {renderSlot(spread.left, 'left')}
              {renderSlot(spread.right, 'right')}
            </div>
          </li>
        ))}
      </ol>
      <div ref={ghostRef} className={styles.ghost} hidden={liftedNumber === null} aria-hidden="true">
        {liftedNumber !== null ? `Página ${String(liftedNumber)}` : null}
        {drop ? <span className={styles.ghostTarget}>{` → ${drop.after ? 'detrás de' : 'delante de'} la ${String(drop.page)}`}</span> : null}
      </div>
    </div>
  );
}

const titlesCache = new WeakMap<readonly { title: string }[], readonly string[]>();
const NO_TITLES: readonly string[] = [];
function issueTitlesOf(issues: readonly { title: string }[]): readonly string[] {
  if (issues.length === 0) return NO_TITLES;
  let titles = titlesCache.get(issues);
  if (!titles) {
    titles = issues.map((issue) => issue.title);
    titlesCache.set(issues, titles);
  }
  return titles;
}

function pageNumberOfIdIn(pages: readonly { id: string }[], id: string): number | null {
  const index = pages.findIndex((page) => page.id === id);
  return index >= 0 ? index + 1 : null;
}

function spreadLabel(left: number | null, right: number | null, total: number): string {
  if (left === null || right === null) {
    const only = left ?? right;
    if (only === 1) return 'Portada';
    if (only === total) return 'Contraportada';
    return `Página ${String(only)}`;
  }
  const [a, b] = left < right ? [left, right] : [right, left];
  return `Pliego de lectura, páginas ${String(a)} y ${String(b)}`;
}

function verticalNeighbour(root: HTMLElement | null, pageNumber: number, down: boolean): number | null {
  if (!root) return null;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-page-button]')];
  const current = buttons.find((button) => Number(button.dataset.pageButton) === pageNumber);
  if (!current) return null;
  const from = current.getBoundingClientRect();
  const cx0 = from.left + from.width / 2;
  let best: { number: number; dy: number; dx: number } | null = null;
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    const dy = down ? rect.top - from.top : from.top - rect.top;
    if (dy < 4) continue;
    const dx = Math.abs(rect.left + rect.width / 2 - cx0);
    if (!best || dy < best.dy - 4 || (Math.abs(dy - best.dy) <= 4 && dx < best.dx)) {
      best = { number: Number(button.dataset.pageButton), dy, dx };
    }
  }
  return best?.number ?? null;
}
