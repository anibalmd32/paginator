import { useCallback, useRef, type ComponentProps, type KeyboardEvent } from 'react';

import { cx } from '@/lib/utils/cx';

import { mergeRefs } from './refs';
import styles from './Toolbar.module.css';

export interface ToolbarProps extends ComponentProps<'div'> {
  'aria-label': string;
  surface?: 'bar' | 'plain';
}

const ITEMS = 'button, input, select, textarea, [role="button"], [role="slider"]';

const COMPOSITES = '[role="radiogroup"], [role="tablist"], [role="listbox"], [role="slider"]';

function isItem(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest('[data-toolbar-skip]')) return false;
  if (element.matches(':disabled') || element.getAttribute('aria-hidden') === 'true') return false;
  if (element.tabIndex < 0) return false;
  if (element instanceof HTMLInputElement && element.type === 'radio') {
    const group = element.closest('[role="radiogroup"]');
    const radios = group ? [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]:not(:disabled)')] : [element];
    const checked = radios.find((radio) => radio.checked) ?? radios[0];
    return checked === element;
  }
  return element.getClientRects().length > 0;
}

function ownsArrows(element: HTMLElement): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement && element.type !== 'checkbox' && element.type !== 'button') return true;
  return element.closest(COMPOSITES) !== null;
}

export function Toolbar({ surface = 'bar', className, onKeyDown, ref, children, ...rest }: ToolbarProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const items = useCallback((): HTMLElement[] => {
    const root = rootRef.current;
    if (!root) return [];
    return [...root.querySelectorAll(ITEMS)].filter(isItem);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    const known = event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End';
    if (!known || ownsArrows(target)) return;

    const list = items();
    if (list.length === 0) return;
    const index = list.findIndex((item) => item === target || item.contains(target));
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = event.key === 'ArrowRight' ? !rtl : rtl;
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = list.length - 1;
    else next = forward ? (index + 1) % list.length : (index - 1 + list.length) % list.length;
    const element = list[next];
    if (!element) return;
    event.preventDefault();
    element.focus();
  };

  return (
    <div
      ref={mergeRefs(rootRef, ref)}
      role="toolbar"
      aria-orientation="horizontal"
      className={cx(styles.toolbar, surface === 'bar' && styles.bar, className)}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface ToolbarSeparatorProps extends Omit<ComponentProps<'div'>, 'children'> {}

export function ToolbarSeparator({ className, ...rest }: ToolbarSeparatorProps) {
  return <div role="separator" aria-orientation="vertical" className={cx(styles.separator, className)} {...rest} />;
}

export interface ToolbarGroupProps extends ComponentProps<'div'> {}

export function ToolbarGroup({ className, ...rest }: ToolbarGroupProps) {
  return <div role="group" className={cx(styles.group, className)} {...rest} />;
}

export function ToolbarSpacer() {
  return <div className={styles.spacer} aria-hidden="true" />;
}
