import type { ReactNode, Ref } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Panel.module.css';

export interface PanelProps {
  id: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
  ref?: Ref<HTMLElement>;
}

export function Panel({ id, title, aside, children, className, ref }: PanelProps) {
  const titleId = `${id}-titulo`;
  return (
    <section ref={ref} className={cx(styles.panel, className)} aria-labelledby={titleId}>
      <header className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {aside !== undefined && aside !== null && aside !== false ? <div className={styles.aside}>{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}
