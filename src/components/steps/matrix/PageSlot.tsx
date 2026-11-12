import { Box, Flag } from 'lucide-react';
import { memo, type CSSProperties } from 'react';

import { PageThumb } from '@/components/page/PageThumb';
import { physicalSlotParts, physicalSlotText, SEVERITY_LABEL, slotPositionShort } from '@/components/report/labels';
import { Icon, Tooltip } from '@/components/ui';
import { useProjectStore } from '@/lib/store';
import { cx } from '@/lib/utils/cx';

import type { SlotModel } from './matrixModel';
import { useMatrixUi } from './matrixUi';
import styles from './PageSlot.module.css';

export interface PageSlotProps {
  slot: SlotModel;
  partner: number | null;
  variant: 'sheet' | 'reading';
  side: 'left' | 'right';
  onSelect: (slot: SlotModel) => void;
  onOpen3d: (page: number) => void;
}

function slotAriaLabel(slot: SlotModel): string {
  const parts = [`Página ${slot.page}`, `casilla ${slot.letter}`, physicalSlotText(slot.sheetNumber, slot.face, slot.position).toLowerCase()];
  if (slot.open) parts.push('hueco abierto: falta una página para cerrar el pliego');
  else if (slot.origin === 'auto-blank') parts.push('cortesía');
  else if (slot.origin === 'manual-blank') parts.push('blanca');
  for (const issue of slot.issues) parts.push(`${SEVERITY_LABEL[issue.severity].one}: ${issue.title}`);
  return parts.join(', ');
}

export const PageSlot = memo(function PageSlot({ slot, partner, variant, side, onSelect, onOpen3d }: PageSlotProps) {
  const { page } = slot;
  const selected = useMatrixUi((state) => state.selectedPage === page);
  const tabbable = useMatrixUi((state) => state.tabbablePage === page);
  const located = useMatrixUi((state) => state.locate?.page === page);
  const hover = useProjectStore((state) => (state.hover.page === page ? 'self' : partner !== null && state.hover.page === partner ? 'partner' : null));
  const setHover = useProjectStore((state) => state.setHover);

  const [physicalSheet, physicalPlace] = physicalSlotParts(slot.sheetNumber, slot.face, slot.position);

  const hoverOn = (): void => setHover({ page, sheet: slot.sheetIndex });
  const hoverOff = (): void => setHover({ page: null, sheet: null });

  const flag = slot.worst ? (
    <Tooltip
      content={
        <span className={styles.tip}>
          {slot.issues.map((issue) => (
            <span key={issue.id}>{issue.title}</span>
          ))}
        </span>
      }
      placement="top"
    >
      <span className={cx(styles.flag, styles[`flag-${slot.worst}`])}>
        <Icon icon={Flag} size={14} />
        <span className="visually-hidden">{SEVERITY_LABEL[slot.worst].one}</span>
      </span>
    </Tooltip>
  ) : null;

  return (
    <div
      className={cx(styles.slot, styles[variant], styles[side])}
      data-selected={selected ? '' : undefined}
      data-hover={hover ?? undefined}
      data-located={located ? '' : undefined}
      data-open={slot.open ? '' : undefined}
      data-tone={slot.worst}
      style={{ '--slot-page': page } as CSSProperties}
    >
      <div
        role="button"
        tabIndex={tabbable ? 0 : -1}
        className={styles.hit}
        data-cell=""
        data-page={page}
        data-sheet={slot.sheetIndex}
        data-face={slot.face}
        aria-label={slotAriaLabel(slot)}
        aria-current={selected ? 'true' : undefined}
        aria-keyshortcuts="Enter V D"
        onClick={() => onSelect(slot)}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') hoverOn();
        }}
        onPointerLeave={hoverOff}
        onFocus={hoverOn}
        onBlur={hoverOff}
      >
        <span className={styles.labels}>
          <span className={styles.lead}>
            <span className={styles.number}>{page}</span>
            {flag}
          </span>
          {variant === 'sheet' ? (
            <span className={styles.where}>
              <span className={styles.letter}>{slot.letter}</span>
              <span className={styles.position}>{slotPositionShort(slot.face, slot.position)}</span>
            </span>
          ) : (
            <span className={styles.physical}>
              <span>{physicalSheet}</span>
              <span>{physicalPlace}</span>
            </span>
          )}
        </span>
        <span className={styles.paper}>
          {slot.open ? (
            <span className={styles.openSlot}>
              <span>Sin página</span>
            </span>
          ) : (
            <PageThumb pageNumber={page} className={styles.thumb ?? ''} />
          )}
        </span>
      </div>
      <button
        type="button"
        tabIndex={-1}
        className={styles.open3d}
        aria-label={`Ver la página ${page} en 3D`}
        title={`Ver la página ${page} en 3D (V)`}
        onClick={() => onOpen3d(page)}
      >
        <Icon icon={Box} size={14} />
      </button>
    </div>
  );
});
