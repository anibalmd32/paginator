import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './EmptyState.module.css';
import { Icon, type IconComponent } from './Icon';

export interface EmptyStateProps extends Omit<ComponentProps<'div'>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  illustration?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, description, icon, illustration, actions, footnote, compact = false, className, ...rest }: EmptyStateProps) {
  const hasIllustration = illustration !== undefined && illustration !== null && illustration !== false;
  return (
    <div className={cx(styles.empty, compact && styles.compact, className)} {...rest}>
      {hasIllustration ? (
        <div className={styles.illustration} aria-hidden="true">
          {illustration}
        </div>
      ) : (
        icon && (
          <div className={styles.icon}>
            <Icon icon={icon} size={compact ? 18 : 22} />
          </div>
        )
      )}
      <p className={styles.title}>{title}</p>
      {description !== undefined && description !== null && <p className={styles.description}>{description}</p>}
      {actions !== undefined && actions !== null && <div className={styles.actions}>{actions}</div>}
      {footnote !== undefined && footnote !== null && <p className={styles.footnote}>{footnote}</p>}
    </div>
  );
}
