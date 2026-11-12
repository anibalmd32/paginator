import type { ComponentProps, MouseEvent, ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Button.module.css';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  loading?: boolean;
  block?: boolean;
  pressed?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  iconStart,
  iconEnd,
  loading = false,
  block = false,
  pressed,
  className,
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true') {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], styles[size], block && styles.block, className)}
      data-loading={loading ? '' : undefined}
      aria-busy={loading ? true : undefined}
      aria-disabled={loading ? true : undefined}
      aria-pressed={pressed}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 14 : 16} /> : iconStart}
      {children !== undefined && children !== null && <span className={styles.label}>{children}</span>}
      {iconEnd}
    </button>
  );
}

export interface ButtonGroupProps extends ComponentProps<'div'> {
  attached?: boolean;
}

export function ButtonGroup({ attached = false, className, role = 'group', ...rest }: ButtonGroupProps) {
  return <div role={role} className={cx(styles.group, attached && styles.attached, className)} {...rest} />;
}
