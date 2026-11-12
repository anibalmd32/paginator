import { CircleAlert } from 'lucide-react';
import { createContext, useContext, useId, useMemo, type ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Field.module.css';
import { Icon } from './Icon';

interface FieldContextValue {
  controlId: string;
  describedBy: string | undefined;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  labelHidden?: boolean;
  inline?: boolean;
  controlId?: string;
  className?: string | undefined;
  children: ReactNode;
}

export function Field({ label, hint, error, labelHidden = false, inline = false, controlId, className, children }: FieldProps) {
  const autoId = useId();
  const id = controlId ?? `${autoId}-control`;
  const hintId = `${autoId}-hint`;
  const errorId = `${autoId}-error`;
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const hasHint = !hasError && hint !== undefined && hint !== null && hint !== false && hint !== '';
  const describedBy = hasError ? errorId : hasHint ? hintId : undefined;

  const context = useMemo<FieldContextValue>(() => ({ controlId: id, describedBy, invalid: hasError }), [id, describedBy, hasError]);

  return (
    <FieldContext.Provider value={context}>
      <div className={cx(styles.field, inline && styles.inline, className)} data-invalid={hasError ? '' : undefined}>
        <label htmlFor={id} className={cx(styles.label, labelHidden && 'visually-hidden')}>
          {label}
        </label>
        <div className={styles.control}>{children}</div>
        {hasHint && (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        )}
        {hasError && (
          <p id={errorId} className={styles.error}>
            <Icon icon={CircleAlert} size={14} />
            <span>{error}</span>
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

export interface FieldControlProps {
  id: string | undefined;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export function useFieldControl(own: { id?: string | undefined; describedBy?: string | undefined; invalid?: boolean | undefined } = {}): FieldControlProps {
  const context = useContext(FieldContext);
  const describedBy = [own.describedBy, context?.describedBy].filter(Boolean).join(' ');
  const invalid = own.invalid ?? context?.invalid ?? false;
  return {
    id: own.id ?? context?.controlId,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': invalid ? true : undefined,
  };
}

export interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  labelHidden?: boolean | undefined;
  inline?: boolean | undefined;
  fieldClassName?: string | undefined;
}

export function FieldShell({ label, hint, error, labelHidden, inline, fieldClassName, children }: FieldShellProps & { children: ReactNode }) {
  if (label === undefined || label === null) return <>{children}</>;
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      {...(labelHidden !== undefined ? { labelHidden } : {})}
      {...(inline !== undefined ? { inline } : {})}
      {...(fieldClassName !== undefined ? { className: fieldClassName } : {})}
    >
      {children}
    </Field>
  );
}

export interface GroupFieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  labelHidden?: boolean | undefined;
  className?: string | undefined;
  children: (ids: { labelId: string | undefined; describedBy: string | undefined }) => ReactNode;
}

export function GroupField({ label, hint, error, labelHidden = false, className, children }: GroupFieldProps) {
  const autoId = useId();
  const hasLabel = label !== undefined && label !== null && label !== false && label !== '';
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const hasHint = !hasError && hint !== undefined && hint !== null && hint !== false && hint !== '';
  const labelId = hasLabel ? `${autoId}-label` : undefined;
  const hintId = `${autoId}-hint`;
  const errorId = `${autoId}-error`;
  const group = children({ labelId, describedBy: hasError ? errorId : hasHint ? hintId : undefined });

  if (!hasLabel && !hasHint && !hasError) return <>{group}</>;
  return (
    <div className={cx(styles.field, className)} data-invalid={hasError ? '' : undefined}>
      {hasLabel && (
        <span id={labelId} className={cx(styles.label, labelHidden && 'visually-hidden')}>
          {label}
        </span>
      )}
      <div className={styles.control}>{group}</div>
      {hasHint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className={styles.error}>
          <Icon icon={CircleAlert} size={14} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
