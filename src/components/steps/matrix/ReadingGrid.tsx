import { memo } from 'react';

import type { Derived } from '@/lib/store';
import type { MagazineConfig, Spread } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { buildSlot, readingPartner, type SlotModel } from './matrixModel';
import { PageSlot } from './PageSlot';
import styles from './ReadingGrid.module.css';

export interface ReadingGridProps {
  derived: Derived;
  config: Pick<MagazineConfig, 'autoPadBlanks'>;
  spreads: readonly Spread[];
  visibleSheets: ReadonlySet<number> | null;
  onSelect: (slot: SlotModel) => void;
  onOpen3d: (page: number) => void;
}

function spreadLabel(spread: Spread, pageCount: number): string {
  if (spread.index === 0) return 'Portada';
  if (spread.index * 2 >= pageCount) return 'Contraportada';
  const pages = [spread.left, spread.right].filter((page): page is number => page !== null).sort((a, b) => a - b);
  return `Págs. ${pages.join('–')}`;
}

export const ReadingGrid = memo(function ReadingGrid({ derived, config, spreads, visibleSheets, onSelect, onOpen3d }: ReadingGridProps) {
  const { imposition, pageCount } = derived;

  const slotFor = (page: number): SlotModel | null => {
    const placement = imposition.placements[page - 1];
    const sheet = placement ? imposition.sheets[placement.sheetIndex] : undefined;
    if (!placement || !sheet) return null;
    return buildSlot(derived, config, sheet, placement.face, placement.position);
  };

  const shown = visibleSheets
    ? spreads.filter((spread) =>
        [spread.left, spread.right].some((page) => page !== null && visibleSheets.has(imposition.placements[page - 1]?.sheetIndex ?? -1)),
      )
    : spreads;

  return (
    <ol className={styles.grid}>
      {shown.map((spread) => {
        const left = spread.left !== null ? slotFor(spread.left) : null;
        const right = spread.right !== null ? slotFor(spread.right) : null;
        const pages = [spread.left, spread.right].filter((page): page is number => page !== null);
        return (
          <li
            key={spread.index}
            className={cx(styles.spread, (!left || !right) && styles.single)}
            data-spread={spread.index}
            data-first-page={Math.min(...pages)}
            data-last-page={Math.max(...pages)}
          >
            <p className={styles.label}>{spreadLabel(spread, pageCount)}</p>
            <div className={styles.pair}>
              <div className={styles.side}>
                {left ? <PageSlot slot={left} partner={readingPartner(left.page, pageCount)} variant="reading" side="left" onSelect={onSelect} onOpen3d={onOpen3d} /> : null}
              </div>
              <span className={styles.spine} aria-hidden="true" />
              <div className={styles.side}>
                {right ? <PageSlot slot={right} partner={readingPartner(right.page, pageCount)} variant="reading" side="right" onSelect={onSelect} onOpen3d={onOpen3d} /> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
});
