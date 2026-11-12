import { Wrench } from 'lucide-react';
import { useState } from 'react';

import { Button, Icon, TONE_ICON, toast } from '@/components/ui';
import { useDerived, useProjectStore } from '@/lib/store';
import type { Issue, IssueFix, IssueSeverity } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { SEVERITY_LABEL, SEVERITY_ORDER } from './labels';
import styles from './Preflight.module.css';

const TONE: Record<IssueSeverity, 'error' | 'warning' | 'info'> = { error: 'error', warning: 'warning', info: 'info' };

const CHIP_LIMIT = 12;

export interface IssueListProps {
  issues: readonly Issue[];
  onLocatePage: (page: number) => void;
  compact?: boolean;
  grouped?: boolean;
  headingLevel?: 3 | 4;
  className?: string | undefined;
}

export function IssueList({ issues, onLocatePage, compact = false, grouped = true, headingLevel = 3, className }: IssueListProps) {
  if (!grouped) {
    return (
      <ul className={cx(styles.issues, compact && styles.issuesCompact, className)}>
        {issues.map((issue) => (
          <IssueItem key={issue.id} issue={issue} onLocatePage={onLocatePage} compact={compact} />
        ))}
      </ul>
    );
  }
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  return (
    <div className={cx(styles.issueGroups, className)}>
      {SEVERITY_ORDER.map((severity) => {
        const group = issues.filter((issue) => issue.severity === severity);
        if (group.length === 0) return null;
        return (
          <section key={severity} className={styles.issueGroup} aria-label={SEVERITY_LABEL[severity].group}>
            <Heading className={cx(styles.groupHead, styles[`tone-${TONE[severity]}`])}>
              <Icon icon={TONE_ICON[TONE[severity]]} size={14} className={styles.groupIcon} />
              {SEVERITY_LABEL[severity].group}
              <span className={styles.groupCount}>{group.length}</span>
            </Heading>
            <ul className={styles.issues}>
              {group.map((issue) => (
                <IssueItem key={issue.id} issue={issue} onLocatePage={onLocatePage} compact={compact} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function IssueItem({ issue, onLocatePage, compact }: { issue: Issue; onLocatePage: (page: number) => void; compact: boolean }) {
  const tone = TONE[issue.severity];
  const pages = [...new Set(issue.pageNumbers)].sort((a, b) => a - b);
  return (
    <li className={cx(styles.issue, compact && styles.issueCompact, styles[`tone-${tone}`])}>
      <p className={styles.issueTitle}>
        <Icon icon={TONE_ICON[tone]} size={14} className={styles.issueIcon} label={SEVERITY_LABEL[issue.severity].one} />
        <span>{issue.title}</span>
      </p>
      {!compact && <p className={styles.issueDetail}>{issue.detail}</p>}
      {pages.length > 0 && <PageChips pages={pages} limit={compact ? 6 : CHIP_LIMIT} onLocatePage={onLocatePage} />}
      {issue.fix && <FixButton fix={issue.fix} />}
    </li>
  );
}

function PageChips({ pages, limit, onLocatePage }: { pages: number[]; limit: number; onLocatePage: (page: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const setHover = useProjectStore((state) => state.setHover);
  const { imposition } = useDerived();
  const shown = expanded ? pages : pages.slice(0, limit);
  const hidden = pages.length - shown.length;

  const hoverPage = (page: number | null): void => {
    const sheet = page === null ? null : (imposition.placements[page - 1]?.sheetIndex ?? null);
    setHover({ page, sheet });
  };

  return (
    <p className={styles.chips}>
      <span className={styles.chipsLabel}>{pages.length === 1 ? 'Pág.' : 'Págs.'}</span>
      {shown.map((page) => (
        <button
          key={page}
          type="button"
          className={styles.chip}
          aria-label={`Ir a la página ${page}`}
          onClick={() => onLocatePage(page)}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') hoverPage(page);
          }}
          onPointerLeave={() => hoverPage(null)}
          onFocus={() => hoverPage(page)}
          onBlur={() => hoverPage(null)}
        >
          {page}
        </button>
      ))}
      {hidden > 0 && (
        <button type="button" className={cx(styles.chip, styles.chipMore)} onClick={() => setExpanded(true)}>
          +{hidden} más
        </button>
      )}
    </p>
  );
}

function FixButton({ fix }: { fix: IssueFix }) {
  const applyFix = useProjectStore((state) => state.applyFix);
  return (
    <div className={styles.fix}>
      <Button
        size="sm"
        variant="secondary"
        iconStart={<Icon icon={Wrench} size={14} />}
        onClick={() => {
          applyFix(fix);
          toast({ title: `Arreglo aplicado: ${fix.label.charAt(0).toLowerCase()}${fix.label.slice(1)}`, tone: 'success' });
        }}
      >
        {fix.label}
      </Button>
    </div>
  );
}
