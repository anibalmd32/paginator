import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Callout.module.css';
import { Icon, type IconComponent } from './Icon';
import { IconButton } from './IconButton';

export type CalloutTone = 'info' | 'warning' | 'error' | 'success';

export const TONE_ICON: Record<CalloutTone, IconComponent> = {
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  success: CircleCheck,
};

export interface CalloutProps extends Omit<ComponentProps<'div'>, 'title'> {
  tone?: CalloutTone;
  title?: ReactNode;
  action?: ReactNode;
  icon?: IconComponent;
  onDismiss?: () => void;
  live?: boolean;
  compact?: boolean;
}

export function Callout({ tone = 'info', title, action, icon, onDismiss, live = false, compact = false, className, children, ...rest }: CalloutProps) {
  const role = live ? (tone === 'error' ? 'alert' : 'status') : undefined;
  const hasTitle = title !== undefined && title !== null && title !== false;
  const hasBody = children !== undefined && children !== null && children !== false;
  const hasAction = action !== undefined && action !== null && action !== false;
  return (
    <div role={role} className={cx(styles.callout, styles[tone], compact && styles.compact, className)} {...rest}>
      <Icon icon={icon ?? TONE_ICON[tone]} size={16} className={styles.icon} />
      <div className={styles.content}>
        {hasTitle && <p className={styles.title}>{title}</p>}
        {hasBody && <div className={styles.body}>{children}</div>}
      </div>
      {hasAction && <div className={styles.action}>{action}</div>}
      {onDismiss && <IconButton size="sm" label="Cerrar aviso" icon={<Icon icon={X} size={14} />} onClick={onDismiss} className={styles.dismiss} />}
    </div>
  );
}
