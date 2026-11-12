import { Check } from 'lucide-react';
import { useSyncExternalStore, type CSSProperties } from 'react';

import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';
import { cx } from '@/lib/utils/cx';

import styles from './StepTabs.module.css';

export interface StepTabItem {
  id: number;
  label: string;
  done?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export interface StepTabsProps {
  steps: readonly StepTabItem[];
  current: number;
  onSelect: (id: number) => void;
  'aria-label'?: string;
  className?: string | undefined;
}

const COMPACT_QUERY = '(max-width: 1279px)';

function subscribeCompact(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(COMPACT_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const isCompact = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_QUERY).matches;

export function StepTabs({ steps, current, onSelect, 'aria-label': ariaLabel = 'Pasos del trabajo', className }: StepTabsProps) {
  const compact = useSyncExternalStore(subscribeCompact, isCompact, () => false);

  return (
    <nav aria-label={ariaLabel} className={cx(styles.nav, className)}>
      <ol className={styles.list}>
        {steps.map((step, index) => {
          const active = step.id === current;
          const blocked = Boolean(step.disabled) && !active;
          const done = Boolean(step.done);
          const tip = blocked ? (step.disabledReason ?? 'Aún no disponible') : compact && !active ? step.label : null;
          return (
            <li key={step.id} className={styles.item} style={{ '--step-index': index } as CSSProperties}>
              <Tooltip content={tip} placement="bottom" semantics={blocked ? 'description' : 'label'}>
                <button
                  type="button"
                  className={styles.tab}
                  data-active={active ? '' : undefined}
                  data-done={done ? '' : undefined}
                  aria-current={active ? 'step' : undefined}
                  aria-disabled={blocked ? true : undefined}
                  onClick={() => {
                    if (!blocked && !active) onSelect(step.id);
                  }}
                >
                  <span className={styles.number} aria-hidden="true">
                    {step.id}
                  </span>
                  <span className={cx(styles.label, compact && !active && 'visually-hidden')}>
                    <span className="visually-hidden">Paso {step.id}: </span>
                    {step.label}
                    {done && <span className="visually-hidden"> (hecho)</span>}
                  </span>
                  {done && <Icon icon={Check} size={14} className={styles.check} />}
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
