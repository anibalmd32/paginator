import { Pencil } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/utils/cx';

import styles from './AppHeader.module.css';
import { StepTabs, type StepTabItem } from './StepTabs';
import { ThemeToggle } from './ThemeToggle';

export interface AppHeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  steps: readonly StepTabItem[];
  currentStep: number;
  onSelectStep: (id: number) => void;
  statusSlot?: ReactNode;
  titlePlaceholder?: string;
  className?: string | undefined;
}

export function AppHeader({ title, onTitleChange, steps, currentStep, onSelectStep, statusSlot, titlePlaceholder = 'Trabajo sin nombre', className }: AppHeaderProps) {
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  const commit = (): void => {
    setEditing(false);
    const next = draft.trim().replace(/\s+/g, ' ');
    if (next === '' || next === title) {
      setDraft(title);
      return;
    }
    onTitleChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setDraft(title);
      setEditing(false);
      requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
    }
  };

  return (
    <header className={cx(styles.header, className)}>
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
        <label className={styles.titleBox}>
          <span className="visually-hidden">Nombre del trabajo</span>
          <input
            className={styles.title}
            value={draft}
            placeholder={titlePlaceholder}
            spellCheck={false}
            autoComplete="off"
            maxLength={120}
            size={Math.max(8, Math.min(32, (draft || titlePlaceholder).length))}
            onFocus={(event) => {
              setEditing(true);
              event.currentTarget.select();
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
          />
          <Icon icon={Pencil} size={12} className={styles.pencil} />
        </label>
      </div>

      <StepTabs steps={steps} current={currentStep} onSelect={onSelectStep} className={styles.steps} />

      <div className={styles.end}>
        {statusSlot}
        <ThemeToggle />
      </div>
    </header>
  );
}
