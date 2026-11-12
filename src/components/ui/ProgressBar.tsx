import type { ComponentProps, CSSProperties, ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './ProgressBar.module.css';

export interface ProgressBarProps extends Omit<ComponentProps<'div'>, 'children'> {
  value: number | null;
  label?: ReactNode;
  valueText?: string | false;
  tone?: 'petrol' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md';
}

export function ProgressBar({ value, label, valueText, tone = 'petrol', size = 'md', className, style, 'aria-label': ariaLabel, ...rest }: ProgressBarProps) {
  const fraction = value === null ? null : Math.min(1, Math.max(0, value));
  const percent = fraction === null ? null : Math.round(fraction * 100);
  const text = valueText === false ? null : (valueText ?? (percent === null ? null : `${percent} %`));
  const hasLabel = label !== undefined && label !== null && label !== false;
  const fill = { '--progress': fraction === null ? '0' : String(fraction) } as CSSProperties;

  return (
    <div className={cx(styles.root, styles[tone], size === 'sm' && styles.sm, className)} style={{ ...fill, ...style }} {...rest}>
      {(hasLabel || text) && (
        <div className={styles.meta}>
          {hasLabel && <span className={styles.label}>{label}</span>}
          {text && <span className={styles.value}>{text}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={hasLabel && typeof label === 'string' ? label : ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={text ?? undefined}
        aria-busy={fraction === null || fraction < 1 ? true : undefined}
        className={styles.track}
        data-indeterminate={fraction === null ? '' : undefined}
      >
        <span className={styles.fill} />
      </div>
    </div>
  );
}
