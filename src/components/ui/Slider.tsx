import type { ChangeEvent, ComponentProps, CSSProperties } from 'react';

import { cx } from '@/lib/utils/cx';

import { FieldShell, useFieldControl, type FieldShellProps } from './Field';
import styles from './Slider.module.css';

export interface SliderProps extends Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'size'>, FieldShellProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  boxClassName?: string | undefined;
}

export function Slider({ label, hint, error, labelHidden, inline, fieldClassName, ...control }: SliderProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} labelHidden={labelHidden} inline={inline} fieldClassName={fieldClassName}>
      <SliderControl {...control} />
    </FieldShell>
  );
}

function SliderControl({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  showValue = false,
  formatValue,
  boxClassName,
  className,
  id,
  'aria-describedby': describedBy,
  ...rest
}: Omit<SliderProps, keyof FieldShellProps>) {
  const control = useFieldControl({ id, describedBy });
  const span = max - min;
  const fraction = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
  const text = formatValue ? formatValue(value) : String(value).replace('.', ',');
  const style = { '--slider-fill': `${(fraction * 100).toFixed(2)}%` } as CSSProperties;

  return (
    <div className={cx(styles.slider, boxClassName)} style={style}>
      <input
        type="range"
        className={cx(styles.range, className)}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={formatValue ? text : undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.valueAsNumber)}
        {...control}
        {...rest}
      />
      {showValue && (
        <output className={styles.value} htmlFor={control.id}>
          {text}
        </output>
      )}
    </div>
  );
}
