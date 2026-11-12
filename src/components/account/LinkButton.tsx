import type { ComponentProps, ReactNode } from 'react';

import buttonStyles from '@/components/ui/Button.module.css';
import type { ButtonSize, ButtonVariant } from '@/components/ui';
import { cx } from '@/lib/utils/cx';

import styles from './LinkButton.module.css';

export interface LinkButtonProps extends ComponentProps<'a'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconStart?: ReactNode;
}

export function LinkButton({ variant = 'secondary', size = 'md', iconStart, className, children, ...rest }: LinkButtonProps) {
  return (
    <a className={cx(buttonStyles.button, buttonStyles[variant], buttonStyles[size], styles.link, className)} {...rest}>
      {iconStart}
      <span className={buttonStyles.label}>{children}</span>
    </a>
  );
}
