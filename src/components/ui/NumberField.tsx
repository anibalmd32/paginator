import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type ComponentProps, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import { FieldShell, useFieldControl, type FieldShellProps } from './Field';
import { Icon } from './Icon';
import styles from './Input.module.css';
import { mergeRefs } from './refs';
import { clampNumber, formatDecimal, parseDecimal, stepDecimals, stepNumber } from './numberFormat';

type NativeInputProps = Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'size' | 'min' | 'max' | 'step' | 'type' | 'prefix'>;

export interface NumberFieldProps extends NativeInputProps, FieldShellProps {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  unit?: ReactNode;
  allowEmpty?: boolean;
  size?: 'sm' | 'md';
  hideSteppers?: boolean;
  invalid?: boolean;
  boxClassName?: string | undefined;
}

export function NumberField({ label, hint, error, labelHidden, inline, fieldClassName, invalid, ...control }: NumberFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} labelHidden={labelHidden} inline={inline} fieldClassName={fieldClassName}>
      <NumberFieldControl invalid={invalid ?? (label === undefined && Boolean(error) ? true : undefined)} {...control} />
    </FieldShell>
  );
}

type ControlProps = Omit<NumberFieldProps, keyof FieldShellProps | 'invalid'> & { invalid: boolean | undefined };

function NumberFieldControl({
  value,
  onChange,
  min,
  max,
  step = 1,
  decimals,
  unit,
  allowEmpty = false,
  size = 'md',
  hideSteppers = false,
  invalid,
  boxClassName,
  className,
  id,
  ref,
  disabled,
  readOnly,
  onKeyDown,
  onFocus,
  onBlur,
  'aria-describedby': describedBy,
  ...rest
}: ControlProps) {
  const precision = decimals ?? stepDecimals(step);
  const format = (number: number | null): string => (number === null ? '' : formatDecimal(number, precision));

  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const control = useFieldControl({ id, describedBy, invalid });
  const bounds = { min, max };
  const locked = Boolean(disabled) || Boolean(readOnly);

  const lastSent = useRef<number | null>(value);
  useEffect(() => {
    if (draft !== null && value !== lastSent.current) setDraft(null);
    lastSent.current = value;
  }, [value, draft]);

  const emit = (next: number | null): void => {
    lastSent.current = next;
    if (next !== value) onChange(next);
  };

  const normalise = (number: number): number => clampNumber(Number.parseFloat(number.toFixed(precision)), bounds);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const text = event.target.value;
    setDraft(text);
    if (text.trim() === '') {
      if (allowEmpty) emit(null);
      return;
    }
    const parsed = parseDecimal(text);
    if (parsed !== null && clampNumber(parsed, bounds) === parsed) emit(Number.parseFloat(parsed.toFixed(precision)));
  };

  const commit = (): void => {
    if (draft === null) return;
    const parsed = parseDecimal(draft);
    if (parsed !== null) emit(normalise(parsed));
    else if (draft.trim() === '' && allowEmpty) emit(null);
    setDraft(null);
  };

  const nudge = (steps: number): void => {
    if (locked) return;
    const current = (draft !== null ? parseDecimal(draft) : null) ?? value ?? clampNumber(0, bounds);
    emit(stepNumber(current, steps, step, bounds));
    setDraft(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented || locked) return;
    const big = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case 'ArrowUp':
        nudge(big);
        break;
      case 'ArrowDown':
        nudge(-big);
        break;
      case 'PageUp':
        nudge(10);
        break;
      case 'PageDown':
        nudge(-10);
        break;
      case 'Home':
        if (min === undefined) return;
        emit(min);
        setDraft(null);
        break;
      case 'End':
        if (max === undefined) return;
        emit(max);
        setDraft(null);
        break;
      case 'Enter':
        commit();
        return;
      case 'Escape':
        if (draft === null) return;
        setDraft(null);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>): void => {
    onFocus?.(event);
    event.target.select();
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    commit();
    onBlur?.(event);
  };

  const shown = draft ?? format(value);
  const atMin = value !== null && min !== undefined && value <= min;
  const atMax = value !== null && max !== undefined && value >= max;
  const draftInvalid = draft !== null && draft.trim() !== '' && (parseDecimal(draft) === null || clampNumber(parseDecimal(draft) ?? 0, bounds) !== parseDecimal(draft));

  return (
    <div
      className={cx(styles.box, size === 'sm' && styles.sm, boxClassName)}
      data-invalid={control['aria-invalid'] || draftInvalid ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-readonly={readOnly ? '' : undefined}
    >
      <input
        ref={mergeRefs(inputRef, ref)}
        type="text"
        inputMode={precision > 0 ? 'decimal' : 'numeric'}
        role="spinbutton"
        autoComplete="off"
        spellCheck={false}
        className={cx(styles.input, styles.numeric, className)}
        value={shown}
        disabled={disabled}
        readOnly={readOnly}
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={value === null ? undefined : typeof unit === 'string' ? `${format(value)} ${unit}` : format(value)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...control}
        aria-invalid={control['aria-invalid'] || draftInvalid ? true : undefined}
        {...rest}
      />
      {unit !== undefined && unit !== null && <span className={cx(styles.affix, styles.suffix)}>{unit}</span>}
      {!hideSteppers && (
        <span className={styles.steppers}>
          <button type="button" tabIndex={-1} aria-hidden="true" className={styles.step} disabled={locked || atMax} onPointerDown={(event) => event.preventDefault()} onClick={() => { inputRef.current?.focus(); nudge(1); }}>
            <Icon icon={ChevronUp} size={12} />
          </button>
          <button type="button" tabIndex={-1} aria-hidden="true" className={styles.step} disabled={locked || atMin} onPointerDown={(event) => event.preventDefault()} onClick={() => { inputRef.current?.focus(); nudge(-1); }}>
            <Icon icon={ChevronDown} size={12} />
          </button>
        </span>
      )}
    </div>
  );
}
