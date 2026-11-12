import { ChevronDown, CircleAlert, CircleCheck, CircleDashed, Info, TriangleAlert } from 'lucide-react';
import type { ComponentProps } from 'react';

import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/utils/cx';

import styles from './PreflightChip.module.css';

export interface PreflightChipProps extends Omit<ComponentProps<'button'>, 'children'> {
  errors: number;
  warnings: number;
  infos?: number;
  ok: boolean;
  compact?: boolean;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export function preflightSummaryText({ errors, warnings, infos = 0, ok }: Pick<PreflightChipProps, 'errors' | 'warnings' | 'infos' | 'ok'>): string {
  if (errors === 0 && warnings === 0) {
    if (!ok) return 'Pre-vuelo pendiente';
    return infos > 0 ? `Pre-vuelo conforme, ${plural(infos, 'nota', 'notas')}` : 'Pre-vuelo conforme';
  }
  const parts = [errors > 0 ? plural(errors, 'error', 'errores') : null, warnings > 0 ? plural(warnings, 'aviso', 'avisos') : null].filter(Boolean);
  return `Pre-vuelo: ${parts.join(' y ')}`;
}

export function PreflightChip({ errors, warnings, infos = 0, ok, compact = false, className, type = 'button', ...rest }: PreflightChipProps) {
  const clean = errors === 0 && warnings === 0;
  const verdict = errors > 0 ? 'errors' : warnings > 0 ? 'warnings' : ok ? 'ok' : 'idle';
  return (
    <button type={type} className={cx(styles.chip, compact && styles.compact, className)} data-verdict={verdict} aria-label={preflightSummaryText({ errors, warnings, infos, ok })} {...rest}>
      <span className={styles.name}>Pre-vuelo</span>
      {clean ? (
        <span className={cx(styles.count, ok ? styles.ok : styles.idle)}>
          <Icon icon={ok ? CircleCheck : CircleDashed} size={14} />
          <span className={styles.word}>{ok ? 'Conforme' : 'Pendiente'}</span>
        </span>
      ) : (
        <>
          {errors > 0 && (
            <span className={cx(styles.count, styles.error)}>
              <Icon icon={CircleAlert} size={14} />
              <span className={styles.figure}>{errors}</span>
              <span className={styles.word}>{errors === 1 ? 'error' : 'errores'}</span>
            </span>
          )}
          {warnings > 0 && (
            <span className={cx(styles.count, styles.warning)}>
              <Icon icon={TriangleAlert} size={14} />
              <span className={styles.figure}>{warnings}</span>
              <span className={styles.word}>{warnings === 1 ? 'aviso' : 'avisos'}</span>
            </span>
          )}
        </>
      )}
      {infos > 0 && !compact && (
        <span className={cx(styles.count, styles.info)}>
          <Icon icon={Info} size={14} />
          <span className={styles.figure}>{infos}</span>
        </span>
      )}
      <Icon icon={ChevronDown} size={14} className={styles.chevron} />
    </button>
  );
}
