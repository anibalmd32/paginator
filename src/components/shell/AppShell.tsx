import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui/Toaster';
import { cx } from '@/lib/utils/cx';

import styles from './AppShell.module.css';

export interface AppShellProps {
  header: ReactNode;
  children: ReactNode;
  toaster?: boolean;
  className?: string | undefined;
}

export const WORK_AREA_ID = 'area-de-trabajo';

export function AppShell({ header, children, toaster = true, className }: AppShellProps) {
  return (
    <div className={cx(styles.shell, className)}>
      <a className={styles.skip} href={`#${WORK_AREA_ID}`}>
        Saltar al trabajo
      </a>
      {header}
      <main id={WORK_AREA_ID} className={styles.work} tabIndex={-1}>
        {children}
      </main>
      {toaster && <Toaster />}
    </div>
  );
}
