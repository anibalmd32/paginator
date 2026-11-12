import type { ComponentProps } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Spinner.module.css';

export interface SpinnerProps extends Omit<ComponentProps<'span'>, 'children'> {
  size?: number;
  label?: string;
}

export function Spinner({ size = 16, label, className, ...rest }: SpinnerProps) {
  const a11y = label ? ({ role: 'status', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);
  return (
    <span className={cx(styles.spinner, className)} {...a11y} {...rest}>
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" focusable="false" aria-hidden="true">
        <circle className={styles.track} cx="8" cy="8" r="6.25" strokeWidth="1.75" />
        <path className={styles.arc} d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </span>
  );
}
