import { ChevronDown } from 'lucide-react';
import type { ChangeEvent, ComponentProps } from 'react';

import { cx } from '@/lib/utils/cx';

import { FieldShell, useFieldControl, type FieldShellProps } from './Field';
import { Icon } from './Icon';
import styles from './Input.module.css';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectOptionGroup<T extends string = string> {
  group: string;
  options: readonly SelectOption<T>[];
}

export interface SelectProps<T extends string = string> extends Omit<ComponentProps<'select'>, 'size' | 'value' | 'defaultValue'>, FieldShellProps {
  value?: T;
  defaultValue?: T;
  options?: readonly (SelectOption<T> | SelectOptionGroup<T>)[];
  onValueChange?: (value: T) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  invalid?: boolean;
  boxClassName?: string | undefined;
}

export function Select<T extends string = string>({ label, hint, error, labelHidden, inline, fieldClassName, invalid, ...control }: SelectProps<T>) {
  return (
    <FieldShell label={label} hint={hint} error={error} labelHidden={labelHidden} inline={inline} fieldClassName={fieldClassName}>
      <SelectControl<T> invalid={invalid ?? (label === undefined && Boolean(error) ? true : undefined)} {...control} />
    </FieldShell>
  );
}

type ControlProps<T extends string> = Omit<SelectProps<T>, keyof FieldShellProps | 'invalid'> & { invalid: boolean | undefined };

function renderOption<T extends string>(option: SelectOption<T>) {
  return (
    <option key={option.value} value={option.value} disabled={option.disabled}>
      {option.label}
    </option>
  );
}

function SelectControl<T extends string>({
  options,
  onValueChange,
  onChange,
  placeholder,
  size = 'md',
  invalid,
  boxClassName,
  className,
  id,
  disabled,
  children,
  'aria-describedby': describedBy,
  ...rest
}: ControlProps<T>) {
  const control = useFieldControl({ id, describedBy, invalid });
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onChange?.(event);
    onValueChange?.(event.target.value as T);
  };
  return (
    <div className={cx(styles.box, size === 'sm' && styles.sm, boxClassName)} data-invalid={control['aria-invalid'] ? '' : undefined} data-disabled={disabled ? '' : undefined}>
      <select className={cx(styles.input, styles.select, className)} disabled={disabled} onChange={handleChange} {...control} {...rest}>
        {placeholder !== undefined && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {options?.map((entry) =>
          'group' in entry ? (
            <optgroup key={entry.group} label={entry.group}>
              {entry.options.map(renderOption)}
            </optgroup>
          ) : (
            renderOption(entry)
          ),
        )}
        {children}
      </select>
      <Icon icon={ChevronDown} size={14} className={styles.chevron} />
    </div>
  );
}
