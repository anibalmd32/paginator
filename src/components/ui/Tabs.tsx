import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  activation?: 'auto' | 'manual';
  size?: 'sm' | 'md';
  idBase?: string;
  children?: ReactNode;
  className?: string | undefined;
  panelClassName?: string | undefined;
}

export const tabId = (idBase: string, value: string): string => `${idBase}-tab-${value}`;
export const tabPanelId = (idBase: string, value: string): string => `${idBase}-panel-${value}`;

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  activation = 'auto',
  size = 'md',
  idBase,
  children,
  className,
  panelClassName,
}: TabsProps<T>) {
  const autoId = useId();
  const base = idBase ?? autoId;
  const listRef = useRef<HTMLDivElement | null>(null);
  const hasPanel = children !== undefined && children !== null && children !== false;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const enabled = items.filter((item) => !item.disabled);
    const tabs = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? [])];
    const index = tabs.findIndex((tab) => tab === document.activeElement);
    if (index < 0 || enabled.length === 0) return;
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    let next = index;
    if (event.key === 'ArrowRight') next = rtl ? index - 1 : index + 1;
    else if (event.key === 'ArrowLeft') next = rtl ? index + 1 : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    next = (next + tabs.length) % tabs.length;
    tabs[next]?.focus();
    const target = enabled[next];
    if (activation === 'auto' && target) onChange(target.value);
  };

  return (
    <>
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cx(styles.list, size === 'sm' && styles.sm, className)}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={tabId(base, item.value)}
              aria-selected={selected}
              aria-controls={hasPanel && selected ? tabPanelId(base, item.value) : undefined}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              className={styles.tab}
              onClick={() => onChange(item.value)}
            >
              {item.icon}
              <span className={styles.label}>{item.label}</span>
              {item.badge !== undefined && item.badge !== null && <span className={styles.badge}>{item.badge}</span>}
            </button>
          );
        })}
      </div>
      {hasPanel && (
        <div role="tabpanel" id={tabPanelId(base, value)} aria-labelledby={tabId(base, value)} tabIndex={0} className={cx(styles.panel, panelClassName)}>
          {children}
        </div>
      )}
    </>
  );
}
