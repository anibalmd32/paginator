import type { ComponentProps, CSSProperties } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Skeleton.module.css';

export interface SkeletonProps extends Omit<ComponentProps<'span'>, 'children'> {
  width?: string | number;
  height?: string | number;
  aspectRatio?: number;
  lines?: number;
  shape?: 'text' | 'block';
}

const toCss = (value: string | number | undefined): string | undefined => (typeof value === 'number' ? `${value}px` : value);

export function Skeleton({ width, height, aspectRatio, lines, shape = 'text', className, style, ...rest }: SkeletonProps) {
  const size: CSSProperties = {};
  const w = toCss(width);
  const h = toCss(height);
  if (w !== undefined) size.width = w;
  if (aspectRatio !== undefined) size.aspectRatio = String(aspectRatio);
  else if (h !== undefined) size.height = h;

  if (lines !== undefined && lines > 1) {
    return (
      <span className={cx(styles.lines, className)} style={{ ...size, ...style }} aria-hidden="true" {...rest}>
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} className={cx(styles.skeleton, styles.text)} style={index === lines - 1 ? { width: '62%' } : undefined} />
        ))}
      </span>
    );
  }
  return <span className={cx(styles.skeleton, shape === 'text' ? styles.text : styles.block, className)} style={{ ...size, ...style }} aria-hidden="true" {...rest} />;
}
