import { MoreHorizontal } from 'lucide-react';
import { memo, type KeyboardEvent, type PointerEvent } from 'react';

import { PageThumb } from '@/components/page/PageThumb';
import { Icon, IconButton, Popover, StatusBadge, Tooltip } from '@/components/ui';
import type { PageBox } from '@/lib/store';
import type { GuideVisibility, IssueSeverity, PageOrigin, SlotPosition } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import styles from './PageCard.module.css';
import { PageMenu } from './PageMenu';

export interface PageCardActions {
  select: (pageNumber: number) => void;
  hover: (pageNumber: number | null) => void;
  keyDown: (pageNumber: number, event: KeyboardEvent<HTMLButtonElement>) => void;
  pointerDown: (pageNumber: number, event: PointerEvent<HTMLButtonElement>) => void;
  focus: (pageNumber: number) => void;
  setMenu: (pageNumber: number | null) => void;
  moveTo: (pageNumber: number, position: number) => void;
  insertBlank: (pageNumber: number, after: boolean) => void;
  remove: (pageNumber: number) => void;
  openInViewer: (pageNumber: number) => void;
}

const SEVERITY_TEXT: Record<IssueSeverity, string> = { error: 'Error', warning: 'Aviso', info: 'Nota' };

export interface PageCardProps {
  pageNumber: number;
  pageId: string;
  pageCount: number;
  side: SlotPosition;
  origin: PageOrigin;
  slot: string;
  box: PageBox;
  guides: GuideVisibility;
  selected: boolean;
  tabbable: boolean;
  hovered: boolean;
  sibling: boolean;
  flag: IssueSeverity | null;
  issueTitles: readonly string[];
  folioNote: string | null;
  draggable: boolean;
  lockedReason: string | null;
  dropEdge: SlotPosition | null;
  lifted: boolean;
  menuOpen: boolean;
  actions: PageCardActions;
}

export const PageCard = memo(function PageCard({
  pageNumber,
  pageId,
  pageCount,
  side,
  origin,
  slot,
  box,
  guides,
  selected,
  tabbable,
  hovered,
  sibling,
  flag,
  issueTitles,
  folioNote,
  draggable,
  lockedReason,
  dropEdge,
  lifted,
  menuOpen,
  actions,
}: PageCardProps) {
  const blankText = origin === 'auto-blank' ? 'cortesía' : origin === 'manual-blank' ? 'blanca' : null;
  const issuesText = flag ? `${SEVERITY_TEXT[flag]}: ${issueTitles.join('; ')}` : null;
  const label = [`Página ${String(pageNumber)}`, blankText, slot, folioNote, issuesText].filter(Boolean).join(' · ');
  const [slotSheet, ...slotRest] = slot.split(' · ');

  return (
    <div
      className={styles.card}
      data-side={side}
      data-selected={selected ? '' : undefined}
      data-hovered={hovered ? '' : undefined}
      data-sibling={sibling ? '' : undefined}
      data-lifted={lifted ? '' : undefined}
      data-drop-edge={dropEdge ?? undefined}
      data-menu-open={menuOpen ? '' : undefined}
      data-drop-page={pageNumber}
      onPointerEnter={() => actions.hover(pageNumber)}
      onPointerLeave={() => actions.hover(null)}
    >
      <button
        type="button"
        className={cx(styles.hit, draggable && styles.grab)}
        data-page-button={pageNumber}
        data-page-id={pageId}
        tabIndex={tabbable ? 0 : -1}
        aria-label={label}
        aria-pressed={selected}
        aria-keyshortcuts={draggable ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined}
        onClick={() => actions.select(pageNumber)}
        onKeyDown={(event) => actions.keyDown(pageNumber, event)}
        onPointerDown={(event) => actions.pointerDown(pageNumber, event)}
        onFocus={() => {
          actions.focus(pageNumber);
          actions.hover(pageNumber);
        }}
        onBlur={() => actions.hover(null)}
      >
        <span className={styles.frame}>
          <PageThumb pageNumber={pageNumber} box={box} guides={guides} />
        </span>
        <span className={styles.meta} aria-hidden="true">
          <span className={styles.number}>{pageNumber}</span>
          {flag ? (
            <Tooltip
              content={
                <ul className={styles.tipList}>
                  {issueTitles.map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
              }
              placement="top"
              semantics="label"
            >
              <span className={styles.flag} aria-hidden="true">
                <StatusBadge tone={flag} size="sm" emphasis={flag === 'error' ? 'solid' : 'soft'}>
                  {issueTitles.length > 1 ? `${SEVERITY_TEXT[flag]} +${String(issueTitles.length - 1)}` : SEVERITY_TEXT[flag]}
                </StatusBadge>
              </span>
            </Tooltip>
          ) : null}
          <span className={styles.slot}>
            <span className={styles.slotPart}>{slotRest.length > 0 ? `${slotSheet ?? ''} ·` : slotSheet}</span>
            {slotRest.length > 0 ? <span className={styles.slotPart}>{slotRest.join(' · ')}</span> : null}
          </span>
        </span>
        {folioNote ? (
          <span className={styles.folio} aria-hidden="true">
            {folioNote}
          </span>
        ) : null}
      </button>

      <div className={styles.menu}>
        <Popover
          open={menuOpen}
          onOpenChange={(open) => actions.setMenu(open ? pageNumber : null)}
          title={`Página ${String(pageNumber)}`}
          placement="bottom"
          align={side === 'left' ? 'start' : 'end'}
          trigger={(props) => (
            <IconButton
              {...props}
              size="sm"
              variant="secondary"
              label={`Acciones de la página ${String(pageNumber)}`}
              icon={<Icon icon={MoreHorizontal} size={14} />}
              tabIndex={tabbable ? 0 : -1}
              className={styles.menuButton}
            />
          )}
        >
          {(close) => (
            <PageMenu
              pageNumber={pageNumber}
              pageCount={pageCount}
              lockedReason={lockedReason}
              onMoveTo={(position) => actions.moveTo(pageNumber, position)}
              onInsertBlank={(after) => actions.insertBlank(pageNumber, after)}
              onRemove={() => actions.remove(pageNumber)}
              onOpenInViewer={() => actions.openInViewer(pageNumber)}
              close={close}
            />
          )}
        </Popover>
      </div>
    </div>
  );
});

export function EmptySlot({ side, aspect }: { side: SlotPosition; aspect: number }) {
  return (
    <div className={styles.card} data-side={side} data-empty="">
      <span className={styles.void} style={{ aspectRatio: String(aspect) }} />
    </div>
  );
}
