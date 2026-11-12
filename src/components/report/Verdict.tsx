import { CircleAlert, CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';

import { Icon, type IconComponent } from '@/components/ui';
import type { IssueCounts } from '@/lib/store';
import type { PreflightVerdict } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { verdictNotes, verdictSentence, verdictTone } from './labels';
import styles from './Preflight.module.css';

const TONE_ICON: Record<ReturnType<typeof verdictTone>, IconComponent> = {
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
  neutral: CircleDashed,
};

export interface VerdictProps {
  verdict: PreflightVerdict;
  counts: IssueCounts;
  hasPages: boolean;
  note?: string | undefined;
  size?: 'sm' | 'md';
  level?: 2 | 3;
  className?: string | undefined;
}

export function Verdict({ verdict, counts, hasPages, note, size = 'md', level = 2, className }: VerdictProps) {
  const tone = verdictTone(verdict, hasPages);
  const Heading = level === 2 ? 'h2' : 'h3';
  const sentence = verdictSentence(verdict, counts, hasPages);
  const line = [note, verdictNotes(counts, hasPages)].filter(Boolean).join(' · ');
  return (
    <div className={cx(styles.verdict, styles[`tone-${tone}`], size === 'sm' && styles.verdictSm, className)}>
      <Icon icon={TONE_ICON[tone]} size={size === 'sm' ? 18 : 22} className={styles.verdictIcon} />
      <div className={styles.verdictBody}>
        <Heading className={styles.verdictTitle}>{sentence}</Heading>
        {line && <p className={styles.verdictNote}>{line}</p>}
      </div>
    </div>
  );
}
