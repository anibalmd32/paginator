import { CircleAlert } from 'lucide-react';
import type { CSSProperties, FocusEvent, KeyboardEvent, PointerEvent } from 'react';

import { Icon } from '@/components/ui';
import type { SheetImposition, SheetSide } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { SLOT_TEXT, type SheetDensity, type SlotKind } from './setupModel';
import styles from './SheetSchematic.module.css';

export interface SheetSchematicProps {
  sheet: SheetImposition;
  kindOf: (page: number) => SlotKind;
  pageAspect: number;
  density: SheetDensity;
  rtl: boolean;
  showRole: boolean;
  stockFill: string;
  stockInk: string;
  highlighted: boolean;
  highlightedPage: number | null;
  ariaLabel: string;
  tabIndex: number;
  onHoverPage: (page: number | null, sheetIndex: number) => void;
  onFocus: (event: FocusEvent<HTMLLIElement>) => void;
  onBlur: (event: FocusEvent<HTMLLIElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void;
}

export function SheetSchematic({
  sheet,
  kindOf,
  pageAspect,
  density,
  rtl,
  showRole,
  stockFill,
  stockInk,
  highlighted,
  highlightedPage,
  ariaLabel,
  tabIndex,
  onHoverPage,
  onFocus,
  onBlur,
  onKeyDown,
}: SheetSchematicProps) {
  const style = {
    '--page-aspect': pageAspect,
    '--stock-fill': stockFill,
    '--stock-ink': stockInk,
  } as CSSProperties;

  const face = (label: string, side: SheetSide) => (
    <div className={styles.faceRow}>
      <span className={styles.faceLabel}>{label}</span>
      <div className={styles.face}>
        <Slot page={side.left} position="left" kind={kindOf(side.left)} highlighted={highlightedPage === side.left} sheetIndex={sheet.index} onHoverPage={onHoverPage} />
        <Slot page={side.right} position="right" kind={kindOf(side.right)} highlighted={highlightedPage === side.right} sheetIndex={sheet.index} onHoverPage={onHoverPage} />
      </div>
    </div>
  );

  return (
    <li
      className={cx(styles.sheet, styles[density])}
      style={style}
      dir={rtl ? 'rtl' : 'ltr'}
      data-highlighted={highlighted ? '' : undefined}
      data-wide={pageAspect > 1 ? '' : undefined}
      data-sheet={sheet.index}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onPointerLeave={() => onHoverPage(null, sheet.index)}
    >
      <div className={styles.head} aria-hidden="true">
        <span className={styles.role}>{showRole && sheet.role === 'cover' ? 'cubierta' : null}</span>
        <span className={styles.tab}>
          <span key={sheet.number} className={styles.numeral}>
            {sheet.number}
          </span>
        </span>
      </div>
      <div className={styles.faces} aria-hidden="true">
        {face('cara', sheet.front)}
        {face('retiro', sheet.back)}
      </div>
    </li>
  );
}

interface SlotProps {
  page: number;
  position: 'left' | 'right';
  kind: SlotKind;
  highlighted: boolean;
  sheetIndex: number;
  onHoverPage: (page: number | null, sheetIndex: number) => void;
}

function Slot({ page, position, kind, highlighted, sheetIndex, onHoverPage }: SlotProps) {
  const onPointerEnter = (event: PointerEvent<HTMLSpanElement>): void => {
    if (event.pointerType !== 'touch') onHoverPage(page, sheetIndex);
  };
  return (
    <span className={styles.slot} data-position={position} data-kind={kind} data-highlighted={highlighted ? '' : undefined} onPointerEnter={onPointerEnter}>
      <span key={page} className={styles.folio}>
        {page}
      </span>
      {kind !== 'page' && (
        <span className={styles.note}>
          {kind === 'missing' && <Icon icon={CircleAlert} size={12} />}
          {SLOT_TEXT[kind]}
        </span>
      )}
    </span>
  );
}
