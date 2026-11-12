import { X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '@/lib/utils/cx';

import { TONE_ICON, type CalloutTone } from './Callout';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import styles from './Toaster.module.css';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: CalloutTone;
  action?: ToastAction;
  duration?: number | null;
  id?: string;
}

interface ToastRecord {
  id: string;
  title: ReactNode;
  description: ReactNode;
  tone: CalloutTone;
  action: ToastAction | null;
  duration: number | null;
}

const DEFAULT_DURATION = 5000;
const MAX_VISIBLE = 4;

let records: readonly ToastRecord[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit(next: readonly ToastRecord[]): void {
  records = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = (): readonly ToastRecord[] => records;
const EMPTY: readonly ToastRecord[] = [];
const getServerSnapshot = (): readonly ToastRecord[] => EMPTY;

function dismiss(id: string): void {
  emit(records.filter((record) => record.id !== id));
}

function showToast(options: ToastOptions): string {
  counter += 1;
  const tone = options.tone ?? 'success';
  const record: ToastRecord = {
    id: options.id ?? `toast-${counter}`,
    title: options.title,
    description: options.description ?? null,
    tone,
    action: options.action ?? null,
    duration: options.duration === undefined ? (tone === 'error' ? null : DEFAULT_DURATION) : options.duration,
  };
  const others = records.filter((existing) => existing.id !== record.id);
  emit([...others, record].slice(-MAX_VISIBLE));
  return record.id;
}

export const toast = Object.assign(showToast, {
  dismiss,
  clear: (): void => emit([]),
});

export interface ToasterProps {
  label?: string;
}

export function Toaster({ label = 'Avisos' }: ToasterProps) {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const polite = list.filter((record) => record.tone !== 'error');
  const assertive = list.filter((record) => record.tone === 'error');
  return createPortal(
    <section className={styles.viewport} aria-label={label}>
      <ol className={styles.stack} aria-live="assertive" aria-relevant="additions">
        {assertive.map((record) => (
          <ToastItem key={record.id} record={record} />
        ))}
      </ol>
      <ol className={styles.stack} aria-live="polite" aria-relevant="additions">
        {polite.map((record) => (
          <ToastItem key={record.id} record={record} />
        ))}
      </ol>
    </section>,
    document.body,
  );
}

function ToastItem({ record }: { record: ToastRecord }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(record.duration);
  const startedAt = useRef(0);

  useEffect(() => {
    remaining.current = record.duration;
  }, [record]);

  useEffect(() => {
    if (paused || remaining.current === null) return;
    startedAt.current = performance.now();
    const timer = window.setTimeout(() => dismiss(record.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      if (remaining.current !== null) remaining.current = Math.max(800, remaining.current - (performance.now() - startedAt.current));
    };
  }, [paused, record]);

  const hasDescription = record.description !== null && record.description !== undefined && record.description !== false;
  return (
    <li
      className={cx(styles.toast, styles[record.tone])}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon icon={TONE_ICON[record.tone]} size={16} className={styles.icon} />
      <div className={styles.content}>
        <p className={styles.title}>{record.title}</p>
        {hasDescription && <p className={styles.description}>{record.description}</p>}
      </div>
      {record.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            record.action?.onClick();
            dismiss(record.id);
          }}
        >
          {record.action.label}
        </button>
      )}
      <IconButton size="sm" label="Cerrar aviso" icon={<Icon icon={X} size={14} />} onClick={() => dismiss(record.id)} className={styles.close} tooltipPlacement="top" />
    </li>
  );
}
