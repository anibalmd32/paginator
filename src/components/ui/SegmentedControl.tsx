import { useId, type ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import { GroupField } from './Field';
import styles from './SegmentedControl.module.css';
import { Tooltip } from './Tooltip';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  hint?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  label?: ReactNode;
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  name?: string;
  disabled?: boolean;
  block?: boolean;
  iconOnly?: boolean;
  className?: string | undefined;
  fieldClassName?: string | undefined;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  label,
  labelHidden,
  hint,
  error,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  name,
  disabled = false,
  block = false,
  iconOnly = false,
  className,
  fieldClassName,
}: SegmentedControlProps<T>) {
  const autoName = useId();
  const groupName = name ?? autoName;

  return (
    <GroupField label={label} hint={hint} error={error} labelHidden={labelHidden} className={fieldClassName}>
      {({ labelId, describedBy }) => (
        <div
          role="radiogroup"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy ?? labelId}
          aria-describedby={describedBy}
          aria-disabled={disabled ? true : undefined}
          className={cx(styles.group, size === 'sm' && styles.sm, block && styles.block, className)}
        >
          {options.map((option) => {
            const textLabel = option.ariaLabel ?? (typeof option.label === 'string' ? option.label : undefined);
            const segment = (
              <label className={cx(styles.option, iconOnly && styles.iconOnly)}>
                <input
                  type="radio"
                  className={styles.input}
                  name={groupName}
                  value={option.value}
                  checked={option.value === value}
                  disabled={disabled || option.disabled}
                  aria-label={iconOnly ? textLabel : option.ariaLabel}
                  onChange={() => onChange(option.value)}
                />
                <span className={styles.face}>
                  {option.icon}
                  {!iconOnly && <span className={styles.text}>{option.label}</span>}
                </span>
              </label>
            );
            const tip = option.hint ?? (iconOnly ? textLabel : undefined);
            return (
              <Tooltip key={option.value} content={tip} placement="bottom" semantics={option.hint ? 'description' : 'label'}>
                {segment}
              </Tooltip>
            );
          })}
        </div>
      )}
    </GroupField>
  );
}
