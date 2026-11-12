import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './FormSection.module.css';

export interface FormSectionProps extends Omit<ComponentProps<'fieldset'>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  divided?: boolean;
}

export function FormSection({ title, description, aside, divided = false, className, children, ...rest }: FormSectionProps) {
  const hasDescription = description !== undefined && description !== null && description !== false;
  const hasAside = aside !== undefined && aside !== null && aside !== false;
  return (
    <fieldset className={cx(styles.section, divided && styles.divided, className)} {...rest}>
      <legend className={styles.legend}>
        <span className={styles.title}>{title}</span>
        {hasAside && <span className={styles.aside}>{aside}</span>}
      </legend>
      {hasDescription && <p className={styles.description}>{description}</p>}
      <div className={styles.body}>{children}</div>
    </fieldset>
  );
}
