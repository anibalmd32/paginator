import { useEffect, useRef, type ChangeEvent, type ComponentProps, type ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Checkbox.module.css';
import { mergeRefs } from './refs';

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'checked' | 'defaultChecked' | 'onChange' | 'size' | 'children'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
  rootClassName?: string | undefined;
}

export function Checkbox({ checked, onChange, label, description, indeterminate = false, rootClassName, className, disabled, ref, ...rest }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const hasText = label !== undefined && label !== null;
  return (
    <label className={cx(styles.root, rootClassName)} data-disabled={disabled ? '' : undefined}>
      <input
        ref={mergeRefs(inputRef, ref)}
        type="checkbox"
        className={cx(styles.input, className)}
        checked={checked}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
        {...rest}
      />
      <span className={styles.box} aria-hidden="true">
        <svg className={styles.check} width="12" height="12" viewBox="0 0 12 12" fill="none" focusable="false">
          <path d="M2.5 6.25 5 8.75l4.5-5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg className={styles.dash} width="12" height="12" viewBox="0 0 12 12" fill="none" focusable="false">
          <path d="M3 6h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
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
