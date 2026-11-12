import { useId, type CSSProperties, type ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import { GroupField } from './Field';
import styles from './RadioCards.module.css';

export interface RadioCardOption<T extends string> {
  value: T;
  title: ReactNode;
  description?: ReactNode;
  illustration?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps<T extends string> {
  options: readonly RadioCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: ReactNode;
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  name?: string;
  disabled?: boolean;
  columns?: number;
  layout?: 'stacked' | 'row';
  className?: string | undefined;
  fieldClassName?: string | undefined;
}

export function RadioCards<T extends string>({
  options,
  value,
  onChange,
  label,
  labelHidden,
  hint,
  error,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  name,
  disabled = false,
  columns,
  layout = 'stacked',
  className,
  fieldClassName,
}: RadioCardsProps<T>) {
  const autoId = useId();
  const groupName = name ?? autoId;
  const columnCount = columns ?? Math.min(options.length, 3);

  return (
    <GroupField label={label} hint={hint} error={error} labelHidden={labelHidden} className={fieldClassName}>
      {({ labelId, describedBy }) => (
        <div
          role="radiogroup"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy ?? labelId}
          aria-describedby={describedBy}
          className={cx(styles.group, layout === 'row' && styles.rowGroup, className)}
          style={{ '--rc-columns': columnCount } as CSSProperties}
        >
          {options.map((option, index) => {
            const titleId = `${autoId}-t${index}`;
            const descriptionId = `${autoId}-d${index}`;
            const hasDescription = option.description !== undefined && option.description !== null;
            return (
              <label key={option.value} className={cx(styles.card, layout === 'row' && styles.row)}>
                <input
                  type="radio"
                  className={styles.input}
                  name={groupName}
                  value={option.value}
                  checked={option.value === value}
                  disabled={disabled || option.disabled}
                  aria-labelledby={titleId}
                  aria-describedby={hasDescription ? descriptionId : undefined}
                  onChange={() => onChange(option.value)}
                />
                <span className={styles.face}>
                  {option.illustration !== undefined && option.illustration !== null && (
                    <span className={styles.illustration} aria-hidden="true">
                      {option.illustration}
                    </span>
                  )}
                  <span className={styles.body}>
                    <span className={styles.heading}>
                      <span className={styles.mark} aria-hidden="true" />
                      <span id={titleId} className={styles.title}>
                        {option.title}
                      </span>
                    </span>
                    {hasDescription && (
                      <span id={descriptionId} className={styles.description}>
                        {option.description}
                      </span>
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </GroupField>
  );
}
