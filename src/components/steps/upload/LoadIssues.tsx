import { useMemo } from 'react';

import { Button, StatusBadge } from '@/components/ui';
import { useDerived } from '@/lib/store';
import type { Issue } from '@/lib/types';

import { LOAD_ISSUE_CODES, orderLoadIssues, plural } from './format';
import styles from './LoadIssues.module.css';
import { Panel } from './Panel';

export interface LoadIssuesProps {
  onShowPage: (pageNumber: number) => void;
  onApplyFix: (issue: Issue) => void;
}

function pagesText(numbers: readonly number[]): string {
  const runs: string[] = [];
  let start: number | null = null;
  let previous: number | null = null;
  const flush = (): void => {
    if (start === null || previous === null) return;
    runs.push(start === previous ? String(start) : `${String(start)}–${String(previous)}`);
  };
  for (const value of [...numbers].sort((a, b) => a - b)) {
    if (previous !== null && value === previous + 1) {
      previous = value;
      continue;
    }
    flush();
    start = value;
    previous = value;
  }
  flush();
  const shown = runs.length > 4 ? [...runs.slice(0, 4), '…'] : runs;
  return `${numbers.length === 1 ? 'Pág.' : 'Págs.'} ${shown.join(', ')}`;
}

export function LoadIssues({ onShowPage, onApplyFix }: LoadIssuesProps) {
  const { issues } = useDerived();
  const own = useMemo(() => orderLoadIssues(issues.filter((issue) => LOAD_ISSUE_CODES.has(issue.code))), [issues]);

  return (
    <Panel
      id="carga-incidencias"
      title="Incidencias de carga"
      aside={own.length > 0 ? `${String(own.length)} ${plural(own.length, 'incidencia', 'incidencias')}` : null}
    >
      {own.length === 0 ? (
        <p className={styles.clean}>
          <StatusBadge tone="success" size="sm">
            Conforme
          </StatusBadge>
          <span>Archivos y segmentación sin incidencias.</span>
        </p>
      ) : (
        <ul className={styles.list}>
          {own.map((issue) => {
            const first = issue.pageNumbers[0];
            return (
              <li key={issue.id} className={styles.issue}>
                <div className={styles.head}>
                  <StatusBadge tone={issue.severity} size="sm" />
                  {first !== undefined ? (
                    <button type="button" className={styles.pages} onClick={() => onShowPage(first)}>
                      {pagesText(issue.pageNumbers)}
                    </button>
                  ) : null}
                </div>
                <p className={styles.title}>{issue.title}</p>
                <p className={styles.detail}>{issue.detail}</p>
                {issue.fix ? (
                  <Button size="sm" variant="secondary" className={styles.fix} onClick={() => onApplyFix(issue)}>
                    {issue.fix.label}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
