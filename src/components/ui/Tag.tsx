import type { ComponentProps, CSSProperties, ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';
import { COVER_STOCK, signatureStock } from '@/styles/stock';

import styles from './Tag.module.css';

export interface TagProps extends ComponentProps<'span'> {
  signature?: number;
  cover?: boolean;
  icon?: ReactNode;
  size?: 'sm' | 'md';
}

export function Tag({ signature, cover = false, icon, size = 'md', className, style, children, ...rest }: TagProps) {
  const stock = cover ? COVER_STOCK : signature !== undefined ? signatureStock(signature) : null;
  const paint = stock ? ({ '--tag-bg': stock.cssVar, '--tag-ink': stock.inkVar } as CSSProperties) : null;
  return (
    <span
      className={cx(styles.tag, stock && styles.stock, size === 'sm' && styles.sm, className)}
      style={paint ? { ...paint, ...style } : style}
      {...rest}
    >
      {icon}
      <span className={styles.text}>{children}</span>
    </span>
  );
}
