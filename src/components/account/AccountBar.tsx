import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/shell';

import styles from './AccountBar.module.css';

export interface AccountBarProps {
  label: string;
  children?: ReactNode;
}

export function AccountBar({ label, children }: AccountBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.identity}>
        <a className={styles.brand} href="/" aria-label="Paginator: volver a la portada">
          <svg className={styles.mark} viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
            <rect x="2" y="2.5" width="8" height="3" rx="0.6" />
            <rect x="2" y="6.5" width="11" height="3" rx="0.6" />
            <rect x="2" y="10.5" width="16" height="3" rx="0.6" />
            <rect x="2" y="14.5" width="16" height="3" rx="0.6" className={styles.markCover} />
          </svg>
          <span className={styles.brandName}>Paginator</span>
        </a>
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.end}>
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}
