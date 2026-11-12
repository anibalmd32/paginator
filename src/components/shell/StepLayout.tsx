import { Fragment, type ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './StepLayout.module.css';

export interface StepLayoutProps {
  title: ReactNode;
  guide?: readonly ReactNode[] | ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  primaryAction?: ReactNode;
  backAction?: ReactNode;
  footerNote?: ReactNode;
  flush?: boolean;
  maxWidth?: string;
  className?: string | undefined;
  bodyClassName?: string | undefined;
}

function isNodeList(value: StepLayoutProps['guide']): value is readonly ReactNode[] {
  return Array.isArray(value);
}

export function StepLayout({ title, guide, actions, children, primaryAction, backAction, footerNote, flush = false, maxWidth, className, bodyClassName }: StepLayoutProps) {
  const fragments = isNodeList(guide) ? guide.filter((part) => part !== null && part !== undefined && part !== false && part !== '') : null;
  const hasGuide = fragments ? fragments.length > 0 : guide !== undefined && guide !== null && guide !== false;
  const hasFooter = primaryAction !== undefined || backAction !== undefined || footerNote !== undefined;
  const bodyStyle = maxWidth ? { maxWidth } : undefined;

  return (
    <section className={cx(styles.layout, className)}>
      <header className={styles.head}>
        <div className={styles.titles}>
          <h1 className={styles.title}>{title}</h1>
          {hasGuide && (
            <p className={styles.guide}>
              {fragments
                ? fragments.map((part, index) => (
                    <Fragment key={index}>
                      {index > 0 && (
                        <span className={styles.dot} aria-hidden="true">
                          ·
                        </span>
                      )}
                      <span className={styles.fragment}>{part}</span>
                    </Fragment>
                  ))
                : (guide as ReactNode)}
            </p>
          )}
        </div>
        {actions !== undefined && actions !== null && <div className={styles.actions}>{actions}</div>}
      </header>

      <div className={cx(styles.body, flush && styles.flush, bodyClassName)}>
        {maxWidth ? (
          <div className={styles.measure} style={bodyStyle}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>

      {hasFooter && (
        <footer className={styles.foot}>
          <div className={styles.footStart}>{backAction}</div>
          <div className={styles.footNote}>{footerNote}</div>
          <div className={styles.footEnd}>{primaryAction}</div>
        </footer>
      )}
    </section>
  );
}
