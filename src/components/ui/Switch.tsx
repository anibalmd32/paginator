import type { ChangeEvent, ComponentProps, ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Switch.module.css';

export interface SwitchProps extends Omit<ComponentProps<'input'>, 'type' | 'role' | 'checked' | 'defaultChecked' | 'onChange' | 'size' | 'children'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  labelFirst?: boolean;
  rootClassName?: string | undefined;
}

export function Switch({ checked, onChange, label, description, labelFirst = false, rootClassName, className, disabled, ...rest }: SwitchProps) {
  const hasText = label !== undefined && label !== null;
  return (
    <label className={cx(styles.root, labelFirst && styles.labelFirst, rootClassName)} data-disabled={disabled ? '' : undefined}>
      <input
        type="checkbox"
        role="switch"
        className={cx(styles.input, className)}
        checked={checked}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
        {...rest}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      {hasText && (
        <span className={styles.text}>
          <span className={styles.label}>{label}</span>
          {description !== undefined && description !== null && <span className={styles.description}>{description}</span>}
        </span>
      )}
    </label>
  );
}
