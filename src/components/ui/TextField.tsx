import type { ChangeEvent, ComponentProps, ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import { FieldShell, useFieldControl, type FieldShellProps } from './Field';
import styles from './Input.module.css';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'size' | 'prefix'>, FieldShellProps {
  size?: 'sm' | 'md';
  onValueChange?: (value: string) => void;
  prefix?: ReactNode;
  suffix?: ReactNode;
  invalid?: boolean;
  boxClassName?: string | undefined;
}

export function TextField({
  label,
  hint,
  error,
  labelHidden,
  inline,
  fieldClassName,
  size = 'md',
  onValueChange,
  onChange,
  prefix,
  suffix,
  invalid,
  boxClassName,
  className,
  type = 'text',
  ...rest
}: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} labelHidden={labelHidden} inline={inline} fieldClassName={fieldClassName}>
      <TextFieldControl
        size={size}
        prefix={prefix}
        suffix={suffix}
        invalid={invalid ?? (label === undefined && Boolean(error) ? true : undefined)}
        boxClassName={boxClassName}
        className={className}
        type={type}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange?.(event);
          onValueChange?.(event.target.value);
        }}
        {...rest}
      />
    </FieldShell>
  );
}

type ControlProps = Omit<ComponentProps<'input'>, 'size' | 'prefix' | 'className'> & {
  size: 'sm' | 'md';
  prefix: ReactNode;
  suffix: ReactNode;
  invalid: boolean | undefined;
  boxClassName: string | undefined;
  className: string | undefined;
};

function TextFieldControl({ size, prefix, suffix, invalid, boxClassName, className, id, disabled, readOnly, 'aria-describedby': describedBy, ...rest }: ControlProps) {
  const control = useFieldControl({ id, describedBy, invalid });
  return (
    <div
      className={cx(styles.box, size === 'sm' && styles.sm, boxClassName)}
      data-invalid={control['aria-invalid'] ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-readonly={readOnly ? '' : undefined}
    >
      {prefix !== undefined && prefix !== null && <span className={cx(styles.affix, styles.prefix)}>{prefix}</span>}
      <input className={cx(styles.input, className)} disabled={disabled} readOnly={readOnly} {...control} {...rest} />
      {suffix !== undefined && suffix !== null && <span className={cx(styles.affix, styles.suffix)}>{suffix}</span>}
    </div>
  );
}
