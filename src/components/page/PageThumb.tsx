import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { pageRegion, regionKey, selectDerived, useProjectStore } from '@/lib/store';
import type { PageBox } from '@/lib/store';
import type { GuideVisibility, NormRect } from '@/lib/types';

import styles from './PageThumb.module.css';
import { usePageThumbnail } from './usePageThumbnail';

export interface PageThumbProps {
  pageNumber: number;
  box?: PageBox;
  guides?: GuideVisibility | null;
  lazy?: boolean;
  alt?: string;
  className?: string;
}

function insetStyle(inner: NormRect, shown: NormRect): CSSProperties {
  const pct = (value: number) => `${(value * 100).toFixed(3)}%`;
  return {
    left: pct((inner.x - shown.x) / shown.w),
    top: pct((inner.y - shown.y) / shown.h),
    width: pct(inner.w / shown.w),
    height: pct(inner.h / shown.h),
  };
}

export function PageThumb({ pageNumber, box = 'trim', guides = null, lazy = true, alt, className }: PageThumbProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!lazy);

  useEffect(() => {
    if (near) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  const key = useProjectStore((state) => regionKey(pageRegion(pageNumber, box, state)));
  const origin = useProjectStore((state) => selectDerived(state).effectivePages[pageNumber - 1]?.origin ?? null);
  const aspect = useProjectStore((state) => {
    const derived = selectDerived(state);
    const region = pageRegion(pageNumber, box, state);
    const unit = region ? derived.unitsById.get(region.unitId) : undefined;
    if (region && unit && unit.height > 0 && region.rect.h > 0) {
      return (region.rect.w * unit.width) / (region.rect.h * unit.height);
    }
    return derived.trim.widthMm / derived.trim.heightMm;
  });

  const { url, status } = usePageThumbnail(pageNumber, box, near);
  const region = useMemo(() => pageRegion(pageNumber, box), [key, pageNumber, box]);

  const label = alt ?? `Página ${pageNumber}`;
  const classes = [styles.thumb, className].filter(Boolean).join(' ');
  const shown = region?.rect;

  return (
    <div
      ref={ref}
      className={classes}
      style={{ aspectRatio: String(Number.isFinite(aspect) && aspect > 0 ? aspect : 0.707) }}
      data-status={status}
      data-origin={origin ?? undefined}
    >
      {status === 'ready' && url ? (
        <img className={styles.image} src={url} alt={label} draggable={false} decoding="async" />
      ) : null}
      {status === 'blank' ? (
        <span className={styles.note} role="img" aria-label={`${label}: ${origin === 'manual-blank' ? 'blanca' : 'cortesía'}`}>
          {origin === 'manual-blank' ? 'Blanca' : 'Cortesía'}
        </span>
      ) : null}
      {status === 'error' ? (
        <span className={styles.note} role="img" aria-label={`${label}: sin vista previa`}>
          Sin vista previa
        </span>
      ) : null}
      {status === 'loading' ? <span className={styles.loading} aria-hidden="true" /> : null}
      {guides && region && shown ? (
        <span className={styles.guides} aria-hidden="true">
          {guides.bleed && box === 'source' ? (
            <span className={styles.bleed} style={insetStyle(region.geometry.bleed, shown)} />
          ) : null}
          {guides.trim && box !== 'trim' ? (
            <span className={styles.trim} style={insetStyle(region.geometry.trim, shown)} />
          ) : null}
          {guides.safe ? <span className={styles.safe} style={insetStyle(region.geometry.safe, shown)} /> : null}
        </span>
      ) : null}
    </div>
  );
}
