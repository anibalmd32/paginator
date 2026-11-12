import { CircleAlert, CircleCheck, CircleDashed, Info, TriangleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import { Icon, type IconComponent } from './Icon';
import styles from './StatusBadge.module.css';

export type StatusTone = 'error' | 'warning' | 'info' | 'success' | 'neutral';

const ICON: Record<StatusTone, IconComponent> = {
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
  success: CircleCheck,
  neutral: CircleDashed,
};

const DEFAULT_TEXT: Record<StatusTone, string> = {
  error: 'Error',
  warning: 'Aviso',
  info: 'Nota',
  success: 'Conforme',
  neutral: 'Sin comprobar',
};

export interface StatusBadgeProps extends Omit<ComponentProps<'span'>, 'children'> {
  tone: StatusTone;
  children?: ReactNode;
  emphasis?: 'soft' | 'solid';
  size?: 'sm' | 'md';
  icon?: IconComponent;
}

export function StatusBadge({ tone, children, emphasis = 'soft', size = 'md', icon, className, ...rest }: StatusBadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], emphasis === 'solid' && styles.solid, size === 'sm' && styles.sm, className)} {...rest}>
      <Icon icon={icon ?? ICON[tone]} size={size === 'sm' ? 12 : 14} className={styles.icon} />
      <span className={styles.text}>{children ?? DEFAULT_TEXT[tone]}</span>
    </span>
  );
}
