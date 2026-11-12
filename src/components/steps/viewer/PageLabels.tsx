import { Flag } from 'lucide-react';
import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';

import { Icon } from '@/components/ui';
import type { Derived, HoverState } from '@/lib/store';
import type { IssueSeverity } from '@/lib/types';
import { cx } from '@/lib/utils/cx';
import type { PageAnchor, ViewerAnchors } from '@/lib/viewer';

import { originNote, placementText } from './labels';
import styles from './ViewerStep.module.css';

export interface PageLabelsHandle {
  update(anchors: ViewerAnchors): void;
}

export interface PageLabelsProps {
  derived: Derived;
  hover: HoverState;
  visible: boolean;
  bottomInset: number;
  ref?: Ref<PageLabelsHandle>;
}

const SEVERITY_TEXT: Record<IssueSeverity, string> = { error: 'con errores', warning: 'con avisos', info: 'con notas' };
const GAP = 8;

interface Pair {
  left: number | null;
  right: number | null;
}

export function PageLabels({ derived, hover, visible, bottomInset, ref }: PageLabelsProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const anchorsRef = useRef<ViewerAnchors>({ left: null, right: null });
  const insetRef = useRef(bottomInset);
  const [pair, setPair] = useState<Pair>({ left: null, right: null });

  insetRef.current = bottomInset;

  const place = (element: HTMLDivElement | null, anchor: PageAnchor | null): void => {
    if (!element) return;
    if (!anchor || !anchor.visible) {
      element.style.visibility = 'hidden';
      return;
    }
    const host = element.offsetParent as HTMLElement | null;
    const limit = host ? host.clientHeight - insetRef.current - element.offsetHeight - GAP : Number.POSITIVE_INFINITY;
    const y = Math.min(anchor.y + GAP, limit);
    element.style.visibility = 'visible';
    element.style.transform = `translate3d(${Math.round(anchor.x)}px, ${Math.round(y)}px, 0)`;
  };

  const apply = (): void => {
    place(leftRef.current, anchorsRef.current.left);
    place(rightRef.current, anchorsRef.current.right);
  };

  useImperativeHandle(ref, () => ({
    update(anchors) {
      anchorsRef.current = anchors;
      apply();
      const next: Pair = { left: anchors.left?.pageNumber ?? null, right: anchors.right?.pageNumber ?? null };
      setPair((previous) => (previous.left === next.left && previous.right === next.right ? previous : next));
    },
  }));

  useLayoutEffect(apply);

  const renderLabel = (pageNumber: number | null, side: 'left' | 'right') => {
    if (pageNumber === null) return null;
    const placement = derived.imposition.placements[pageNumber - 1];
    const severity = derived.worstByPage.get(pageNumber);
    const note = originNote(derived.effectivePages[pageNumber - 1]?.origin ?? null);
    const highlighted = hover.page === pageNumber || (placement !== undefined && hover.sheet === placement.sheetIndex);
    return (
      <div className={cx(styles.pageLabel, side === 'right' && styles.pageLabelRight)} data-highlighted={highlighted ? '' : undefined}>
        <span className={styles.pageLabelFolio}>{pageNumber}</span>
        <span className={styles.pageLabelSlot}>
          {placementText(derived.imposition, pageNumber)}
          {note && <span className={styles.pageLabelNote}> · {note}</span>}
        </span>
        {severity && (
          <span className={cx(styles.pageLabelFlag, styles[`flag-${severity}`])}>
            <Icon icon={Flag} size={12} />
            <span className="visually-hidden">{SEVERITY_TEXT[severity]}</span>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={styles.pageLabels} hidden={!visible} aria-hidden="true">
      <div ref={leftRef} className={styles.pageLabelAnchor}>
        {renderLabel(pair.left, 'left')}
      </div>
      <div ref={rightRef} className={styles.pageLabelAnchor}>
        {renderLabel(pair.right, 'right')}
      </div>
    </div>
  );
}
